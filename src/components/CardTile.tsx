import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radii, spacing } from '../theme';
import { CardDefinition, RARITY_META, SKILL_META } from '../progression/types';

interface Props {
  card: CardDefinition;
  unlocked: boolean;
  unlockedAt?: string;
  onPress: () => void;
}

const GLOW_RARITIES = new Set(['rare', 'epic', 'legendary']);

export function CardTile({ card, unlocked, unlockedAt, onPress }: Props) {
  const rarity = RARITY_META[card.rarity];
  const glowy = unlocked && GLOW_RARITIES.has(card.rarity);

  if (!unlocked) {
    return (
      <Pressable
        style={({ pressed }) => [styles.tile, styles.tileLocked, pressed && styles.tilePressed]}
        onPress={onPress}
      >
        <View style={styles.rowTop}>
          <Text style={styles.lockedRarity}>???</Text>
        </View>
        <View style={styles.markWrap}>
          <View style={styles.lockedMark} />
        </View>
        <Text style={styles.lockedLabel}>UNDISCOVERED</Text>
        <Text style={styles.lockedHint} numberOfLines={3}>
          {card.lockedHint}
        </Text>
      </Pressable>
    );
  }

  const skillMeta = card.skill ? SKILL_META[card.skill] : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        styles.tileUnlocked,
        { borderColor: glowy ? rarity.color : colors.cardBorder },
        glowy && { shadowColor: rarity.color, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.rarityLabel, { color: rarity.color }]}>{rarity.label.toUpperCase()}</Text>
      </View>
      <View style={styles.markWrap}>
        <View style={[styles.mark, glowy && { shadowColor: rarity.color, shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }]}>
          <LinearGradient
            colors={glowy ? ['#D9CFFF', rarity.color, '#3D1FA8'] : ['#3A3A4C', '#1F1F2B']}
            start={{ x: 0.34, y: 0.28 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {skillMeta && <Text style={styles.glyph}>{skillMeta.glyph}</Text>}
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {card.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 0.71,
    borderRadius: radii.md,
    padding: spacing(2.75),
    margin: spacing(1.5),
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  tilePressed: { transform: [{ scale: 0.96 }] },
  tileLocked: {
    backgroundColor: colors.sheet,
    borderColor: colors.cardBorder,
  },
  tileUnlocked: {
    backgroundColor: colors.card,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  markWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  lockedMark: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.05)' },
  glyph: { fontSize: 15, color: '#FFFFFF' },
  lockedRarity: { ...font.label, fontSize: 8, color: colors.textFainter, letterSpacing: 1.5 },
  lockedLabel: { ...font.label, fontSize: 9, color: colors.textFainter, letterSpacing: 1, marginBottom: 2 },
  lockedHint: { ...font.caption, color: colors.textFainter, lineHeight: 14, fontSize: 10 },
  title: { fontFamily: font.rowTitle.fontFamily, color: colors.textSecondary, fontSize: 11, fontWeight: '600', lineHeight: 14 },
  rarityLabel: { ...font.label, fontSize: 8, letterSpacing: 1.5 },
});
