import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing, category as categoryTokens } from '../theme';
import { Reminder } from '../types';
import {
  WEEKDAY_LABELS,
  addDays,
  endOfMonth,
  isSameDay,
  occurrencesForDay,
  startOfMonth,
  startOfWeek,
  toISODate,
} from './occurrences';

// ─────────────────────────────────────────────────────────────────────────
// Month view — deliberately NOT a miniature week grid.
//
// At month scale the useful question is not "what time is it at" but "how
// heavy is that day, and did I hold the line". So each cell renders:
//   - the date numeral
//   - a CHARGE BAR whose height tracks how full the day is
//   - up to four category pips, one per quest, in category hue
// Completed days get a sealed ring around the numeral. That makes a month
// read as a record of consistency rather than a wall planner.
// ─────────────────────────────────────────────────────────────────────────

export interface MonthGridProps {
  reminders: Reminder[];
  anchor: Date;
  completedDates: Record<string, string>;
  onPickDay: (day: Date) => void;
  selected: Date;
}

const MAX_LOAD = 6; // quests per day at which the charge bar is full

export function MonthGrid({ reminders, anchor, completedDates, onPickDay, selected }: MonthGridProps) {
  const now = new Date();

  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(anchor));
    const last = endOfMonth(anchor);
    const out: Date[][] = [];
    let cursor = first;
    // Always render whole weeks, and keep going until the month is fully
    // covered — a month can span 4, 5 or 6 rendered weeks.
    while (cursor <= last || out.length < 5) {
      const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
      out.push(week);
      cursor = addDays(cursor, 7);
      if (out.length >= 6) break;
    }
    return out;
  }, [anchor]);

  return (
    <View style={styles.wrap}>
      <View style={styles.dowRow}>
        {WEEKDAY_LABELS.map((l) => (
          <Text key={l} style={styles.dowLabel}>
            {l.slice(0, 1)}
          </Text>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day) => {
              const occs = occurrencesForDay(reminders, day, { completedDates, now });
              const inMonth = day.getMonth() === anchor.getMonth();
              const isToday = isSameDay(day, now);
              const isSelected = isSameDay(day, selected);
              const doneCount = occs.filter((o) => o.state === 'completed').length;
              const allDone = occs.length > 0 && doneCount === occs.length;
              const load = Math.min(1, occs.length / MAX_LOAD);

              return (
                <Pressable
                  key={toISODate(day)}
                  onPress={() => onPickDay(day)}
                  style={({ pressed }) => [
                    styles.cell,
                    isSelected && styles.cellSelected,
                    pressed && styles.cellPressed,
                  ]}
                >
                  {/* charge bar — the day's weight, drawn from the bottom */}
                  {occs.length > 0 && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.charge,
                        {
                          height: `${8 + load * 78}%`,
                          backgroundColor: allDone
                            ? 'rgba(55,225,180,0.16)'
                            : 'rgba(124,92,255,0.15)',
                        },
                      ]}
                    />
                  )}

                  <View
                    style={[
                      styles.numWrap,
                      isToday && styles.numWrapToday,
                      allDone && styles.numWrapSealed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.num,
                        !inMonth && styles.numOut,
                        isToday && styles.numToday,
                        allDone && styles.numSealed,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>

                  <View style={styles.pips}>
                    {occs.slice(0, 4).map((o) => (
                      <View
                        key={o.key}
                        style={[
                          styles.pip,
                          {
                            backgroundColor:
                              o.state === 'completed'
                                ? colors.done
                                : o.state === 'overdue'
                                ? colors.due
                                : categoryTokens[o.reminder.category]?.dot ?? colors.signal,
                          },
                          o.state === 'completed' && { opacity: 0.55 },
                        ]}
                      />
                    ))}
                    {occs.length > 4 && <Text style={styles.more}>+{occs.length - 4}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  dowRow: { flexDirection: 'row', paddingBottom: spacing(2) },
  dowLabel: {
    flex: 1,
    ...font.label,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.textFainter,
    textAlign: 'center',
  },
  scrollBody: { paddingBottom: spacing(6), gap: spacing(1.5) },
  weekRow: { flexDirection: 'row', gap: spacing(1.5) },
  cell: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(124,158,255,0.10)',
    backgroundColor: 'rgba(17,20,42,0.38)',
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 5,
    gap: 3,
  },
  cellSelected: {
    borderColor: colors.holoBorderLit,
    backgroundColor: 'rgba(28,32,62,0.7)',
  },
  cellPressed: { opacity: 0.7 },
  charge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  numWrap: {
    minWidth: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numWrapToday: {
    backgroundColor: colors.arcCyanSoft,
    borderWidth: 1,
    borderColor: 'rgba(92,225,255,0.5)',
  },
  numWrapSealed: { borderWidth: 1, borderColor: 'rgba(55,225,180,0.45)', borderRadius: 999 },
  num: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 11.5, color: colors.textDim },
  numOut: { color: 'rgba(122,122,146,0.4)' },
  numToday: { color: colors.arcCyan },
  numSealed: { color: colors.done },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 2 },
  pip: { width: 4.5, height: 4.5, borderRadius: 3 },
  more: { ...font.caption, fontSize: 7.5, color: colors.textFainter, marginLeft: 1 },
});
