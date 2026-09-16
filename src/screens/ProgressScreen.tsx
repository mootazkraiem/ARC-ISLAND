import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing } from '../theme';
import { useProgress } from '../progression/useProgress';
import { Progression } from '../progression/engine';
import { levelFromTotalXp, levelTitle } from '../progression/levels';
import { CARD_DEFINITIONS } from '../progression/cardDefinitions';
import { RARITY_META, SKILL_META, SKILL_ORDER } from '../progression/types';
import { ProgressBar } from '../components/ProgressBar';
import { CircularRing } from '../components/CircularRing';
import { StreakChain } from '../components/StreakChain';

export function ProgressScreen({ onBack, onOpenCollection }: { onBack: () => void; onOpenCollection: () => void }) {
  const progress = useProgress();
  const level = levelFromTotalXp(progress.totalXp);

  const challenges = useMemo(() => Progression.getActiveChallenges(4), [progress]);

  const recentDiscoveries = useMemo(() => {
    return Object.entries(progress.unlockedCards)
      .sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime())
      .slice(0, 3)
      .map(([id]) => CARD_DEFINITIONS.find((c) => c.id === id))
      .filter(Boolean);
  }, [progress.unlockedCards]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>YOUR SYSTEM</Text>
      </View>

      <View style={styles.ringWrap}>
        <CircularRing progress={level.xpIntoLevel / level.xpForThisLevel} size={186} strokeWidth={9} color={colors.signal}>
          <Text style={styles.ringLabel}>LEVEL</Text>
          <Text style={styles.ringNumber}>{level.level}</Text>
          <Text style={styles.ringTitle}>{levelTitle(level.level)}</Text>
        </CircularRing>
        <View style={styles.xpPill}>
          <Text style={styles.xpPillText}>{level.xpTotal.toLocaleString()} XP</Text>
        </View>
        <Text style={styles.xpRemainText}>{level.xpForThisLevel - level.xpIntoLevel} to {levelTitle(level.level + 1)}</Text>
      </View>

      <Text style={styles.sectionTitle}>SKILLS</Text>
      <View style={styles.skillsList}>
        {SKILL_ORDER.map((skillId) => {
          const meta = SKILL_META[skillId];
          const xp = progress.skillXp[skillId] ?? 0;
          const skillLevel = levelFromTotalXp(xp);
          const tint = SKILL_TINT[skillId];
          return (
            <View key={skillId} style={styles.skillRow}>
              <View style={styles.skillHeaderRow}>
                <View style={styles.skillNameRow}>
                  <View style={[styles.skillDot, { backgroundColor: tint, shadowColor: tint, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]} />
                  <Text style={styles.skillLabel}>{meta.label}</Text>
                </View>
                <Text style={styles.skillLevel}>LV {skillLevel.level}</Text>
              </View>
              <ProgressBar
                progress={skillLevel.xpIntoLevel / skillLevel.xpForThisLevel}
                height={6}
                color={tint}
                glowColor={tint}
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>CHAIN · {progress.currentStreak} DAYS</Text>
      <View style={styles.chainCard}>
        <View style={styles.chainHeaderRow}>
          <Text style={styles.chainSub}>Keep it alive by completing at least one thing a day.</Text>
          <Text style={styles.chainBest}>best {progress.longestStreak}</Text>
        </View>
        <StreakChain dailyLog={progress.dailyLog} />
      </View>

      {challenges.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>ACTIVE PATHS</Text>
          {challenges.map(({ card, progress: cp }) => (
            <View
              key={card.id}
              style={[styles.challengeCard, { borderColor: `${RARITY_META[card.rarity].color}47`, shadowColor: RARITY_META[card.rarity].color }]}
            >
              <View style={styles.challengeHeaderRow}>
                <Text style={styles.challengeTitle}>{card.title}</Text>
                <Text style={[styles.challengeRarity, { color: RARITY_META[card.rarity].color }]}>
                  {RARITY_META[card.rarity].label.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.challengeGoal}>{card.goalText}</Text>
              <ProgressBar progress={cp.current / cp.target} height={6} color={RARITY_META[card.rarity].color} glowColor={RARITY_META[card.rarity].color} />
              <Text style={styles.challengeProgress}>
                {cp.current} / {cp.target}
              </Text>
            </View>
          ))}
        </>
      )}

      {recentDiscoveries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>RECENT DISCOVERIES</Text>
          <View style={styles.recentRow}>
            {recentDiscoveries.map((card) => (
              <View key={card!.id} style={styles.recentPill}>
                <View style={[styles.recentDot, { backgroundColor: RARITY_META[card!.rarity].color }]} />
                <Text style={styles.recentText} numberOfLines={1}>
                  {card!.title}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Pressable style={styles.collectionBtn} onPress={onOpenCollection}>
        <Text style={styles.collectionBtnText}>
          Open Collection — {Object.keys(progress.unlockedCards).length}/{CARD_DEFINITIONS.length}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// Reuses the same four accent hues as the rest of the design system — one
// tint per skill, cycling, rather than a bespoke palette per skill.
const SKILL_TINT: Record<string, string> = {
  discipline: colors.xp,
  focus: colors.signal,
  fitness: colors.done,
  learning: colors.due,
  organization: colors.xp,
  social: colors.signal,
  creativity: colors.due,
  health: colors.done,
  personal: colors.textFaint,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  content: { paddingHorizontal: spacing(5), paddingTop: spacing(4), paddingBottom: spacing(12) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(4) },
  backText: { color: colors.signal, fontSize: 16, fontWeight: '600' },
  eyebrow: { ...font.label, fontSize: 10 },
  ringWrap: { alignItems: 'center', marginBottom: spacing(7), gap: spacing(2) },
  ringLabel: { ...font.label, fontSize: 9, marginBottom: 2 },
  ringNumber: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 50, color: colors.text, letterSpacing: -1 },
  ringTitle: { ...font.rowTitle, color: colors.signal, fontSize: 12 },
  xpPill: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(1.75),
    borderRadius: radii.pill,
    backgroundColor: colors.xpSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,198,92,0.3)',
  },
  xpPillText: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 15, color: colors.xp },
  xpRemainText: { ...font.caption, color: colors.textFaint },
  sectionTitle: {
    ...font.label,
    fontSize: 10,
    marginBottom: spacing(3),
    marginTop: spacing(2),
  },
  skillsList: { gap: spacing(3.5), marginBottom: spacing(6) },
  skillRow: { gap: spacing(1.75) },
  skillHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  skillNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  skillDot: { width: 7, height: 7, borderRadius: 3.5 },
  skillLabel: { ...font.rowTitle, color: colors.textSecondary, fontSize: 14 },
  skillLevel: { ...font.label, fontSize: 10, color: colors.textFaint },
  chainCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(6),
  },
  chainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(3), gap: spacing(3) },
  chainSub: { ...font.caption, flex: 1, color: colors.textFaint },
  chainBest: { ...font.caption, color: colors.textFaint, fontWeight: '700' },
  challengeCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(3),
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  challengeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) },
  challengeTitle: { ...font.rowTitle, color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  challengeRarity: { ...font.label, fontSize: 10 },
  challengeGoal: { ...font.caption, color: colors.textDim, marginBottom: spacing(3) },
  challengeProgress: { ...font.caption, color: colors.textFainter, marginTop: spacing(1.5), textAlign: 'right' },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(6) },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    maxWidth: '100%',
  },
  recentDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  recentText: { ...font.caption, color: colors.textDim, fontWeight: '600' },
  collectionBtn: {
    backgroundColor: colors.signalSoft,
    borderRadius: radii.pill,
    paddingVertical: spacing(4),
    alignItems: 'center',
  },
  collectionBtnText: { color: colors.signal, fontWeight: '700', fontSize: 15 },
});
