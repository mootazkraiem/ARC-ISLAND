import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Category, Reminder } from '../types';
import { theme } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ReminderCard } from '../components/ReminderCard';
import { TodaysPath } from '../components/TodaysPath';
import { sortReminders } from '../reminderLogic';
import { parseQuickAdd } from '../nlParse';
import { useProgress } from '../progression/useProgress';
import { levelFromTotalXp, levelTitle } from '../progression/levels';
import { CompletionResult } from '../progression/types';
import { CircularRing } from '../components/CircularRing';

interface Props {
  reminders: Reminder[];
  onAdd: () => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => Promise<CompletionResult | null>;
  onQuickAdd: (parsed: ReturnType<typeof parseQuickAdd>) => void;
  onOpenAssistant: () => void;
  onOpenProgress: () => void;
  onOpenIdeaVault: () => void;
}

const FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'personal', label: 'Personal' },
  { key: 'work', label: 'Work' },
  { key: 'health', label: 'Health' },
  { key: 'errand', label: 'Errand' },
];

export function HomeScreen({
  reminders,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onComplete,
  onQuickAdd,
  onOpenAssistant,
  onOpenProgress,
  onOpenIdeaVault,
}: Props) {
  const [quickText, setQuickText] = useState('');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const progress = useProgress();
  const level = levelFromTotalXp(progress.totalXp);
  const levelName = levelTitle(level.level);

  const filtered = useMemo(
    () => (filter === 'all' ? reminders : reminders.filter((r) => r.category === filter)),
    [reminders, filter]
  );
  const sorted = sortReminders(filtered);
  const todayIso = new Date().toISOString().slice(0, 10);
  const completedTodayIds = useMemo(
    () => new Set(Object.entries(progress.lastCompletedDate).filter(([, d]) => d === todayIso).map(([id]) => id)),
    [progress.lastCompletedDate, todayIso]
  );

  const submitQuickAdd = () => {
    const trimmed = quickText.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onQuickAdd(parseQuickAdd(trimmed));
    setQuickText('');
  };

  const handleToggle = (id: string, enabled: boolean) => {
    Haptics.selectionAsync();
    onToggle(id, enabled);
  };

  const handleComplete = async (id: string) => {
    const result = await onComplete(id);
    if (!result) return;
    if (result.alreadyCompletedToday) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Already counted', "This one already earned its XP for today — it'll count again tomorrow.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>YOUR SCHEDULE</Text>
            <Text style={styles.title}>Reminders</Text>
          </View>
          <View style={styles.headerBtns}>
            <Pressable
              style={({ pressed }) => [pressed && styles.addBtnPressed]}
              onPress={onOpenProgress}
            >
              <CircularRing progress={level.xpIntoLevel / level.xpForThisLevel} size={40} strokeWidth={3} glow={false}>
                <Text style={styles.levelPillText}>{level.level}</Text>
              </CircularRing>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.assistantBtn, pressed && styles.addBtnPressed]}
              onPress={onOpenIdeaVault}
            >
              <Text style={styles.assistantBtnText}>💡</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.assistantBtn, pressed && styles.addBtnPressed]}
              onPress={onOpenAssistant}
            >
              <Text style={styles.assistantBtnText}>🎙️</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]} onPress={onAdd}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </Pressable>
          </View>
        </View>

        <TodaysPath reminders={reminders} onComplete={handleComplete} />

        <View style={styles.quickAddRow}>
          <TextInput
            value={quickText}
            onChangeText={setQuickText}
            placeholder='Try "call mom tomorrow 6pm" — tap 🎤 on your keyboard to dictate'
            placeholderTextColor={theme.colors.textFaint}
            style={styles.quickAddInput}
            returnKeyType="done"
            onSubmitEditing={submitQuickAdd}
          />
          <Pressable
            style={[styles.quickAddBtn, !quickText.trim() && styles.quickAddBtnDisabled]}
            disabled={!quickText.trim()}
            onPress={submitQuickAdd}
          >
            <Text style={styles.quickAddBtnText}>Parse</Text>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ReminderCard
                reminder={item}
                onPress={onEdit}
                onToggle={handleToggle}
                onDelete={onDelete}
                onComplete={handleComplete}
                completedToday={completedTodayIds.has(item.id)}
              />
            )}
          />
        )}

        {sorted.length > 0 && (
          <Text style={styles.hint}>Swipe right for Done · swipe left to delete</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(5) },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  eyebrow: { ...theme.font.label, color: theme.colors.textFaint, marginBottom: 4 },
  title: { ...theme.font.title, color: theme.colors.text },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  assistantBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantBtnText: { fontSize: 18 },
  levelPill: {
    paddingHorizontal: theme.spacing(3),
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelPillText: { color: theme.colors.text, fontWeight: '800', fontSize: 13 },
  addBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2.5),
    borderRadius: theme.radius.pill,
  },
  addBtnPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  quickAddRow: { flexDirection: 'row', gap: theme.spacing(2), marginBottom: theme.spacing(4) },
  quickAddInput: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    color: theme.colors.text,
    fontSize: 15,
  },
  quickAddBtn: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4),
    justifyContent: 'center',
  },
  quickAddBtnDisabled: { opacity: 0.4 },
  quickAddBtnText: { color: theme.colors.accent, fontWeight: '700', fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: theme.spacing(2), marginBottom: theme.spacing(4) },
  filterChip: {
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bgElevated,
  },
  filterChipActive: { backgroundColor: theme.colors.accent },
  filterChipText: { ...theme.font.caption, color: theme.colors.textDim, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
  listContent: { paddingBottom: theme.spacing(10) },
  hint: {
    ...theme.font.caption,
    color: theme.colors.textFaint,
    textAlign: 'center',
    paddingBottom: theme.spacing(4),
  },
});
