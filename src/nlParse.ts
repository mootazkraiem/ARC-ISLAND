import { Category, RepeatMode } from './types';

export interface ParsedQuickAdd {
  title: string;
  date: string; // ISO YYYY-MM-DD
  time: string; // HH:mm
  repeat: RepeatMode;
  category: Category;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toHHmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const CATEGORY_HINTS: [RegExp, Category][] = [
  [/\b(work|meeting|call|email|deadline|report|standup|client)\b/i, 'work'],
  [/\b(gym|workout|run|doctor|dentist|medicine|pill|water|sleep|stretch|walk)\b/i, 'health'],
  [/\b(buy|pick up|pickup|groceries|shop|store|pay|bill|errand|drop off)\b/i, 'errand'],
];

/** Best-effort natural-language quick add parser. Always hands back something
 * reasonable (defaults to "today, 5 minutes from now, once") so the caller can
 * show it in the editor for the user to confirm/correct rather than guessing
 * silently. This is what stands in for "voice" — dictate into the field with
 * your keyboard's mic button and this does the splitting. */
export function parseQuickAdd(raw: string): ParsedQuickAdd {
  let text = raw.trim();
  const now = new Date();

  let repeat: RepeatMode = 'once';
  if (/\bevery\s*day\b|\bdaily\b/i.test(text)) {
    repeat = 'daily';
    text = text.replace(/\bevery\s*day\b|\bdaily\b/gi, '');
  } else if (/\bevery\s*week\b|\bweekly\b|\bevery\s+(sun|mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?)\w*day\b/i.test(text)) {
    repeat = 'weekly';
    text = text.replace(/\bevery\s*week\b|\bweekly\b/gi, '');
  }

  // Relative minutes/hours: "in 20 minutes", "in 2 hours"
  let target = new Date(now);
  let matchedTime = false;
  const inMatch = text.match(/\bin\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    target = new Date(now.getTime() + amount * (unit.startsWith('h') ? 3600000 : 60000));
    matchedTime = true;
    text = text.replace(inMatch[0], '');
  }

  // Day words
  if (/\btomorrow\b/i.test(text)) {
    target.setDate(now.getDate() + 1);
    text = text.replace(/\btomorrow\b/gi, '');
  } else if (/\btoday\b|\btonight\b/i.test(text)) {
    text = text.replace(/\btoday\b|\btonight\b/gi, '');
  } else {
    const weekdayMatch = text.match(
      /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
    );
    if (weekdayMatch) {
      const wantedDow = WEEKDAYS.indexOf(weekdayMatch[2].toLowerCase());
      let diff = (wantedDow - now.getDay() + 7) % 7;
      if (diff === 0 || weekdayMatch[1]) diff = diff === 0 ? 7 : diff;
      target.setDate(now.getDate() + diff);
      text = text.replace(weekdayMatch[0], '');
      if (repeat === 'once' && /\bevery\b/i.test(raw)) repeat = 'weekly';
    }
  }

  // Clock time: "10pm", "10:30 pm", "22:00", "at 9"
  const timeMatch = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch && !inMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const suffix = timeMatch[3]?.toLowerCase();
    if (suffix === 'pm' && h < 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    if (!suffix && h <= 7) h += 12; // "walk the dog at 8" -> assume evening for small hours w/o am/pm
    if (h <= 23 && m <= 59) {
      target.setHours(h, m, 0, 0);
      matchedTime = true;
      text = text.replace(timeMatch[0], '');
    }
  }

  if (!matchedTime) {
    // No time found at all — default to 5 minutes from now so it's still useful.
    target = new Date(now.getTime() + 5 * 60000);
  } else if (repeat === 'once' && target.getTime() < now.getTime()) {
    // e.g. "6pm" said at 9pm with no day word — roll to tomorrow.
    target.setDate(target.getDate() + 1);
  }

  // Clean filler words out of the remaining title text.
  text = text
    .replace(/\bremind me to\b/gi, '')
    .replace(/\bremind me\b/gi, '')
    .replace(/^\s*(to|that|i need to|i have to)\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim();

  if (!text) text = raw.trim();
  text = text.charAt(0).toUpperCase() + text.slice(1);

  let category: Category = 'personal';
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(raw)) {
      category = cat;
      break;
    }
  }

  return {
    title: text,
    date: toISODate(target),
    time: toHHmm(target.getHours(), target.getMinutes()),
    repeat,
    category,
  };
}
