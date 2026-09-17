import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { Category, Reminder } from '../types';
import { fmtNumber } from '../locale';
import { colors, font, radii, spacing } from '../theme';
import { WorldBackground } from '../components/world/WorldBackground';
import { SystemPanel } from '../components/SystemPanel';
import { SystemGlyph } from '../components/SystemGlyph';
import { SystemOrb } from '../components/SystemOrb';
import { WeekPulse } from '../components/WeekPulse';
import { ReminderCard } from '../components/ReminderCard';
import { TodaysPath } from '../components/TodaysPath';
import { EmptyState } from '../components/EmptyState';
import { sortReminders } from '../reminderLogic';
import { parseQuickAdd } from '../nlParse';
import { useProgress } from '../progression/useProgress';
import { levelFromTotalXp, levelTitle } from '../progression/levels';
import { CompletionResult } from '../progression/types';
import { CircularRing } from '../components/CircularRing';
import { occurrencesForDay, toISODate } from '../calendar/occurrences';

// ─────────────────────────────────────────────────────────────────────────
// HOME — the entrance to Arc Island.
//
// Hierarchy, top to bottom, and deliberately NOT a stack of equal cards:
//
//   1. WORLD          the atmosphere, always behind everything
//   2. SYSTEM GREETING a spoken-voice line that reads the real schedule
//   3. PLAYER STATUS   level ring + XP + streak, the widest element
//   4. QUESTS OF THE DAY
//   5. THE SYSTEM      a console strip, the only glowing thing down here
//   6. QUEST CALENDAR  a week pulse, not a mini grid
//   7. CLAIM A QUEST   pinned, the single primary action
//
// Sizes, weights and glow are all doing hierarchy work here: exactly one
// element (the System strip) carries an accent glow, matching the design
// system's "at most one or two glowing things per frame" rule.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  reminders: Reminder[];
  onAdd: () => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => Promise<CompletionResult | null>;
  onQuickAdd: (parsed: ReturnType<typeof parseQuickAdd>) => void;
  onOpenSystem: () => void;
  onOpenProgress: () => void;
  onOpenIdeaVault: () => void;
  onOpenCalendar: () => void;
  hasProposal: boolean;
}

const FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'personal', label: 'PERSONAL' },
  { key: 'work', label: 'WORK' },
  { key: 'health', label: 'HEALTH' },
  { key: 'errand', label: 'ERRAND' },
];

/** The System's greeting line. It reads the real schedule rather than
 * producing flavour text — every branch below is a fact the user can
 * verify by looking at their own quests. */
function systemGreeting(
  todayCount: number,
  remainingCount: number,
  overdueCount: number,
  streak: number
): string {
  const hour = new Date().getHours();
  if (overdueCount > 0) {
    return `You have ${overdueCount} unfinished quest${overdueCount === 1 ? '' : 's'}.`;
  }
  if (todayCount === 0) {
    return hour < 12 ? 'The day is unclaimed.' : 'Nothing stands between you and the evening.';
  }
  if (remainingCount === 0) {
    return streak > 1 ? `Today is sealed. ${streak} days unbroken.` : 'Today is sealed.';
  }
  if (hour < 12) return `${remainingCount} quest${remainingCount === 1 ? '' : 's'} ahead of you today.`;
  if (hour < 18) return `${remainingCount} remaining before the day closes.`;
  return `${remainingCount} still open tonight.`;
}

export function HomeScreen({
  reminders,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onComplete,
  onQuickAdd,
  onOpenSystem,
  onOpenProgress,
  onOpenIdeaVault,
  onOpenCalendar,
  hasProposal,
}: Props) {
  const [quickText, setQuickText] = useState('');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const progress = useProgress();
  const level = levelFromTotalXp(progress.totalXp);

  const filtered = useMemo(
    () => (filter === 'all' ? reminders : reminders.filter((r) => r.category === filter)),
    [reminders, filter]
  );
  const sorted = sortReminders(filtered);
  const todayIso = toISODate(new Date());
  const completedTodayIds = useMemo(
    () =>
      new Set(
        Object.entries(progress.lastCompletedDate)
          .filter(([, d]) => d === todayIso)
          .map(([id]) => id)
      ),
    [progress.lastCompletedDate, todayIso]
  );

  const todayOccs = useMemo(
    () => occurrencesForDay(reminders, new Date(), { completedDates: progress.lastCompletedDate }),
    [reminders, progress.lastCompletedDate]
  );
  const remainingToday = todayOccs.filter((o) => o.state !== 'completed').length;
  const overdueToday = todayOccs.filter((o) => o.state === 'overdue').length;

  const greeting = systemGreeting(
    todayOccs.length,
    remainingToday,
    overdueToday,
    progress.currentStreak
  );

  const submitQuickAdd = () => {
    const trimmed = quickText.trim();
    if (!trimmed) return;
    safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    onQuickAdd(parseQuickAdd(trimmed));
    setQuickText('');
  };

  const handleToggle = (id: string, enabled: boolean) => {
    safeHaptics.selection();
    onToggle(id, enabled);
  };

  const handleComplete = async (id: string) => {
    const result = await onComplete(id);
    if (!result) return;
    if (result.alreadyCompletedToday) {
      safeHaptics.notification(Haptics.NotificationFeedbackType.Warning);
      safeAlert('Already sealed', 'This quest has already granted its XP today. It counts again tomorrow.');
      return;
    }
    safeHaptics.notification(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={styles.root}>
      <WorldBackground />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 2 · SYSTEM GREETING ──────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(320)} style={styles.greetBlock}>
            <View style={styles.greetTop}>
              <Text style={styles.worldMark}>ARC ISLAND</Text>
              <View style={styles.greetIcons}>
                <Pressable onPress={onOpenIdeaVault} hitSlop={10} style={styles.iconBtn}>
                  <SystemGlyph name="vault" size={17} color={colors.textDim} />
                </Pressable>
                <Pressable onPress={onOpenProgress} hitSlop={10} style={styles.iconBtn}>
                  <SystemGlyph name="cards" size={17} color={colors.textDim} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.greetLine}>{greeting}</Text>
          </Animated.View>

          {/* ── 3 · PLAYER STATUS ────────────────────────────────────── */}
          <Pressable onPress={onOpenProgress}>
            <SystemPanel tone="signal" bracket={16} style={styles.statusPanel}>
              <View style={styles.statusRow}>
                <CircularRing
                  progress={level.xpIntoLevel / level.xpForThisLevel}
                  size={62}
                  strokeWidth={4}
                  color={colors.signal}
                >
                  <Text style={styles.ringNum}>{level.level}</Text>
                </CircularRing>

                <View style={styles.statusInfo}>
                  <Text style={styles.statusTitle}>{levelTitle(level.level)}</Text>
                  <Text style={styles.statusSub}>
                    {fmtNumber(level.xpIntoLevel)} / {fmtNumber(level.xpForThisLevel)} XP
                  </Text>
                  <View style={styles.xpTrack}>
                    <View
                      style={[
                        styles.xpFill,
                        { width: `${Math.min(100, (level.xpIntoLevel / level.xpForThisLevel) * 100)}%` },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.streakCol}>
                  <SystemGlyph
                    name="streak"
                    size={20}
                    color={progress.currentStreak > 0 ? colors.done : colors.textFainter}
                    charged={progress.currentStreak > 0}
                  />
                  <Text
                    style={[
                      styles.streakNum,
                      { color: progress.currentStreak > 0 ? colors.done : colors.textFainter },
                    ]}
                  >
                    {progress.currentStreak}
                  </Text>
                  <Text style={styles.streakLabel}>STREAK</Text>
                </View>
              </View>
            </SystemPanel>
          </Pressable>

          {/* ── 4 · QUESTS OF THE DAY ────────────────────────────────── */}
          <TodaysPath reminders={reminders} onComplete={handleComplete} />

          {/* ── 5 · THE SYSTEM ───────────────────────────────────────── */}
          <Pressable onPress={onOpenSystem}>
            <SystemPanel tone="signal" lit bracket={16} style={styles.systemStrip}>
              <SystemOrb state="idle" size={30} />
              <View style={styles.systemStripText}>
                <Text style={styles.systemStripTitle}>SPEAK TO THE SYSTEM</Text>
                <Text style={styles.systemStripSub}>
                  {hasProposal ? 'A forged week awaits your decision' : 'Claim quests by voice · forge your week'}
                </Text>
              </View>
              <SystemGlyph name="voice" size={18} color={colors.signal} />
            </SystemPanel>
          </Pressable>

          {/* ── 6 · QUEST CALENDAR PREVIEW ───────────────────────────── */}
          <WeekPulse
            reminders={reminders}
            completedDates={progress.lastCompletedDate}
            onPress={onOpenCalendar}
          />

          {/* ── the full quest log ───────────────────────────────────── */}
          <View style={styles.logHeader}>
            <Text style={styles.sectionLabel}>ALL QUESTS</Text>
            <Text style={styles.logCount}>{sorted.length}</Text>
          </View>

          <View style={styles.quickAddRow}>
            <TextInput
              value={quickText}
              onChangeText={setQuickText}
              placeholder={'Claim by writing — "call mom tomorrow 6pm"'}
              placeholderTextColor={colors.textFainter}
              style={styles.quickAddInput}
              returnKeyType="done"
              onSubmitEditing={submitQuickAdd}
            />
            <Pressable
              style={[styles.quickAddBtn, !quickText.trim() && styles.quickAddBtnDisabled]}
              disabled={!quickText.trim()}
              onPress={submitQuickAdd}
            >
              <SystemGlyph
                name="claim"
                size={17}
                color={quickText.trim() ? colors.signal : colors.textFainter}
              />
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    safeHaptics.selection();
                    setFilter(f.key);
                  }}
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
            <View style={styles.list}>
              {sorted.map((item) => (
                <ReminderCard
                  key={item.id}
                  reminder={item}
                  onPress={onEdit}
                  onToggle={handleToggle}
                  onDelete={onDelete}
                  onComplete={handleComplete}
                  completedToday={completedTodayIds.has(item.id)}
                />
              ))}
              <Text style={styles.hint}>Swipe right to seal · swipe left to release</Text>
            </View>
          )}
        </ScrollView>

        {/* ── 7 · CLAIM A QUEST — pinned primary action ─────────────── */}
        <View style={styles.claimDock} pointerEvents="box-none">
          <Pressable
            onPress={() => {
              safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
              onAdd();
            }}
            style={({ pressed }) => [styles.claimBtn, pressed && styles.claimBtnPressed]}
          >
            <SystemGlyph name="claim" size={18} color="#FFFFFF" strokeWidth={1.9} />
            <Text style={styles.claimBtnText}>CLAIM A QUEST</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  scrollBody: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(5),
    paddingBottom: spacing(26),
    gap: spacing(3.5),
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },

  greetBlock: { gap: spacing(2) },
  greetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  worldMark: { ...font.label, fontSize: 10, color: colors.arcCyan, letterSpacing: 3.2 },
  greetIcons: { flexDirection: 'row', gap: spacing(2) },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
  },
  greetLine: {
    ...font.display,
    fontSize: 25,
    lineHeight: 31,
    color: colors.text,
    letterSpacing: -0.5,
  },

  statusPanel: { padding: spacing(4) },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3.5) },
  ringNum: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 20, color: colors.text },
  statusInfo: { flex: 1, gap: 4 },
  statusTitle: { ...font.heading, fontSize: 16, color: colors.text },
  statusSub: { ...font.caption, fontSize: 11, color: colors.xp, fontWeight: '700' },
  xpTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    marginTop: 3,
  },
  xpFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.signal,
    shadowColor: colors.signal,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  streakCol: { alignItems: 'center', gap: 1, minWidth: 46 },
  streakNum: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 17 },
  streakLabel: { ...font.label, fontSize: 7.5, color: colors.textFainter, letterSpacing: 1.2 },

  systemStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
  },
  systemStripText: { flex: 1, gap: 1 },
  systemStripTitle: { ...font.label, fontSize: 10, color: colors.signal, letterSpacing: 1.8 },
  systemStripSub: { ...font.caption, fontSize: 11, color: colors.textFaint },

  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing(2),
  },
  sectionLabel: { ...font.label, fontSize: 9.5, color: colors.textFainter, letterSpacing: 2.2 },
  logCount: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 12, color: colors.textFaint },

  quickAddRow: { flexDirection: 'row', gap: spacing(2) },
  quickAddInput: {
    flex: 1,
    backgroundColor: 'rgba(4,4,7,0.45)',
    borderWidth: 1,
    borderColor: colors.holoBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    color: colors.text,
    fontSize: 14,
  },
  quickAddBtn: {
    width: 48,
    borderRadius: radii.md,
    backgroundColor: colors.signalSoft,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnDisabled: { opacity: 0.4 },

  filterRow: { flexDirection: 'row', gap: spacing(1.5), flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    backgroundColor: colors.holo,
  },
  filterChipActive: { backgroundColor: colors.signalSoft, borderColor: 'rgba(124,92,255,0.5)' },
  filterChipText: { ...font.label, fontSize: 8.5, color: colors.textFaint, letterSpacing: 1.2 },
  filterChipTextActive: { color: colors.signal },

  list: { gap: 0 },
  hint: {
    ...font.caption,
    fontSize: 10.5,
    color: colors.textFainter,
    textAlign: 'center',
    marginTop: spacing(2),
  },

  claimDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(4),
    paddingBottom: Platform.OS === 'web' ? spacing(5) : spacing(9),
    paddingTop: spacing(3),
    alignItems: 'center',
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    width: '100%',
    maxWidth: 420,
    paddingVertical: spacing(4),
    borderRadius: radii.pill,
    backgroundColor: colors.signal,
    shadowColor: colors.signal,
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  claimBtnPressed: { transform: [{ scale: 0.975 }], opacity: 0.92 },
  claimBtnText: { ...font.label, fontSize: 12, color: '#FFFFFF', letterSpacing: 2.2 },
});
