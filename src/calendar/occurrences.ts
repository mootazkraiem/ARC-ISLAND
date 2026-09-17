import { Reminder } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Quest Calendar — the projection layer.
//
// CRITICAL ARCHITECTURAL RULE: this module creates NO new data model. There
// is exactly one source of truth for a quest — the Reminder record in
// src/storage.ts — and everything here is a pure, derived, throwaway view
// over that array for a given date range. A QuestOccurrence is not stored,
// not persisted, and not editable on its own; it always carries the
// reminder it came from, and every edit the calendar performs goes back
// through App.tsx's existing applyReminderUpdate path so the notification
// engine re-syncs exactly as it does for an edit made in the editor.
//
// A repeating quest (daily/weekly) legitimately appears on many days. Each
// of those appearances is one QuestOccurrence sharing the same reminder.id
// but carrying its own `key` (id + date), which is what the calendar uses
// for React keys and drag targets.
// ─────────────────────────────────────────────────────────────────────────

/** Fallback block length for quests created before durations existed, and
 * for anything the System schedules without an explicit length. */
export const DEFAULT_QUEST_MINUTES = 45;
export const MIN_QUEST_MINUTES = 15;
export const MAX_QUEST_MINUTES = 12 * 60;

export type OccurrenceState = 'completed' | 'active' | 'overdue' | 'upcoming' | 'dormant';

export interface QuestOccurrence {
  /** Unique per rendered block: `${reminder.id}@${dateISO}`. */
  key: string;
  reminder: Reminder;
  /** The calendar day this block sits on, YYYY-MM-DD. */
  dateISO: string;
  /** Minutes from midnight — the block's vertical position. */
  startMin: number;
  /** Block length in minutes. */
  durationMin: number;
  /** Real Date for the block's start, for comparisons/formatting. */
  start: Date;
  state: OccurrenceState;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function timeFromMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Monday-based week start — the Quest Calendar's week runs MON→SUN. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay(); // 0 = Sunday
  const delta = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + delta);
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Does this reminder occur on this specific calendar day? Mirrors the
 * repeat semantics the notification engine already uses (see
 * src/notifications.ts buildTrigger) so the calendar can never disagree
 * with what will actually fire:
 *   once   — only on its anchor date
 *   daily  — every day from its anchor date onward
 *   weekly — same weekday as its anchor, from the anchor onward
 */
export function occursOn(reminder: Reminder, day: Date): boolean {
  const anchor = fromISODate(reminder.date);
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);

  if (reminder.repeat === 'once') return isSameDay(anchor, d);
  // A repeating quest does not retroactively appear before the day it was
  // anchored to — otherwise every daily quest would backfill the user's
  // entire history the moment they created it.
  if (d.getTime() < anchor.getTime()) return false;
  if (reminder.repeat === 'daily') return true;
  return anchor.getDay() === d.getDay();
}

export interface OccurrenceOptions {
  /** reminder.id → the ISO date it was last completed on. Comes straight
   * from Progression's lastCompletedDate map. */
  completedDates?: Record<string, string>;
  /** Treated as "now" for active/overdue classification. Injectable so the
   * calendar can be reasoned about in tests without faking the clock. */
  now?: Date;
  /** Include quests whose `enabled` flag is off. They render dormant. */
  includeDisabled?: boolean;
}

function classify(
  reminder: Reminder,
  start: Date,
  durationMin: number,
  dateISO: string,
  opts: OccurrenceOptions
): OccurrenceState {
  const now = opts.now ?? new Date();
  if (!reminder.enabled) return 'dormant';
  if (opts.completedDates?.[reminder.id] === dateISO) return 'completed';
  const end = new Date(start.getTime() + durationMin * 60000);
  if (now >= start && now < end) return 'active';
  if (now >= end) return 'overdue';
  return 'upcoming';
}

/** Every occurrence falling on a single day, sorted by start time. */
export function occurrencesForDay(
  reminders: Reminder[],
  day: Date,
  opts: OccurrenceOptions = {}
): QuestOccurrence[] {
  const dateISO = toISODate(day);
  const out: QuestOccurrence[] = [];

  for (const r of reminders) {
    if (!r.enabled && !opts.includeDisabled) continue;
    if (!occursOn(r, day)) continue;

    const startMin = minutesOf(r.time);
    const durationMin = clampDuration(r.durationMin ?? DEFAULT_QUEST_MINUTES);
    const start = fromISODate(dateISO);
    start.setMinutes(startMin);

    out.push({
      key: `${r.id}@${dateISO}`,
      reminder: r,
      dateISO,
      startMin,
      durationMin,
      start,
      state: classify(r, start, durationMin, dateISO, opts),
    });
  }

  return out.sort((a, b) => a.startMin - b.startMin || a.reminder.title.localeCompare(b.reminder.title));
}

/** Occurrences across an inclusive range of days, keyed by ISO date. */
export function occurrencesInRange(
  reminders: Reminder[],
  from: Date,
  days: number,
  opts: OccurrenceOptions = {}
): Record<string, QuestOccurrence[]> {
  const out: Record<string, QuestOccurrence[]> = {};
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    out[toISODate(day)] = occurrencesForDay(reminders, day, opts);
  }
  return out;
}

export function clampDuration(min: number): number {
  return Math.max(MIN_QUEST_MINUTES, Math.min(MAX_QUEST_MINUTES, Math.round(min)));
}

// ── Overlap / conflict geometry ──────────────────────────────────────────
// Two quests conflict when their blocks intersect in time on the same day.
// The calendar needs two things from this: a boolean (show the conflict
// marking) and a LANE ASSIGNMENT so overlapping blocks render side by side
// instead of stacking invisibly on top of each other.

export interface LaidOutOccurrence extends QuestOccurrence {
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** How many columns that cluster needs. */
  laneCount: number;
  /** True when this block intersects at least one other block. */
  conflict: boolean;
}

/** Greedy interval-partition layout. Occurrences must already be sorted by
 * startMin (occurrencesForDay guarantees that). */
export function layoutDay(occs: QuestOccurrence[]): LaidOutOccurrence[] {
  const out: LaidOutOccurrence[] = [];
  // A cluster is a maximal run of blocks connected by overlap. Lane counts
  // are shared across the whole cluster so columns line up visually.
  let cluster: QuestOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned: { occ: QuestOccurrence; lane: number }[] = [];

    for (const occ of cluster) {
      const end = occ.startMin + occ.durationMin;
      let lane = laneEnds.findIndex((e) => e <= occ.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      assigned.push({ occ, lane });
    }

    const laneCount = laneEnds.length;
    for (const { occ, lane } of assigned) {
      out.push({ ...occ, lane, laneCount, conflict: laneCount > 1 });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const occ of occs) {
    const end = occ.startMin + occ.durationMin;
    if (cluster.length > 0 && occ.startMin >= clusterEnd) flush();
    cluster.push(occ);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return out.sort((a, b) => a.startMin - b.startMin || a.lane - b.lane);
}

/** Pairs of occurrences that overlap on the given day — used by the System
 * to report conflicts in words ("Your schedule contains a conflict"). */
export function findConflicts(occs: QuestOccurrence[]): [QuestOccurrence, QuestOccurrence][] {
  const pairs: [QuestOccurrence, QuestOccurrence][] = [];
  for (let i = 0; i < occs.length; i++) {
    for (let j = i + 1; j < occs.length; j++) {
      const a = occs[i];
      const b = occs[j];
      if (a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** Contiguous unscheduled windows on a day, within working bounds. The
 * System uses this for "I detected an opening in your schedule." */
export function findOpenings(
  occs: QuestOccurrence[],
  fromMin = 8 * 60,
  toMin = 22 * 60,
  minLength = 45
): { startMin: number; endMin: number }[] {
  const busy = occs
    .map((o) => ({ s: o.startMin, e: o.startMin + o.durationMin }))
    .sort((a, b) => a.s - b.s);

  const gaps: { startMin: number; endMin: number }[] = [];
  let cursor = fromMin;
  for (const b of busy) {
    if (b.e <= fromMin || b.s >= toMin) continue;
    if (b.s - cursor >= minLength) gaps.push({ startMin: cursor, endMin: b.s });
    cursor = Math.max(cursor, b.e);
  }
  if (toMin - cursor >= minLength) gaps.push({ startMin: cursor, endMin: toMin });
  return gaps;
}

export const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function formatHour(hour: number): string {
  if (hour === 0) return '12A';
  if (hour === 12) return '12P';
  return hour < 12 ? `${hour}A` : `${hour - 12}P`;
}
