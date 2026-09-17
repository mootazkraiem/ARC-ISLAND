import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Category } from '../types';
import { category as categoryTokens, colors, font, radii, spacing } from '../theme';

const ORDER: Category[] = ['personal', 'work', 'health', 'errand', 'other'];

/** The five paths a quest can belong to. The dot is the same hue the quest
 * block, card spine and calendar column use for that path, so the colour
 * means one thing everywhere in the world. */
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
        const meta = categoryTokens[cat];
        return (
          <Pressable
            key={cat}
            onPress={() => onChange(cat)}
            style={[
              styles.chip,
              active && { borderColor: meta.dot, backgroundColor: meta.dot + '1F' },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: meta.dot },
                active && {
                  shadowColor: meta.dot,
                  shadowOpacity: 0.9,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 0 },
                },
              ]}
            />
            <Text style={[styles.label, active && { color: colors.text }]}>
              {meta.label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: 'rgba(4,4,7,0.4)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  label: { ...font.label, fontSize: 8.5, color: colors.textFaint, letterSpacing: 1.2 },
});
