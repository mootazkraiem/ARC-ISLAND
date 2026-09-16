// ─────────────────────────────────────────────────────────────────────────
// XP rules — deliberately simple and readable so they stay tunable.
//
// Design intent (from the product principle: don't turn everything into
// XP): base rewards are modest, keyword-detected "real effort" signals add
// a bit more, and the thing that actually compounds is *consistency*
// (streak multiplier) rather than raw completion count. Spamming trivial
// one-off reminders for XP farming caps out fast because:
//   - base XP by category is small (8–20)
//   - only two skill-keyword bonuses apply per completion, max
//   - a given reminder can only grant XP once per calendar day
//   - the multiplier rewards showing up daily, not completing many things
//     in a single sitting
// ─────────────────────────────────────────────────────────────────────────

import { Category } from '../types';
import { SkillId } from './types';

export const BASE_XP_BY_CATEGORY: Record<Category, number> = {
  personal: 12,
  work: 20,
  health: 15,
  errand: 8,
  other: 10,
};

/** If no keyword matches at all, this is the skill that still gets credit —
 * every category maps to *something* so completions always feel like they
 * belong to a skill. */
const CATEGORY_FALLBACK_SKILL: Record<Category, SkillId> = {
  personal: 'personal',
  work: 'organization',
  health: 'health',
  errand: 'discipline',
  other: 'personal',
};

const KEYWORD_SKILLS: [RegExp, SkillId][] = [
  [/\b(study|learn|course|read|book|review|exam|class|tutorial|research|revise)\b/i, 'learning'],
  [/\b(focus|deep work|code|coding|write|writing|report|draft|program|essay)\b/i, 'focus'],
  [/\b(gym|workout|run|running|exercise|stretch|yoga|walk|cycle|swim|sport|jog)\b/i, 'fitness'],
  [/\b(call|meet|meeting|friend|family|mom|dad|date night|catch up|hangout)\b/i, 'social'],
  [/\b(clean|organize|plan|schedule|tidy|sort|budget|file|declutter|inbox)\b/i, 'organization'],
  [/\b(paint|draw|music|compose|craft|sketch|design|creative)\b/i, 'creativity'],
  [/\b(sleep|water|meditate|doctor|dentist|therapy|medicine|pill|checkup|rest)\b/i, 'health'],
];

const KEYWORD_BONUS_XP = 15;
const MAX_KEYWORD_SKILLS = 2;

const STREAK_MULTIPLIER_TIERS: [minStreak: number, bonus: number][] = [
  [30, 0.5],
  [14, 0.35],
  [7, 0.2],
  [3, 0.1],
];

export function streakMultiplierFor(streak: number): number {
  for (const [min, bonus] of STREAK_MULTIPLIER_TIERS) {
    if (streak >= min) return bonus;
  }
  return 0;
}

export interface XpBreakdown {
  totalXp: number;
  skillGains: Partial<Record<SkillId, number>>;
}

/** Computes XP + per-skill gains for one completion, before the streak
 * multiplier (multiplier is applied by the engine once the new streak value
 * is known). */
export function computeBaseXp(title: string, category: Category): XpBreakdown {
  const base = BASE_XP_BY_CATEGORY[category] ?? 10;
  const skillGains: Partial<Record<SkillId, number>> = {};

  // Discipline is the "you showed up" skill — every completion feeds it a
  // little, independent of what the task actually was.
  const disciplineBase = Math.max(4, Math.round(base / 3));
  skillGains.discipline = (skillGains.discipline ?? 0) + disciplineBase;

  const matched: SkillId[] = [];
  for (const [re, skill] of KEYWORD_SKILLS) {
    if (matched.length >= MAX_KEYWORD_SKILLS) break;
    if (re.test(title) && !matched.includes(skill)) {
      matched.push(skill);
    }
  }

  let bonusXp = 0;
  if (matched.length > 0) {
    for (const skill of matched) {
      skillGains[skill] = (skillGains[skill] ?? 0) + KEYWORD_BONUS_XP;
      bonusXp += KEYWORD_BONUS_XP;
    }
  } else {
    const fallback = CATEGORY_FALLBACK_SKILL[category];
    if (fallback !== 'discipline') {
      skillGains[fallback] = (skillGains[fallback] ?? 0) + Math.round(base / 2);
    }
  }

  const totalXp = base + bonusXp;
  return { totalXp, skillGains };
}
