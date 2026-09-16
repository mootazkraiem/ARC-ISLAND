import { LevelInfo } from './types';

/** XP required to go from level n to level n+1. Linear growth — deliberately
 * not exponential, so late levels don't become a grind wall. Level 1 costs
 * 100 XP, level 2 costs 140, level 3 costs 180, etc. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 40;
}

export function levelFromTotalXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForThisLevel: xpForLevel(level),
    xpTotal: totalXp,
  };
}

/** Purely cosmetic labels shown alongside a level number ("Level 7 ·
 * Pathfinder") — matches the approved design's rank-title treatment.
 * Adding a title never touches XP math or level thresholds; run out of
 * names and it just repeats the last one. */
const LEVEL_TITLES = [
  'Newcomer', 'Starter', 'Regular', 'Steady Hand', 'Committed',
  'Pathfinder', 'Wayfinder', 'Voyager', 'Trailblazer', 'Vanguard',
  'Adept', 'Specialist', 'Expert', 'Master', 'Grandmaster',
];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1];
}
