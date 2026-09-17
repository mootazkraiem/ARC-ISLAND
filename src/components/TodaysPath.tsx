import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, font, radii, spacing } from '../theme';
import { Reminder } from '../types';
import { formatTime } from '../reminderLogic';
import { computeBaseXp } from '../progression/xpRules';
import { useProgress } from '../progression/useProgress';
import { SystemPanel } from './SystemPanel';
import { SystemGlyph } from './SystemGlyph';
import { occurrencesForDay, toISODate } from '../calendar/occurrences';

// ─────────────────────────────────────────────────────────────────────────
// QUESTS OF THE DAY.
//
// Derived entirely from the existing quest store via the same occurrence
// projection the Quest Calendar uses — so a repeating quest shows up here
// on exactly the days it will actually fire, with no separate data model.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  reminders: Reminder[];
  onComplete: (id: string) => void;
}

export function TodaysPath({ reminders, onComplete }: Props) {
  const progress = useProgress();
  const todayIso = toISODate(new Date());
  const occs = occurrencesForDay(reminders, new Date(), {
    completedDates: progress.lastCompletedDate,
  });

  if (occs.length === 0) return null;

  const remaining = occs.filter((o) => o.state !== 'completed');
  const sealed = occs.length - remaining.length;
  const projectedXp = remaining.reduce(
    (sum, o) => sum + computeBaseXp(o.reminder.title, o.reminder.category).totalXp,
    0
  );
  const allSealed = remaining.length === 0;

  return (
    <SystemPanel tone={allSealed ? 'done' : 'default'} bracket={15} style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <SystemGlyph
            name={allSealed ? 'questComplete' : 'quest'}
            size={14}
            color={allSealed ? colors.done : colors.arcCyan}
            charged={allSealed}
          />
          <Text style={[styles.title, allSealed && { color: colors.done }]}>QUESTS OF THE DAY</Text>
        </View>
        <Text style={[styles.count, allSealed && { color: colors.done }]}>
          {sealed} / {occs.length}
        </Text>
      </View>

      {/* completion meter — one glance tells you how much of today is sealed */}
      <View style={styles.meter}>
        <View
          style={[
            styles.meterFill,
            {
              width: `${(sealed / occs.length) * 100}%`,
              backgroundColor: allSealed ? colors.done : colors.signal,
            },
          ]}
        />
      </View>

      <View style={styles.rows}>
        {occs.map((o) => {
          const done = o.state === 'completed';
          const overdue = o.state === 'overdue';
          const active = o.state === 'active';
          const xp = computeBaseXp(o.reminder.title, o.reminder.category).totalXp;
          return (
            <Animated.View key={o.key} entering={FadeIn.duration(220)}>
              <Pressable
                style={[styles.row, done && styles.rowDone]}
                disabled={done}
                onPress={() => onComplete(o.reminder.id)}
              >
                <SystemGlyph
                  name={done ? 'questComplete' : overdue ? 'questOverdue' : active ? 'questActive' : 'quest'}
                  size={20}
                  color={done ? colors.done : overdue ? colors.due : active ? colors.arcCyan : colors.textFaint}
                  charged={done}
                  strokeWidth={1.5}
                />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowText, done && styles.rowTextDone]} numberOfLines={1}>
                    {o.reminder.title}
                  </Text>
                  <Text style={[styles.rowMeta, active && { color: colors.arcCyan }]}>
                    {formatTime(o.reminder.time)}
                    {active ? ' · NOW' : overdue ? ' · MISSED' : ''}
                  </Text>
                </View>
                <Text style={[styles.rowXp, { color: done ? colors.done : colors.xp }]}>
                  {done ? 'SEALED' : `+${xp}`}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.footer}>
        {allSealed
          ? 'The day is sealed.'
          : `+${projectedXp} XP remains unclaimed today`}
      </Text>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing(3.5), gap: spacing(2.5) },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  title: { ...font.label, fontSize: 9.5, color: colors.arcCyan, letterSpacing: 1.8 },
  count: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 12, color: colors.textFaint },
  meter: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 2 },
  rows: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(1.75), gap: spacing(2.5) },
  rowDone: { opacity: 0.45 },
  rowBody: { flex: 1 },
  rowText: { ...font.rowTitle, color: colors.textSecondary, fontSize: 14 },
  rowTextDone: { color: colors.textFainter, textDecorationLine: 'line-through' },
  rowMeta: { ...font.caption, color: colors.textFainter, fontSize: 10.5, marginTop: 1, letterSpacing: 0.3 },
  rowXp: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 11 },
  footer: { ...font.caption, color: colors.textFainter, fontSize: 11, textAlign: 'center' },
});
