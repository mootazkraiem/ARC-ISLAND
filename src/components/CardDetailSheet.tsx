import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../theme';
import { CardDefinition, RARITY_META, SKILL_META } from '../progression/types';

interface Props {
  card: CardDefinition | null;
  unlocked: boolean;
  unlockedAt?: string;
  onClose: () => void;
}

export function CardDetailSheet({ card, unlocked, unlockedAt, onClose }: Props) {
  if (!card) return null;
  const rarity = RARITY_META[card.rarity];
  const skillMeta = card.skill ? SKILL_META[card.skill] : null;

  return (
    <Modal transparent animationType="fade" visible={!!card} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.badge, { borderColor: rarity.color }]}>
            <Text style={{ fontSize: 34, color: unlocked ? rarity.color : theme.colors.textFaint }}>
              {unlocked ? skillMeta?.glyph ?? '★' : '?'}
            </Text>
          </View>

          <Text style={[styles.rarity, { color: rarity.color }]}>{rarity.label.toUpperCase()}</Text>
          <Text style={styles.title}>{unlocked ? card.title : 'Undiscovered'}</Text>
          <Text style={styles.description}>{unlocked ? card.description : card.lockedHint}</Text>

          {unlocked && skillMeta && (
            <View style={styles.skillPill}>
              <Text style={styles.skillPillText}>{skillMeta.label}</Text>
            </View>
          )}

          {unlocked && unlockedAt && (
            <Text style={styles.date}>
              Discovered {new Date(unlockedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: theme.spacing(6),
    alignItems: 'center',
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing(4),
    backgroundColor: theme.colors.bgElevated,
  },
  rarity: { ...theme.font.caption, letterSpacing: 1.5, fontWeight: '700', marginBottom: theme.spacing(1.5) },
  title: { ...theme.font.title, fontSize: 22, color: theme.colors.text, textAlign: 'center', marginBottom: theme.spacing(3) },
  description: { ...theme.font.body, color: theme.colors.textDim, textAlign: 'center', lineHeight: 21, marginBottom: theme.spacing(4) },
  skillPill: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.5),
    marginBottom: theme.spacing(3),
  },
  skillPillText: { ...theme.font.caption, color: theme.colors.accent, fontWeight: '700' },
  date: { ...theme.font.caption, color: theme.colors.textFaint, marginBottom: theme.spacing(4) },
  closeBtn: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(6) },
  closeBtnText: { color: theme.colors.accent, fontWeight: '700', fontSize: 15 },
});
