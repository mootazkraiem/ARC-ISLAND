import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing } from '../theme';
import { SystemGlyph } from './SystemGlyph';

/** The unclaimed state. An empty quest diamond — a slot in the world with
 * nothing in it yet — rather than a shrug emoji. */
export function EmptyState({ onClaim }: { onClaim?: () => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <SystemGlyph name="quest" size={30} color={colors.signal} strokeWidth={1.2} opacity={0.75} />
      </View>
      <Text style={styles.title}>No quests registered</Text>
      <Text style={styles.subtitle}>
        The System is listening. Claim your first quest{'\n'}and it will summon you at its hour.
      </Text>
      {onClaim && (
        <Pressable onPress={onClaim} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
          <SystemGlyph name="claim" size={14} color={colors.signal} />
          <Text style={styles.btnText}>CLAIM A QUEST</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(8),
    paddingVertical: spacing(10),
    gap: spacing(2),
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: radii.lg,
    backgroundColor: colors.holo,
    borderWidth: 1,
    borderColor: colors.holoBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(2),
  },
  title: { ...font.heading, fontSize: 17, color: colors.text },
  subtitle: {
    ...font.body,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    marginTop: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.4)',
    backgroundColor: colors.signalSoft,
  },
  btnPressed: { opacity: 0.75 },
  btnText: { ...font.label, fontSize: 10, color: colors.signal, letterSpacing: 1.6 },
});
