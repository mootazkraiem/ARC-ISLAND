import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';
import { DailyLogEntry } from '../progression/types';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The 14-day chain grid from the approved design — same streak data the
 * app already tracks (`progress.dailyLog`), just shown as a denser grid
 * instead of 7 dots. No new data model. */
export function StreakChain({ dailyLog, days = 14 }: { dailyLog: DailyLogEntry[]; days?: number }) {
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    const active = dailyLog.some((e) => e.date === iso && e.completedReminderIds.length > 0);
    const isToday = i === days - 1;
    return { iso, active, isToday };
  });

  return (
    <View>
      <View style={styles.headerRow}>
        {Array.from({ length: days }, (_, i) => (
          <Text key={i} style={styles.dayLetter}>
            {DAY_LETTERS[i % 7]}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((c) => (
          <View
            key={c.iso}
            style={[
              styles.cell,
              { backgroundColor: c.active ? (c.isToday ? colors.xp : 'rgba(255,198,92,0.55)') : 'rgba(255,255,255,0.06)' },
              c.isToday && c.active && styles.cellToday,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', gap: 6, marginBottom: spacing(1.5) },
  dayLetter: { flex: 1, textAlign: 'center', ...font.label, fontSize: 8, letterSpacing: 0.5, color: colors.textFainter },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { flexBasis: '6.2%', aspectRatio: 1, borderRadius: 6, flexGrow: 1 },
  cellToday: {
    borderWidth: 1,
    borderColor: '#FFE3A8',
    shadowColor: colors.xp,
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
