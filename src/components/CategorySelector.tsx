import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Category } from '../types';
import { theme } from '../theme';

const ORDER: Category[] = ['personal', 'work', 'health', 'errand', 'other'];

export function CategorySelector({
  value,
  onChange,
}: {
  value: Category;
  onChange: (v: Category) => void;
}) {
  return (
    <View style={styles.row}>
      {ORDER.map((cat) => {
        const active = value === cat;
        const meta = theme.category[cat];
        return (
          <Pressable
            key={cat}
            onPress={() => onChange(cat)}
            style={[styles.chip, active && { borderColor: meta.dot, backgroundColor: meta.dot + '26' }]}
          >
            <View style={[styles.dot, { backgroundColor: meta.dot }]} />
            <Text style={[styles.label, active && { color: theme.colors.text }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  label: { ...theme.font.caption, color: theme.colors.textDim, fontWeight: '600' },
});
