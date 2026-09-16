// ─────────────────────────────────────────────────────────────────────────
// The progression engine — a small, self-contained store.
//
// This is the ONLY place that mutates UserProgress. Everything else (UI
// screens, the assistant tools) calls recordCompletion() and reads the
// result, or calls getSnapshot() to render. This keeps the event flow
// honest:
//
//   ReminderCompleted → recordCompletion() → xpRules → card evaluation
//     → persisted → CompletionResult handed back to the caller
//
// It knows nothing about React. UI layers subscribe() to be notified when
// the snapshot changes, and re-render from getSnapshot().
// ─────────────────────────────────────────────────────────────────────────

import { CARD_DEFINITIONS } from './cardDefinitions';
import { levelFromTotalXp } from './levels';
import { loadProgress, saveProgress } from './storage';
import { computeBaseXp, streakMultiplierFor } from './xpRules';
import {
  CardDefinition,
  CardUnlockInfo,
  CompletionEvent,
  CompletionResult,
  DailyLogEntry,
  SKILL_ORDER,
  SkillId,
  UserProgress,
} from './types';

const MAX_DAILY_LOG_ENTRIES = 60;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayISO(todayISO: string): string {
  const d = new Date(`${todayISO}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

type Listener = () => void;

class ProgressionEngine {
  private state: UserProgress | null = null;
  private listeners = new Set<Listener>();
  private readyPromise: Promise<void> | null = null;

  async init(): Promise<UserProgress> {
    if (!this.readyPromise) {
      this.readyPromise = loadProgress().then((p) => {
        this.state = p;
      });
    }
    await this.readyPromise;
    return this.state!;
  }

  getSnapshot(): UserProgress {
    if (!this.state) throw new Error('ProgressionEngine used before init()');
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private getOrCreateDayEntry(p: UserProgress, dateISO: string): DailyLogEntry {
    let entry = p.dailyLog.find((d) => d.date === dateISO);
    if (!entry) {
      entry = { date: dateISO, xpEarned: 0, skillXp: {}, completedReminderIds: [], unlockedCardIds: [] };
      p.dailyLog.push(entry);
      p.dailyLog.sort((a, b) => a.date.localeCompare(b.date));
      if (p.dailyLog.length > MAX_DAILY_LOG_ENTRIES) {
        p.dailyLog.splice(0, p.dailyLog.length - MAX_DAILY_LOG_ENTRIES);
      }
    }
    return entry;
  }

  private evaluateUnlocks(p: UserProgress): CardUnlockInfo[] {
    const unlocked: CardUnlockInfo[] = [];
    const nowIso = new Date().toISOString();
    for (const card of CARD_DEFINITIONS) {
      if (p.unlockedCards[card.id]) continue;
      const progress = card.getProgress(p);
      if (progress.current >= progress.target) {
        p.unlockedCards[card.id] = nowIso;
        p.totalXp += rarityUnlockBonus(card);
        unlocked.push({ id: card.id, title: card.title, rarity: card.rarity });
      }
    }
    return unlocked;
  }

  async recordCompletion(event: CompletionEvent): Promise<CompletionResult> {
    const p = this.getSnapshot();
    const dateISO = toISODate(event.at);
    const alreadyToday = p.lastCompletedDate[event.reminderId] === dateISO;

    const levelBefore = levelFromTotalXp(p.totalXp);

    if (alreadyToday) {
      // Still counts toward "showed up today" bookkeeping via the streak
      // logic below (harmless to recompute), but grants no XP — this is
      // the anti-spam guard: one reminder can't be re-completed for XP
      // twice in the same day.
      return {
        xpGained: 0,
        skillGains: {},
        leveledUp: false,
        newLevel: levelBefore,
        newStreak: p.currentStreak,
        streakExtended: false,
        unlockedCards: [],
        alreadyCompletedToday: true,
      };
    }

    // ---- streak bookkeeping ----
    let streakExtended = false;
    if (p.lastActiveDate === dateISO) {
      // already active today from a different reminder — streak unchanged
    } else if (p.lastActiveDate === yesterdayISO(dateISO)) {
      p.currentStreak += 1;
      streakExtended = true;
    } else {
      if (p.lastActiveDate !== null && p.currentStreak >= 3) {
        p.hadStreakBreakAfterThree = true;
      }
      p.currentStreak = 1;
      streakExtended = true;
    }
    p.lastActiveDate = dateISO;
    p.longestStreak = Math.max(p.longestStreak, p.currentStreak);

    // ---- XP ----
    const { totalXp: baseXp, skillGains: baseSkillGains } = computeBaseXp(event.title, event.category);
    const multiplier = streakMultiplierFor(p.currentStreak);
    const xpGained = Math.round(baseXp * (1 + multiplier));

    const skillGains: Partial<Record<SkillId, number>> = {};
    const scale = xpGained / Math.max(1, baseXp);
    for (const skill of SKILL_ORDER) {
      const base = baseSkillGains[skill];
      if (base) {
        const scaled = Math.round(base * scale);
        skillGains[skill] = scaled;
        p.skillXp[skill] = (p.skillXp[skill] ?? 0) + scaled;
      }
    }

    p.totalXp += xpGained;
    p.completedCount += 1;
    p.lastCompletedDate[event.reminderId] = dateISO;
    p.categoryHistory[event.category] = (p.categoryHistory[event.category] ?? 0) + 1;

    const hour = event.at.getHours();
    if (hour < 9) p.earlyCompletions += 1;
    if (hour >= 22) p.nightCompletions += 1;

    const day = this.getOrCreateDayEntry(p, dateISO);
    day.xpEarned += xpGained;
    day.completedReminderIds.push(event.reminderId);
    for (const [skill, amount] of Object.entries(skillGains)) {
      day.skillXp[skill as SkillId] = (day.skillXp[skill as SkillId] ?? 0) + (amount ?? 0);
    }

    // ---- card unlocks (evaluated after all counters above are updated) ----
    const unlockedCards = this.evaluateUnlocks(p);
    day.unlockedCardIds.push(...unlockedCards.map((c) => c.id));

    const newLevel = levelFromTotalXp(p.totalXp);

    await saveProgress(p);
    this.notify();

    return {
      xpGained,
      skillGains,
      leveledUp: newLevel.level > levelBefore.level,
      newLevel,
      newStreak: p.currentStreak,
      streakExtended,
      unlockedCards,
      alreadyCompletedToday: false,
    };
  }

  /** Locked, challenge-eligible cards, nearest-to-completion first. Powers
   * the "active challenges" section without a second, parallel data model. */
  getActiveChallenges(limit = 4): { card: CardDefinition; progress: { current: number; target: number } }[] {
    const p = this.getSnapshot();
    return CARD_DEFINITIONS.filter((c) => c.challengeEligible && !p.unlockedCards[c.id])
      .map((card) => ({ card, progress: card.getProgress(p) }))
      .sort((a, b) => b.progress.current / b.progress.target - a.progress.current / a.progress.target)
      .slice(0, limit);
  }

  /** Returns yesterday's recap if it exists and hasn't been shown yet, and
   * marks it shown. Purely client-side — no background job required, this
   * just checks "has the calendar day changed since we last opened?" on
   * launch. */
  async consumeYesterdayRecapIfDue(): Promise<DailyLogEntry | null> {
    const p = this.getSnapshot();
    const todayISO = toISODate(new Date());
    if (p.lastSummaryShownDate === todayISO) return null;
    const yISO = yesterdayISO(todayISO);
    const entry = p.dailyLog.find((d) => d.date === yISO);
    p.lastSummaryShownDate = todayISO;
    await saveProgress(p);
    this.notify();
    return entry && entry.completedReminderIds.length > 0 ? entry : null;
  }

  getTodayEntry(): DailyLogEntry | null {
    const p = this.getSnapshot();
    const todayISO = toISODate(new Date());
    return p.dailyLog.find((d) => d.date === todayISO) ?? null;
  }
}

function rarityUnlockBonus(card: CardDefinition): number {
  const bonuses: Record<string, number> = {
    common: 15,
    uncommon: 30,
    rare: 60,
    epic: 120,
    legendary: 250,
  };
  return bonuses[card.rarity] ?? 15;
}

export const Progression = new ProgressionEngine();
