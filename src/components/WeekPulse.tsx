import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing } from '../theme';
import { Reminder } from '../types';
import { WEEKDAY_INITIAL, mondayIndex } from '../locale';
import { SystemGlyph } from './SystemGlyph';
import { addDays, isSameDay, occurrencesForDay, startOfWeek } from '../calendar/occurrences';

// ─────────────────────────────────────────────────────────────────────────
// The Quest Calendar preview on Home — a seven-day PULSE, not a mini grid.
//
// A shrunken week grid at this size is unreadable, so this shows the shape
// of the week instead: one vertical bar per day whose height is that day's
// load and whose fill is how much of it is already sealed. The user reads
// "Thursday is heavy, I've cleared Monday" in one glance, then taps through
// to the real map.
// ─────────────────────────────────────────────────────────────────────────

const MAX_LOAD = 5;
const TRACK_H = 38;

export function WeekPulse({
  reminders,
  completedDates,
  onPress,
}: {
  reminders: Reminder[];
  completedDates: Record<string, string>;
  onPress: () => void;
}) {
  const now = new Date();
  const week = useMemo(() => {
    const start = startOfWeek(now);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const occs = occurrencesForDay(reminders, day, { completedDates, now });
      const done = occs.filter((o) => o.state === 'completed').length;
      const overdue = occs.filter((o) => o.state === 'overdue').length;
      return { day, total: occs.length, done, overdue };
    });
  }, [reminders, completedDates]);

  const weekTotal = week.reduce((s, d) => s + d.total, 0);
  const weekDone = week.reduce((s, d) => s + d.done, 0);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <SystemGlyph name="calendar" size={14} color={colors.arcCyan} />
          <Text style={styles.title}>QUEST CALENDAR</Text>
        </View>
        <Text style={styles.headRight}>
          {weekTotal === 0 ? 'WEEK CLEAR' : `${weekDone}/${weekTotal} SEALED`}
        </Text>
      </View>

      <View style={styles.row}>
        {week.map(({ day, total, done, overdue }) => {
          const today = isSameDay(day, now);
          const load = Math.min(1, total / MAX_LOAD);
          const h = total === 0 ? 3 : 8 + load * (TRACK_H - 8);
          const doneFrac = total === 0 ? 0 : done / total;
          const tone = overdue > 0 ? colors.due : done === total && total > 0 ? colors.done : colors.signal;

          return (
            <View key={day.toISOString()} style={styles.dayCol}>
              <View style={styles.track}>
                <View style={[styles.bar, { height: h, backgroundColor: total === 0 ? 'rgba(124,158,255,0.16)' : `${tone}38`, borderColor: total === 0 ? 'transparent' : `${tone}66` }]}>
                  {doneFrac > 0 && (
                    <View
                      style={[
                        styles.barFill,
                        { height: `${doneFrac * 100}%`, backgroundColor: colors.done, opacity: 0.55 },
                      ]}
                    />
                  )}
                </View>
              </View>
              <Text style={[styles.dayLabel, today && styles.dayLabelToday]}>
                {WEEKDAY_INITIAL[mondayIndex(day)]}
              </Text>
              {today && <View style={styles.todayDot} />}
            </View>
          );
        })}
      </View>

      <Text style={styles.cta}>OPEN THE MAP →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.lg,
    padding: spacing(3.5),
    gap: spacing(2.5),
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.995 }] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  title: { ...font.label, fontSize: 9.5, color: colors.arcCyan, letterSpacing: 1.8 },
  headRight: { ...font.label, fontSize: 9, color: colors.textFaint, letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  dayCol: { flex: 1, alignItems: 'center', gap: 5 },
  track: { height: TRACK_H, justifyContent: 'flex-end' },
  bar: {
    width: 15,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: { width: '100%' },
  dayLabel: { ...font.caption, fontSize: 9.5, color: colors.textFainter, fontWeight: '700' },
  dayLabelToday: { color: colors.arcCyan },
  todayDot: {
    position: 'absolute',
    bottom: -5,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.arcCyan,
  },
  cta: { ...font.label, fontSize: 9, color: colors.textFaint, letterSpacing: 1.4, textAlign: 'right' },
});
