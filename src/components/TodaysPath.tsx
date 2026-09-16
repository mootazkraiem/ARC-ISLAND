import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing } from '../theme';
import { Reminder } from '../types';
import { formatRelativeDay, formatTime, getNextOccurrence } from '../reminderLogic';
import { computeBaseXp } from '../progression/xpRules';
import { useProgress } from '../progression/useProgress';
import { levelFromTotalXp, levelTitle } from '../progression/levels';
import { CircularRing } from './CircularRing';
import { ProgressBar } from './ProgressBar';

interface Props {
  reminders: Reminder[];
  onComplete: (id: string) => void;
}

/** The reminder engine already knows what's due today — this is purely a
 * derived view over it, framed as a daily objective rather than a list. No
 * new data model, no separate "quest" entity to keep in sync. Matches the
 * approved design's Home screen: level ring + XP bar above today's rows. */
export function TodaysPath({ reminders, onComplete }: Props) {
  const progress = useProgress();
  const level = levelFromTotalXp(progress.totalXp);
  const today = reminders.filter((r) => r.enabled && formatRelativeDay(getNextOccurrence(r)) === 'Today');

  const doneToday = new Set(
    Object.entries(progress.lastCompletedDate)
      .filter(([, date]) => date === new Date().toISOString().slice(0, 10))
      .map(([id]) => id)
  );

  const remaining = today.filter((r) => !doneToday.has(r.id));
  const projectedXp = remaining.reduce((sum, r) => sum + computeBaseXp(r.title, r.category).totalXp, 0);
  const nextLevel = levelFromTotalXp(level.xpTotal + level.xpForThisLevel - level.xpIntoLevel);

  return (
    <View>
      <View style={styles.levelCard}>
        <CircularRing progress={level.xpIntoLevel / level.xpForThisLevel} size={58} strokeWidth={4} color={colors.signal}>
          <Text style={styles.ringNumber}>{level.level}</Text>
        </CircularRing>
        <View style={styles.levelInfo}>
          <View style={styles.levelInfoTop}>
            <Text style={styles.levelName}>Level {level.level} · {levelTitle(level.level)}</Text>
            <Text style={styles.xpValue}>{level.xpIntoLevel.toLocaleString()} / {level.xpForThisLevel.toLocaleString()}</Text>
          </View>
          <ProgressBar progress={level.xpIntoLevel / level.xpForThisLevel} height={7} color={colors.signal} glowColor={colors.signal} />
          <Text style={styles.xpRemain}>
            {level.xpForThisLevel - level.xpIntoLevel} to Level {level.level + 1} · {levelTitle(level.level + 1)}
          </Text>
        </View>
      </View>

      {today.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>DAILY PATH</Text>
            <Text style={styles.count}>
              {today.length - remaining.length} / {today.length}
            </Text>
          </View>

          {today.map((r) => {
            const done = doneToday.has(r.id);
            const xp = computeBaseXp(r.title, r.category).totalXp;
            return (
              <Pressable
                key={r.id}
                style={[styles.row, done && styles.rowDone]}
                disabled={done}
                onPress={() => onComplete(r.id)}
              >
                <View style={[styles.checkbox, done && styles.checkboxDone]}>
                  {done && <View style={styles.checkmark} />}
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowText, done && styles.rowTextDone]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.rowMeta}>{formatTime(r.time)}</Text>
                </View>
                <Text style={[styles.rowXp, { color: done ? colors.done : colors.xp }]}>{done ? 'DONE' : `+${xp}`}</Text>
              </Pressable>
            );
          })}

          {remaining.length > 0 && (
            <Text style={styles.footer}>Finish today's path for up to +{projectedXp} XP</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  ringNumber: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 18, color: colors.text },
  levelInfo: { flex: 1, gap: spacing(1.75) },
  levelInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing(2) },
  levelName: { ...font.rowTitle, color: colors.textSecondary, fontSize: 13.5 },
  xpValue: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 12, color: colors.xp },
  xpRemain: { ...font.caption, color: colors.textFaint, fontSize: 11 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) },
  title: { ...font.label, fontSize: 10 },
  count: { ...font.caption, color: colors.signal, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(2) },
  rowDone: { opacity: 0.45 },
  rowBody: { flex: 1, marginLeft: spacing(3) },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.done, borderColor: colors.done, shadowColor: colors.done, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  checkmark: { width: 10, height: 5.5, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.void, transform: [{ rotate: '-45deg' }], marginTop: -2 },
  rowText: { ...font.rowTitle, color: colors.textSecondary, fontSize: 14.5 },
  rowTextDone: { color: colors.textFainter, textDecorationLine: 'line-through' },
  rowMeta: { ...font.caption, color: colors.textFainter, fontSize: 11, marginTop: 2 },
  rowXp: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 12 },
  footer: { ...font.caption, color: colors.textFainter, marginTop: spacing(2), textAlign: 'center' },
});
