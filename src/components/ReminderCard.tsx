import React, { useRef } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../haptics';
import { safeAlert } from '../alert';
import { Reminder } from '../types';
import { category as categoryTokens, colors, font, radii, spacing } from '../theme';
import { formatRelativeDay, formatTime, getNextOccurrence, repeatLabel } from '../reminderLogic';
import { computeBaseXp } from '../progression/xpRules';

interface Props {
  reminder: Reminder;
  onToggle: (id: string, enabled: boolean) => void;
  onPress: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  /** Whether this reminder already earned its XP today — drives the
   * checked/settled row treatment from the approved design. */
  completedToday?: boolean;
}

export function ReminderCard({ reminder, onToggle, onPress, onDelete, onComplete, completedToday }: Props) {
  const next = getNextOccurrence(reminder);
  const dim = !reminder.enabled;
  const swipeRef = useRef<Swipeable>(null);
  const categoryMeta = categoryTokens[reminder.category] ?? categoryTokens.other;
  const xp = computeBaseXp(reminder.title, reminder.category).totalXp;

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
        <Animated.Text style={[styles.actionText, { transform: [{ scale }] }]}>Done</Animated.Text>
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
          safeAlert('Delete this reminder?', `"${reminder.title}" will be removed and its notification cancelled.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                safeHaptics.notification(Haptics.NotificationFeedbackType.Warning);
                onDelete(reminder.id);
              },
            },
          ]);
        }}
      >
        <Animated.Text style={[styles.actionText, { transform: [{ scale }] }]}>Delete</Animated.Text>
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
        {/* Tap the checkbox to complete inline (matches the approved design's
            row interaction); tap the rest of the row to edit — swipe still
            does both too, this is purely an additional entry point. */}
        <Pressable
          hitSlop={8}
          onPress={() => {
            if (!completedToday) onComplete(reminder.id);
          }}
          style={[
            styles.checkbox,
            completedToday && { borderColor: colors.done, backgroundColor: colors.done, shadowColor: colors.done, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
          ]}
        >
          {completedToday && <View style={styles.checkmark} />}
        </Pressable>

        <View style={styles.timeBlock}>
          <Text style={[styles.time, dim && styles.textDim]}>{formatTime(reminder.time)}</Text>
          <Text style={styles.day}>{formatRelativeDay(next)}</Text>
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, dim && styles.textDim, completedToday && styles.titleDone]} numberOfLines={1}>
            {reminder.title}
          </Text>
          <View style={styles.tagRow}>
            <View style={[styles.tag, dim && styles.tagDim]}>
              <Text style={[styles.tagText, dim && styles.textFaint]}>
                {repeatLabel(reminder.repeat)}
              </Text>
            </View>
            <View style={[styles.tag, dim && styles.tagDim, { marginLeft: 6 }]}>
              <Text style={[styles.tagText, dim && styles.textFaint]}>{categoryMeta.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.trailing}>
          <Text style={[styles.xpLabel, { color: completedToday ? colors.done : categoryMeta.dot }]}>
            {completedToday ? 'DONE' : `+${xp}`}
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
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    marginBottom: spacing(2.5),
    overflow: 'hidden',
  },
  cardDim: { opacity: 0.55 },
  cardPressed: { transform: [{ scale: 0.985 }], backgroundColor: colors.sheet },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  checkmark: {
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.void,
    transform: [{ rotate: '-45deg' }],
    marginTop: -2,
  },
  timeBlock: { minWidth: 64, marginRight: spacing(2) },
  time: { ...font.rowTitle, color: colors.textSecondary, fontSize: 14 },
  day: { ...font.caption, color: colors.signal, marginTop: 2, fontSize: 10 },
  body: { flex: 1, paddingRight: spacing(2) },
  title: { ...font.rowTitle, color: colors.textSecondary, fontSize: 15.5 },
  titleDone: { textDecorationLine: 'line-through', color: colors.textFainter },
  tagRow: { flexDirection: 'row', marginTop: spacing(1.5) },
  tag: {
    backgroundColor: colors.signalSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: 3,
  },
  tagDim: { backgroundColor: colors.sheet },
  tagText: { ...font.caption, color: colors.signal, fontSize: 10 },
  textDim: { color: colors.textDim },
  textFaint: { color: colors.textFaint },
  trailing: { alignItems: 'flex-end', gap: spacing(2) },
  xpLabel: { fontFamily: font.numeral.fontFamily, fontWeight: '800' as const, fontSize: 12 },
  switch: { transform: [{ scale: 0.82 }] },
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: spacing(2.5),
    borderRadius: radii.lg,
  },
  completeAction: { backgroundColor: colors.done },
  deleteAction: { backgroundColor: colors.danger },
  actionText: { color: '#07060F', fontWeight: '700', fontSize: 14 },
});
