import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RepeatMode } from '../types';
import { colors, font, radii, spacing } from '../theme';
import { SystemGlyph, GlyphName } from './SystemGlyph';

const OPTIONS: { key: RepeatMode; label: string; glyph: GlyphName }[] = [
  { key: 'once', label: 'ONCE', glyph: 'quest' },
  { key: 'daily', label: 'DAILY', glyph: 'repeat' },
  { key: 'weekly', label: 'WEEKLY', glyph: 'calendar' },
];

export function RepeatSelector({
  value,
  onChange,
}: {
  value: RepeatMode;
  onChange: (v: RepeatMode) => void;
}) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <SystemGlyph
              name={opt.glyph}
              size={14}
              color={active ? colors.signal : colors.textFainter}
              strokeWidth={1.6}
            />
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing(2) },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.75),
    borderRadius: radii.md,
    backgroundColor: 'rgba(4,4,7,0.4)',
    borderWidth: 1,
    borderColor: colors.holoBorder,
  },
  pillActive: { backgroundColor: colors.signalSoft, borderColor: 'rgba(124,92,255,0.5)' },
  pillText: { ...font.label, fontSize: 9, color: colors.textFaint, letterSpacing: 1.2 },
  pillTextActive: { color: colors.signal },
});
