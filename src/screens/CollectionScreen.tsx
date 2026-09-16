import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { useProgress } from '../progression/useProgress';
import { CARD_DEFINITIONS } from '../progression/cardDefinitions';
import { CardDefinition, CardKind } from '../progression/types';
import { CardTile } from '../components/CardTile';
import { CardDetailSheet } from '../components/CardDetailSheet';

const FILTERS: { key: CardKind | 'all'; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'skill', label: 'SKILLS' },
  { key: 'achievement', label: 'ACHIEVEMENTS' },
  { key: 'streak', label: 'STREAKS' },
  { key: 'milestone', label: 'MILESTONES' },
];

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const progress = useProgress();
  const [filter, setFilter] = useState<CardKind | 'all'>('all');
  const [selected, setSelected] = useState<CardDefinition | null>(null);

  const unlockedCount = Object.keys(progress.unlockedCards).length;
  const totalCount = CARD_DEFINITIONS.length;

  const filtered = useMemo(
    () => (filter === 'all' ? CARD_DEFINITIONS : CARD_DEFINITIONS.filter((c) => c.kind === filter)),
    [filter]
  );

  // Unlocked cards surface first, then locked ones — the archive rewards
  // what you've found without hiding how much is left.
  const ordered = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aUnlocked = !!progress.unlockedCards[a.id];
        const bUnlocked = !!progress.unlockedCards[b.id];
        if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
        return 0;
      }),
    [filtered, progress.unlockedCards]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>ARCHIVE</Text>
      </View>

      <Text style={styles.title}>Collection</Text>
      <Text style={styles.count}>
        {unlockedCount} / {totalCount} DISCOVERED
      </Text>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        style={styles.filterList}
        contentContainerStyle={{ gap: theme.spacing(2) }}
        renderItem={({ item }) => {
          const active = filter === item.key;
          return (
            <Pressable
              onPress={() => setFilter(item.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      <FlatList
        data={ordered}
        key="grid-2"
        numColumns={2}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <CardTile
            card={item}
            unlocked={!!progress.unlockedCards[item.id]}
            unlockedAt={progress.unlockedCards[item.id]}
            onPress={() => setSelected(item)}
          />
        )}
      />

      <CardDetailSheet
        card={selected}
        unlocked={!!(selected && progress.unlockedCards[selected.id])}
        unlockedAt={selected ? progress.unlockedCards[selected.id] : undefined}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(5) },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing(4),
  },
  backText: { color: theme.colors.accent, fontSize: 16, fontWeight: '600' },
  eyebrow: { ...theme.font.label, color: theme.colors.textFaint, letterSpacing: 1.5 },
  title: { ...theme.font.title, color: theme.colors.text, marginTop: theme.spacing(3) },
  count: { ...theme.font.caption, color: theme.colors.accent, letterSpacing: 1, fontWeight: '700', marginTop: 4, marginBottom: theme.spacing(4) },
  filterList: { flexGrow: 0, marginBottom: theme.spacing(3) },
  filterChip: {
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bgElevated,
  },
  filterChipActive: { backgroundColor: theme.colors.accent },
  filterChipText: { ...theme.font.caption, color: theme.colors.textDim, fontWeight: '700', letterSpacing: 0.5 },
  filterChipTextActive: { color: '#FFFFFF' },
  grid: { paddingBottom: theme.spacing(10) },
});
