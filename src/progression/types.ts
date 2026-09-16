// ─────────────────────────────────────────────────────────────────────────
// Progression domain model.
//
// This module is intentionally independent of the reminder engine. It has
// no idea how notifications are scheduled, how storage for reminders works,
// or how the UI is laid out. It only knows how to react to a single fact —
// "this reminder was completed" — and turn that into XP, skill growth,
// streak bookkeeping, and card unlocks.
//
// Event flow (see engine.ts):
//   ReminderCompleted → ProgressionEngine.recordCompletion()
//     → XP calculation (xpRules.ts)
//     → skill accumulation
//     → streak update
//     → card unlock evaluation (cardDefinitions.ts)
//     → persisted snapshot + CompletionResult returned to the caller
//
// Nothing here reaches back into the reminder engine or the UI — callers
// (App.tsx, the assistant tools) push events in and read results out.
// ─────────────────────────────────────────────────────────────────────────

import { Category } from '../types';

export type SkillId =
  | 'discipline'
  | 'focus'
  | 'fitness'
  | 'learning'
  | 'organization'
  | 'social'
  | 'creativity'
  | 'health'
  | 'personal';

export const SKILL_ORDER: SkillId[] = [
  'discipline',
  'focus',
  'fitness',
  'learning',
  'organization',
  'social',
  'creativity',
  'health',
  'personal',
];

export const SKILL_META: Record<SkillId, { label: string; glyph: string }> = {
  discipline: { label: 'Discipline', glyph: '◆' },
  focus: { label: 'Focus', glyph: '◈' },
  fitness: { label: 'Fitness', glyph: '▲' },
  learning: { label: 'Learning', glyph: '◇' },
  organization: { label: 'Organization', glyph: '▣' },
  social: { label: 'Social', glyph: '◐' },
  creativity: { label: 'Creativity', glyph: '✦' },
  health: { label: 'Health', glyph: '✚' },
  personal: { label: 'Personal', glyph: '●' },
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Rarity tiers reuse the same four accent hues as the rest of the design
// system (plus neutral for common) rather than a fifth ad-hoc palette —
// consistent with the approved design's "glow is earned" rule.
export const RARITY_META: Record<Rarity, { label: string; color: string; unlockXp: number }> = {
  common: { label: 'Common', color: '#8A8AA3', unlockXp: 15 },
  uncommon: { label: 'Uncommon', color: '#37E1B4', unlockXp: 30 },
  rare: { label: 'Rare', color: '#7C5CFF', unlockXp: 60 },
  epic: { label: 'Epic', color: '#FF7A59', unlockXp: 120 },
  legendary: { label: 'Legendary', color: '#FFC65C', unlockXp: 250 },
};

export type CardKind = 'milestone' | 'achievement' | 'streak' | 'skill';

/** One completed reminder, as far as the progression engine needs to know. */
export interface CompletionEvent {
  reminderId: string;
  title: string;
  category: Category;
  /** The local Date this completion is attributed to. */
  at: Date;
}

export interface DailyLogEntry {
  date: string; // YYYY-MM-DD
  xpEarned: number;
  skillXp: Partial<Record<SkillId, number>>;
  completedReminderIds: string[];
  unlockedCardIds: string[];
}

export interface UserProgress {
  totalXp: number;
  skillXp: Record<SkillId, number>;
  completedCount: number;
  /** reminderId -> last YYYY-MM-DD it granted XP, to stop same-day double dipping. */
  lastCompletedDate: Record<string, string>;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  hadStreakBreakAfterThree: boolean;
  earlyCompletions: number; // before 09:00
  nightCompletions: number; // after 22:00
  categoryHistory: Partial<Record<Category, number>>;
  /** Rolling log, newest last, capped at ~60 entries. */
  dailyLog: DailyLogEntry[];
  unlockedCards: Record<string, string>; // cardId -> ISO unlock timestamp
  /** Last date (YYYY-MM-DD) the day-recap modal was shown, to show it once per day. */
  lastSummaryShownDate: string | null;
}

export function createInitialProgress(): UserProgress {
  const skillXp = SKILL_ORDER.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<SkillId, number>);

  return {
    totalXp: 0,
    skillXp,
    completedCount: 0,
    lastCompletedDate: {},
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    hadStreakBreakAfterThree: false,
    earlyCompletions: 0,
    nightCompletions: 0,
    categoryHistory: {},
    dailyLog: [],
    unlockedCards: {},
    lastSummaryShownDate: null,
  };
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
  xpTotal: number;
}

export interface CompletionResult {
  xpGained: number;
  skillGains: Partial<Record<SkillId, number>>;
  leveledUp: boolean;
  newLevel: LevelInfo;
  newStreak: number;
  streakExtended: boolean;
  unlockedCards: CardUnlockInfo[];
  alreadyCompletedToday: boolean;
}

export interface CardUnlockInfo {
  id: string;
  title: string;
  rarity: Rarity;
}

export interface CardProgress {
  current: number;
  target: number;
}

export interface CardDefinition {
  id: string;
  title: string;
  /** Shown once unlocked. */
  description: string;
  /** Shown while locked — deliberately vague, invites discovery. */
  lockedHint: string;
  rarity: Rarity;
  kind: CardKind;
  skill?: SkillId;
  /** Cards flagged here are eligible to surface as an active "challenge". */
  challengeEligible?: boolean;
  /** Plain-language goal shown only in the Challenges section — the
   * Collection archive still shows these cards as mysteries until unlocked. */
  goalText?: string;
  getProgress: (p: UserProgress) => CardProgress;
}
