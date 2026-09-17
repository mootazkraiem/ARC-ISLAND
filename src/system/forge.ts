import { Category, Reminder, ReminderDraft, RepeatMode } from '../types';
import {
  DEFAULT_QUEST_MINUTES,
  QuestOccurrence,
  clampDuration,
  findConflicts,
  fromISODate,
  minutesOf,
  occurrencesForDay,
  toISODate,
} from '../calendar/occurrences';

// ─────────────────────────────────────────────────────────────────────────
// FORGE MY WEEK — the overnight System session.
//
// The hard rule this module exists to enforce: THE SYSTEM NEVER WRITES
// SILENTLY. The model can only ever produce a WeekProposal, which is inert
// — it is not a reminder, it is not persisted to the reminder store, and it
// schedules no notification. It renders as phantom blocks in the Quest
// Calendar. Only an explicit user ACCEPT converts proposed blocks into real
// quests, and that conversion goes through the same onCreate path every
// other quest creation uses, so there is still exactly one write path and
// one source of truth.
//
// Rejecting a proposal discards it entirely and touches nothing. Editing a
// proposal edits the inert copy, never live data. Existing quests are never
// moved or deleted by a forge — a proposal can only ADD. That is the
// "do not silently destroy existing user data" guarantee, enforced
// structurally rather than by asking the model nicely.
// ─────────────────────────────────────────────────────────────────────────

export interface ForgeBlock {
  /** Local id for the proposal only — never becomes the reminder's id. */
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm 24h */
  time: string;
  durationMin: number;
  category: Category;
  repeat: RepeatMode;
  /** One short line on why the System placed it here. Shown in review. */
  rationale?: string;
  /** Set when this block collides with an already-existing quest. The user
   * still decides what to do about it; the System only flags it. */
  collides?: boolean;
}

export interface WeekProposal {
  id: string;
  /** The System's one-line framing, e.g. "Built around your Thursday
   * deadline, with Saturday evening left clear." */
  summary: string;
  blocks: ForgeBlock[];
  createdAt: number;
  /** Monday of the week this proposal covers, for the calendar to jump to. */
  weekAnchor: string;
}

let seq = 0;
function blockId(): string {
  seq += 1;
  return `fb-${Date.now().toString(36)}-${seq}`;
}

export function isISODate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isHHmm(v: unknown): v is string {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
}

const CATEGORIES: Category[] = ['personal', 'work', 'health', 'errand', 'other'];
const REPEATS: RepeatMode[] = ['once', 'daily', 'weekly'];

/** Normalizes whatever the model produced into a safe, inert proposal.
 * Anything malformed is dropped rather than guessed at — a proposal with
 * a bad date would otherwise become a real quest at a wrong time on
 * accept. */
export function buildProposal(
  rawBlocks: unknown,
  summary: string,
  existing: Reminder[]
): { proposal: WeekProposal | null; rejected: number } {
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return { proposal: null, rejected: 0 };
  }

  const blocks: ForgeBlock[] = [];
  let rejected = 0;

  for (const raw of rawBlocks) {
    const b = raw as Record<string, unknown>;
    const title = String(b.title ?? '').trim();
    if (!title || !isISODate(b.date) || !isHHmm(b.time)) {
      rejected += 1;
      continue;
    }
    blocks.push({
      id: blockId(),
      title,
      date: b.date,
      time: b.time,
      durationMin: clampDuration(
        typeof b.durationMin === 'number' ? b.durationMin : DEFAULT_QUEST_MINUTES
      ),
      category: CATEGORIES.includes(b.category as Category) ? (b.category as Category) : 'personal',
      repeat: REPEATS.includes(b.repeat as RepeatMode) ? (b.repeat as RepeatMode) : 'once',
      rationale: typeof b.rationale === 'string' ? b.rationale.slice(0, 120) : undefined,
    });
  }

  if (blocks.length === 0) return { proposal: null, rejected };

  blocks.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const withCollisions = markCollisions(blocks, existing);

  // Anchor the calendar on the earliest proposed day's week.
  const earliest = withCollisions[0].date;

  return {
    proposal: {
      id: `fp-${Date.now().toString(36)}`,
      summary: summary.trim() || 'Proposed week.',
      blocks: withCollisions,
      createdAt: Date.now(),
      weekAnchor: earliest,
    },
    rejected,
  };
}

/** Flags proposed blocks that overlap an existing quest, and blocks that
 * overlap each other. Purely advisory — nothing is auto-moved. */
export function markCollisions(blocks: ForgeBlock[], existing: Reminder[]): ForgeBlock[] {
  return blocks.map((b) => {
    const day = fromISODate(b.date);
    const bStart = minutesOf(b.time);
    const bEnd = bStart + b.durationMin;

    const existingHit = occurrencesForDay(existing, day).some(
      (o) => bStart < o.startMin + o.durationMin && o.startMin < bEnd
    );

    const siblingHit = blocks.some((other) => {
      if (other.id === b.id || other.date !== b.date) return false;
      const oStart = minutesOf(other.time);
      return bStart < oStart + other.durationMin && oStart < bEnd;
    });

    return { ...b, collides: existingHit || siblingHit };
  });
}

/** Renders proposal blocks as calendar occurrences so the Quest Calendar
 * can draw them with the exact same geometry as real quests. These carry a
 * synthetic Reminder that is NEVER saved — it exists only so the grid has
 * something with the right shape to lay out. */
export function proposalOccurrences(proposal: WeekProposal | null): QuestOccurrence[] {
  if (!proposal) return [];
  return proposal.blocks.map((b) => {
    const start = fromISODate(b.date);
    const startMin = minutesOf(b.time);
    start.setMinutes(startMin);
    const phantom: Reminder = {
      id: `proposal:${b.id}`,
      title: b.title,
      date: b.date,
      time: b.time,
      durationMin: b.durationMin,
      repeat: b.repeat,
      enabled: true,
      category: b.category,
      notificationId: null,
      createdAt: 0,
    };
    return {
      key: `proposal:${b.id}`,
      reminder: phantom,
      dateISO: b.date,
      startMin,
      durationMin: b.durationMin,
      start,
      state: 'upcoming' as const,
    };
  });
}

export function blockToDraft(b: ForgeBlock): ReminderDraft {
  return {
    title: b.title,
    date: b.date,
    time: b.time,
    durationMin: b.durationMin,
    repeat: b.repeat,
    category: b.category,
    enabled: true,
  };
}

/** Human-readable conflict report for the current schedule — the System
 * uses this to say "Your schedule contains a conflict" with specifics
 * instead of vaguely. */
export function describeConflicts(reminders: Reminder[], from: Date, days = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(from);
    day.setDate(day.getDate() + i);
    const occs = occurrencesForDay(reminders, day);
    for (const [a, b] of findConflicts(occs)) {
      out.push(
        `${day.toLocaleDateString(undefined, { weekday: 'long' })}: "${a.reminder.title}" overlaps "${b.reminder.title}"`
      );
    }
  }
  return out;
}

export function proposalStats(proposal: WeekProposal) {
  const days = new Set(proposal.blocks.map((b) => b.date));
  const collisions = proposal.blocks.filter((b) => b.collides).length;
  const totalMin = proposal.blocks.reduce((s, b) => s + b.durationMin, 0);
  return { count: proposal.blocks.length, days: days.size, collisions, totalMin };
}

export { toISODate };
