import { Reminder } from './types';

/** Computes the next fire Date for a reminder, for sorting/display purposes only.
 * (Actual firing is handled natively by the OS via the scheduled notification.) */
export function getNextOccurrence(reminder: Reminder): Date {
  const [hour, minute] = reminder.time.split(':').map(Number);
  const now = new Date();

  if (reminder.repeat === 'once') {
    const d = new Date(`${reminder.date}T00:00:00`);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  if (reminder.repeat === 'daily') {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  // weekly
  const anchor = new Date(`${reminder.date}T00:00:00`);
  const targetDow = anchor.getDay();
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  let diff = (targetDow - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= now.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatRelativeDay(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  if (diffDays > 1 && diffDays < 7) return weekday;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function repeatLabel(repeat: Reminder['repeat']): string {
  switch (repeat) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Once';
  }
}

export function sortReminders(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return getNextOccurrence(a).getTime() - getNextOccurrence(b).getTime();
  });
}
