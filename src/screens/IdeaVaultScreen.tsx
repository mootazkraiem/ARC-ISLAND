import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { safeAlert } from '../alert';
import { theme } from '../theme';
import { fmtDate } from '../locale';
import { useVault } from '../thoughts/useVault';
import { Vault } from '../thoughts/vault';
import { Idea, IdeaStatus } from '../thoughts/types';

const KIND_LABEL: Record<Idea['kind'], string> = {
  idea: 'Idea',
  thought: 'Thought',
  note: 'Note',
  experiment: 'Experiment',
  goal: 'Goal',
};

const FILTERS: { key: IdeaStatus | 'active' | 'all'; label: string }[] = [
  { key: 'active', label: 'ACTIVE' },
  { key: 'promoted', label: 'PROMOTED' },
  { key: 'archived', label: 'ARCHIVED' },
  { key: 'dismissed', label: 'DISMISSED' },
  { key: 'all', label: 'ALL' },
];

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(d, { month: 'short', day: 'numeric' });
}

export function IdeaVaultScreen({ onBack }: { onBack: () => void }) {
  const vaultState = useVault(); // subscribe for re-renders on any Vault mutation
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('active');

  const ideas = useMemo(() => {
    if (filter === 'all') return Vault.listIdeas();
    return Vault.listIdeas(filter as any);
  }, [filter, vaultState]);

  const dueForReview = Vault.getDueForReview().length;

  const handleArchive = (idea: Idea) => Vault.setIdeaStatus(idea.id, 'archived');

  const handleDismiss = (idea: Idea) => {
    safeAlert('Dismiss this idea?', `"${idea.title}" will be marked dismissed. Nothing is erased — you can still find it under Dismissed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', style: 'destructive', onPress: () => Vault.setIdeaStatus(idea.id, 'dismissed') },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>VAULT</Text>
      </View>

      <Text style={styles.title}>Idea Vault</Text>
      <Text style={styles.subtitle}>
        Captured, not committed. Nothing here earns XP — this is where things get to just exist for a while.
      </Text>

      {dueForReview > 0 && (
        <Text style={styles.reviewNote}>{dueForReview} idea(s) ready to revisit whenever you like.</Text>
      )}

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
            <Pressable onPress={() => setFilter(item.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {ideas.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={styles.emptyText}>Nothing here yet. Tell Arc Island "I have an idea..." to capture one.</Text>
        </View>
      ) : (
        <FlatList
          data={ideas}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.kindPill}>
                  <Text style={styles.kindPillText}>{KIND_LABEL[item.kind].toUpperCase()}</Text>
                </View>
                <Text style={styles.date}>{relativeDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody} numberOfLines={2}>
                {item.originalText}
              </Text>

              {item.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {item.tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}

              {item.status === 'promoted' && <Text style={styles.promotedNote}>→ Promoted to a project</Text>}
              {item.status === 'dismissed' && <Text style={styles.dismissedNote}>Dismissed</Text>}
              {item.status === 'archived' && <Text style={styles.archivedNote}>Archived</Text>}

              {(item.status === 'captured' || item.status === 'review') && (
                <View style={styles.actionRow}>
                  <Text style={styles.promoteHint}>Ask Arc Island to promote this to a project →</Text>
                  <View style={styles.actionBtns}>
                    <Pressable onPress={() => handleArchive(item)} style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>Archive</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDismiss(item)} style={styles.smallBtn}>
                      <Text style={[styles.smallBtnText, { color: theme.colors.danger }]}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(5) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: theme.spacing(4) },
  backText: { color: theme.colors.accent, fontSize: 16, fontWeight: '600' },
  eyebrow: { ...theme.font.label, color: theme.colors.textFaint, letterSpacing: 1.5 },
  title: { ...theme.font.title, color: theme.colors.text, marginTop: theme.spacing(3) },
  subtitle: { ...theme.font.caption, color: theme.colors.textDim, marginTop: theme.spacing(1.5), marginBottom: theme.spacing(3), lineHeight: 18 },
  reviewNote: { ...theme.font.caption, color: theme.colors.accent, marginBottom: theme.spacing(3) },
  filterList: { flexGrow: 0, marginBottom: theme.spacing(3) },
  filterChip: { paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1.5), borderRadius: theme.radius.pill, backgroundColor: theme.colors.bgElevated },
  filterChipActive: { backgroundColor: theme.colors.accent },
  filterChipText: { ...theme.font.caption, color: theme.colors.textDim, fontWeight: '700', letterSpacing: 0.5 },
  filterChipTextActive: { color: '#FFFFFF' },
  list: { paddingBottom: theme.spacing(10) },
  empty: { alignItems: 'center', paddingTop: theme.spacing(12) },
  emptyIcon: { fontSize: 32, marginBottom: theme.spacing(3) },
  emptyText: { ...theme.font.body, color: theme.colors.textDim, textAlign: 'center', paddingHorizontal: theme.spacing(8) },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(4),
    marginBottom: theme.spacing(3),
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing(2) },
  kindPill: { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(2.5), paddingVertical: 3 },
  kindPillText: { ...theme.font.caption, color: theme.colors.accent, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },
  date: { ...theme.font.caption, color: theme.colors.textFaint },
  cardTitle: { ...theme.font.body, color: theme.colors.text, fontWeight: '700', fontSize: 16, marginBottom: theme.spacing(1) },
  cardBody: { ...theme.font.caption, color: theme.colors.textDim, lineHeight: 18, marginBottom: theme.spacing(2) },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing(2) },
  tag: { backgroundColor: theme.colors.bgElevated, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  tagText: { ...theme.font.caption, color: theme.colors.textFaint, fontSize: 10 },
  promotedNote: { ...theme.font.caption, color: theme.colors.success, fontWeight: '700' },
  dismissedNote: { ...theme.font.caption, color: theme.colors.textFaint },
  archivedNote: { ...theme.font.caption, color: theme.colors.textFaint },
  actionRow: { marginTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.divider, paddingTop: theme.spacing(2) },
  promoteHint: { ...theme.font.caption, color: theme.colors.textFaint, fontSize: 11, marginBottom: theme.spacing(2) },
  actionBtns: { flexDirection: 'row', gap: theme.spacing(3) },
  smallBtn: { paddingVertical: 4 },
  smallBtnText: { ...theme.font.caption, color: theme.colors.textDim, fontWeight: '700' },
});
