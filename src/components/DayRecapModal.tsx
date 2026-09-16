import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../theme';
import { DailyLogEntry, SKILL_META } from '../progression/types';
import { useProgress } from '../progression/useProgress';

export function DayRecapModal({ entry, onClose }: { entry: DailyLogEntry | null; onClose: () => void }) {
  const progress = useProgress();
  if (!entry) return null;

  const skillLines = Object.entries(entry.skillXp).filter(([, v]) => (v ?? 0) > 0);

  return (
    <Modal transparent animationType="fade" visible={!!entry} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>YESTERDAY</Text>
          <Text style={styles.title}>Day Complete</Text>
          <Text style={styles.xp}>+{entry.xpEarned} XP</Text>

          {skillLines.length > 0 && (
            <View style={styles.skillList}>
              {skillLines.map(([skill, xp]) => (
                <View key={skill} style={styles.skillRow}>
                  <Text style={styles.skillLabel}>{SKILL_META[skill as keyof typeof SKILL_META].label}</Text>
                  <Text style={styles.skillXp}>+{xp}</Text>
                </View>
              ))}
            </View>
          )}

          {entry.unlockedCardIds.length > 0 && (
            <View style={styles.discoveryBox}>
              <Text style={styles.discoveryLabel}>NEW DISCOVERY</Text>
              <Text style={styles.discoveryTitle}>{entry.unlockedCardIds.length} card(s) unlocked</Text>
            </View>
          )}

          <View style={styles.streakRow}>
            <Text style={styles.streakLabel}>STREAK</Text>
            <Text style={styles.streakValue}>{progress.currentStreak} days</Text>
          </View>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(6),
  },
  eyebrow: { ...theme.font.label, color: theme.colors.textFaint, letterSpacing: 2, marginBottom: theme.spacing(1) },
  title: { ...theme.font.title, color: theme.colors.text, marginBottom: theme.spacing(2) },
  xp: { fontSize: 34, fontWeight: '800', color: theme.colors.accent, marginBottom: theme.spacing(4) },
  skillList: { marginBottom: theme.spacing(4) },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing(1) },
  skillLabel: { ...theme.font.body, color: theme.colors.textDim, fontSize: 14 },
  skillXp: { ...theme.font.body, color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  discoveryBox: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(4),
  },
  discoveryLabel: { ...theme.font.caption, color: theme.colors.accent, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  discoveryTitle: { ...theme.font.body, color: theme.colors.text, fontWeight: '600' },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing(5) },
  streakLabel: { ...theme.font.caption, color: theme.colors.textFaint, letterSpacing: 1 },
  streakValue: { ...theme.font.body, color: theme.colors.text, fontWeight: '700' },
  closeBtn: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(4), alignItems: 'center' },
  closeBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
