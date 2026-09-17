import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { Reminder } from '../types';
import { category as categoryTokens, colors, font, radii, spacing } from '../theme';
import { formatRelativeDay, formatTime, getNextOccurrence, repeatLabel } from '../reminderLogic';
import { computeBaseXp } from '../progression/xpRules';
import { SystemGlyph } from './SystemGlyph';

// ─────────────────────────────────────────────────────────────────────────
// A single quest in the log.
//
// The row is a holographic surface with a category spine down its left
// edge, so a scrolled list reads as a colour rhythm rather than a stack of
// grey rectangles. The seal control on the left is the quest-diamond glyph,
// not a checkbox — completing a quest SEALS it, and the glyph charges.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  reminder: Reminder;
  onToggle: (id: string, enabled: boolean) => void;
  onPress: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  /** Whether this quest already earned its XP today. */
  completedToday?: boolean;
}

export function ReminderCard({ reminder, onToggle, onPress, onDelete, onComplete, completedToday }: Props) {
  const next = getNextOccurrence(reminder);
  const dim = !reminder.enabled;
  const swipeRef = useRef<Swipeable>(null);
  const categoryMeta = categoryTokens[reminder.category] ?? categoryTokens.other;
  const xp = computeBaseXp(reminder.title, reminder.category).totalXp;
  const overdue = !completedToday && reminder.enabled && next.getTime() < Date.now();

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
    return (
      <Pressable
        style={[styles.action, styles.completeAction]}
        onPress={() => {
          swipeRef.current?.close();
          onComplete(reminder.id);
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center', gap: 3 }}>
          <SystemGlyph name="check" size={17} color={colors.void} strokeWidth={2.4} />
          <Text style={styles.actionText}>SEAL</Text>
        </Animated.View>
      </Pressable>
    );
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
    return (
      <Pressable
        style={[styles.action, styles.deleteAction]}
        onPress={() => {
          swipeRef.current?.close();
          safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
          safeAlert('Release this quest?', `"${reminder.title}" leaves the world and its summons is cancelled.`, [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Release',
              style: 'destructive',
              onPress: () => {
                safeHaptics.notification(Haptics.NotificationFeedbackType.Warning);
                onDelete(reminder.id);
              },
            },
          ]);
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center', gap: 3 }}>
          <SystemGlyph name="close" size={16} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={[styles.actionText, { color: '#FFFFFF' }]}>RELEASE</Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        onPress={() => onPress(reminder)}
        style={({ pressed }) => [styles.card, dim && styles.cardDim, pressed && styles.cardPressed]}
      >
        {/* category spine */}
        <View style={[styles.spine, { backgroundColor: dim ? colors.textFainter : categoryMeta.dot }]} />

        {/* seal control — tap to complete inline */}
        <Pressable
          hitSlop={8}
          onPress={() => {
            if (!completedToday) onComplete(reminder.id);
          }}
          style={styles.sealBtn}
        >
          <SystemGlyph
            name={completedToday ? 'questComplete' : overdue ? 'questOverdue' : 'quest'}
            size={23}
            color={completedToday ? colors.done : overdue ? colors.due : colors.textFaint}
            charged={completedToday}
            strokeWidth={1.5}
          />
        </Pressable>

        <View style={styles.timeBlock}>
          <Text style={[styles.time, dim && styles.textDim]}>{formatTime(reminder.time)}</Text>
          <Text style={[styles.day, overdue && { color: colors.due }]}>{formatRelativeDay(next)}</Text>
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, dim && styles.textDim, completedToday && styles.titleDone]} numberOfLines={1}>
            {reminder.title}
          </Text>
          <View style={styles.tagRow}>
            {reminder.repeat !== 'once' && (
              <View style={styles.tag}>
                <SystemGlyph name="repeat" size={9} color={colors.signal} strokeWidth={1.8} />
                <Text style={styles.tagText}>{repeatLabel(reminder.repeat)}</Text>
              </View>
            )}
            <View style={[styles.tag, { borderColor: `${categoryMeta.dot}44` }]}>
              <Text style={[styles.tagText, { color: categoryMeta.dot }]}>
                {categoryMeta.label.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.trailing}>
          <Text style={[styles.xpLabel, { color: completedToday ? colors.done : colors.xp }]}>
            {completedToday ? 'SEALED' : `+${xp}`}
          </Text>
          <Switch
            value={reminder.enabled}
            onValueChange={(v) => onToggle(reminder.id, v)}
            trackColor={{ false: colors.divider, true: colors.signal }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={colors.divider}
            style={styles.switch}
          />
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.holo,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    paddingVertical: spacing(3),
    paddingLeft: spacing(3.5),
    paddingRight: spacing(3.5),
    marginBottom: spacing(2),
    overflow: 'hidden',
  },
  cardDim: { opacity: 0.5 },
  cardPressed: { transform: [{ scale: 0.99 }], backgroundColor: colors.holoRaise },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  sealBtn: { marginRight: spacing(2.5), alignItems: 'center', justifyContent: 'center' },
  timeBlock: { minWidth: 62, marginRight: spacing(2) },
  time: { ...font.rowTitle, color: colors.textSecondary, fontSize: 13.5 },
  day: { ...font.caption, color: colors.arcCyan, marginTop: 1, fontSize: 9.5, fontWeight: '700' },
  body: { flex: 1, paddingRight: spacing(2) },
  title: { ...font.rowTitle, color: colors.textSecondary, fontSize: 14.5 },
  titleDone: { textDecorationLine: 'line-through', color: colors.textFainter },
  tagRow: { flexDirection: 'row', marginTop: spacing(1.25), gap: spacing(1.5) },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.28)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
  },
  tagText: { ...font.label, color: colors.signal, fontSize: 8, letterSpacing: 1 },
  textDim: { color: colors.textDim },
  trailing: { alignItems: 'flex-end', gap: spacing(1.5) },
  xpLabel: { fontFamily: font.numeral.fontFamily, fontWeight: '800' as const, fontSize: 11 },
  switch: { transform: [{ scale: 0.74 }] },
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 84,
    marginBottom: spacing(2),
    borderRadius: radii.lg,
  },
  completeAction: { backgroundColor: colors.done },
  deleteAction: { backgroundColor: colors.danger },
  actionText: { ...font.label, color: colors.void, fontSize: 8.5, letterSpacing: 1.2 },
});
