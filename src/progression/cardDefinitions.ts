// ─────────────────────────────────────────────────────────────────────────
// The card catalog — an original archive of discoverable objects, inspired
// by (not copied from) the idea of collectible progression artifacts.
//
// Every card is a pure function of UserProgress: getProgress(state) reports
// how close the user is, and unlock is simply current >= target. This
// keeps the whole system reproducible from the stored snapshot — no hidden
// mutable card state anywhere else.
//
// `challengeEligible` cards are the ones the Progress screen will surface
// as an active "quest" while they're still locked — see engine.ts's
// getActiveChallenges(). A card doesn't need two separate representations;
// a challenge IS a not-yet-unlocked card, viewed with intent.
// ─────────────────────────────────────────────────────────────────────────

import { CardDefinition, UserProgress } from './types';

function daysWithAtLeast(p: UserProgress, count: number): number {
  return p.dailyLog.filter((d) => d.completedReminderIds.length >= count).length;
}

function distinctCategoriesTouched(p: UserProgress): number {
  return Object.values(p.categoryHistory).filter((n) => (n ?? 0) > 0).length;
}

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'first-step',
    title: 'First Step',
    description: 'You completed your first reminder. Everything after this is momentum.',
    lockedHint: 'Awakens the moment you finish anything at all.',
    rarity: 'common',
    kind: 'milestone',
    skill: 'discipline',
    getProgress: (p) => ({ current: Math.min(p.completedCount, 1), target: 1 }),
  },
  {
    id: 'early-riser',
    title: 'Early Riser',
    description: 'Five reminders finished before 9 AM. The morning belongs to you.',
    lockedHint: 'Something about the hours before 9 AM.',
    rarity: 'uncommon',
    kind: 'achievement',
    skill: 'discipline',
    challengeEligible: true,
    goalText: 'Complete 5 reminders before 9 AM.',
    getProgress: (p) => ({ current: Math.min(p.earlyCompletions, 5), target: 5 }),
  },
  {
    id: 'after-hours',
    title: 'After Hours',
    description: 'Five reminders finished after 10 PM. Some of your best work happens late.',
    lockedHint: 'Something about the hours after 10 PM.',
    rarity: 'uncommon',
    kind: 'achievement',
    skill: 'focus',
    challengeEligible: true,
    goalText: 'Complete 5 reminders after 10 PM.',
    getProgress: (p) => ({ current: Math.min(p.nightCompletions, 5), target: 5 }),
  },
  {
    id: 'unbroken',
    title: 'Unbroken',
    description: 'A seven-day streak, unbroken. This is what consistency looks like.',
    lockedHint: 'A reward for not missing a day. Several days in a row.',
    rarity: 'epic',
    kind: 'streak',
    skill: 'discipline',
    challengeEligible: true,
    goalText: 'Reach a 7-day consistency streak.',
    getProgress: (p) => ({ current: Math.min(p.longestStreak, 7), target: 7 }),
  },
  {
    id: 'thirty-days',
    title: 'The Long Stretch',
    description: 'Thirty days of consistency. This is no longer a habit — it is who you are.',
    lockedHint: 'Far beyond a week. A month of showing up.',
    rarity: 'legendary',
    kind: 'streak',
    skill: 'discipline',
    getProgress: (p) => ({ current: Math.min(p.longestStreak, 30), target: 30 }),
  },
  {
    id: 'deep-work',
    title: 'Deep Work',
    description: 'Five focus-driven sessions completed. Your attention is becoming a skill.',
    lockedHint: 'Something about sustained, focused effort.',
    rarity: 'rare',
    kind: 'skill',
    skill: 'focus',
    challengeEligible: true,
    goalText: 'Earn 150 Focus experience from focused sessions.',
    getProgress: (p) => ({ current: Math.min(p.skillXp.focus ?? 0, 150), target: 150 }),
  },
  {
    id: 'momentum',
    title: 'Momentum',
    description: 'Four or more reminders finished in a single day. Once it starts, it carries.',
    lockedHint: 'A reward for a day that got away from you — in a good way.',
    rarity: 'rare',
    kind: 'achievement',
    skill: 'discipline',
    challengeEligible: true,
    goalText: 'Complete 4 or more reminders in a single day.',
    getProgress: (p) => ({ current: Math.min(daysWithAtLeast(p, 4), 1), target: 1 }),
  },
  {
    id: 'the-finisher',
    title: 'The Finisher',
    description: 'Three separate days with four or more reminders finished. You close things out.',
    lockedHint: 'Momentum, repeated. Three times over.',
    rarity: 'epic',
    kind: 'achievement',
    skill: 'discipline',
    challengeEligible: true,
    goalText: 'Have 3 separate days with 4+ reminders completed.',
    getProgress: (p) => ({ current: Math.min(daysWithAtLeast(p, 4), 3), target: 3 }),
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'You have completed reminders across five different categories. Range matters.',
    lockedHint: 'A reward for range, not repetition.',
    rarity: 'uncommon',
    kind: 'milestone',
    skill: 'personal',
    getProgress: (p) => ({ current: Math.min(distinctCategoriesTouched(p), 5), target: 5 }),
  },
  {
    id: 'comeback',
    title: 'Comeback',
    description: 'Your streak broke — and you started again anyway. That matters more than the streak did.',
    lockedHint: 'Not every reward is for winning. Some are for returning.',
    rarity: 'common',
    kind: 'streak',
    skill: 'discipline',
    getProgress: (p) => ({ current: p.hadStreakBreakAfterThree ? 1 : 0, target: 1 }),
  },
  {
    id: 'centurion',
    title: 'Centurion',
    description: 'One hundred reminders completed. This is no longer a phase.',
    lockedHint: 'A number with three digits. Keep going.',
    rarity: 'epic',
    kind: 'milestone',
    getProgress: (p) => ({ current: Math.min(p.completedCount, 100), target: 100 }),
  },
  {
    id: 'the-long-game',
    title: 'The Long Game',
    description: 'One thousand total experience earned. Small actions, compounded.',
    lockedHint: 'A quiet reward for accumulation, not intensity.',
    rarity: 'rare',
    kind: 'milestone',
    getProgress: (p) => ({ current: Math.min(p.totalXp, 1000), target: 1000 }),
  },
  {
    id: 'ascendant',
    title: 'Ascendant',
    description: 'Level ten. You have built something real here.',
    lockedHint: 'Reserved for a level far ahead of where most people stop.',
    rarity: 'legendary',
    kind: 'milestone',
    // level is derived elsewhere; approximate via cumulative xp threshold at level 10
    getProgress: (p) => {
      let need = 0;
      for (let lvl = 1; lvl < 10; lvl++) need += 100 + (lvl - 1) * 40;
      return { current: Math.min(p.totalXp, need), target: need };
    },
  },
  // One mastery card per skill — makes every skill feel like it leads
  // somewhere, not just a number that goes up.
  ...(
    [
      ['discipline', 'Discipline: Adept', 'Your follow-through is no longer in question.'],
      ['focus', 'Focus: Adept', 'Distraction has stopped being your default state.'],
      ['fitness', 'Fitness: Adept', 'Your body is part of the plan now, not an afterthought.'],
      ['learning', 'Learning: Adept', 'You return to studying without being asked to.'],
      ['organization', 'Organization: Adept', 'Your systems are starting to hold themselves up.'],
      ['social', 'Social: Adept', 'You show up for people on purpose, not by accident.'],
      ['creativity', 'Creativity: Adept', 'Making things has become a habit, not an event.'],
      ['health', 'Health: Adept', 'You treat your own maintenance as non-negotiable.'],
      ['personal', 'Personal: Adept', 'The small, unglamorous parts of life are handled.'],
    ] as const
  ).map(
    ([skill, title, description]) =>
      ({
        id: `adept-${skill}`,
        title,
        description,
        lockedHint: `Sustained growth in a specific skill. Keep practicing it.`,
        rarity: 'uncommon',
        kind: 'skill',
        skill,
        getProgress: (p: UserProgress) => ({ current: Math.min(p.skillXp[skill] ?? 0, 250), target: 250 }),
      }) satisfies CardDefinition
  ),
];

export function getCardDefinition(id: string): CardDefinition | undefined {
  return CARD_DEFINITIONS.find((c) => c.id === id);
}
