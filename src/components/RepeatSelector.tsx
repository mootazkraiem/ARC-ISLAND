import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RepeatMode } from '../types';
import { theme } from '../theme';

const OPTIONS: { key: RepeatMode; label: string }[] = [
  { key: 'once', label: 'Once' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
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
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  pill: {
    flex: 1,
    paddingVertical: theme.spacing(3),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  pillText: { ...theme.font.body, color: theme.colors.textDim, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
});
