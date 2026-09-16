import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { colors, font, motion, radii, spacing } from '../theme';
import { LevelInfo } from '../progression/types';
import { levelTitle } from '../progression/levels';
import { CircularRing } from './CircularRing';

/** The one full-screen level-up moment in the app — real progression
 * state only (the level/title shown is whatever `newLevel` the engine
 * actually returned from recordCompletion), triggered from App.tsx's
 * single completion funnel. Signature-tier motion: ring sweep + a brief
 * burst, then it settles — never blocks the next action for long, and a
 * tap dismisses it early. */
export function LevelUpModal({ level, onClose }: { level: LevelInfo | null; onClose: () => void }) {
  const burst = useSharedValue(0);
  const numberScale = useSharedValue(0.6);

  useEffect(() => {
    if (!level) return;
    burst.value = 0;
    numberScale.value = 0.6;
    burst.value = withTiming(1, { duration: motion.burst.duration, easing: Easing.out(Easing.ease) });
    numberScale.value = withDelay(
      motion.signature.duration * 0.6,
      withSequence(
        withTiming(1.15, { duration: 220, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 160 })
      )
    );
  }, [level]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: 1 - burst.value,
    transform: [{ scale: 1 + burst.value * 1.4 }],
  }));
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: numberScale.value }] }));

  if (!level) return null;

  return (
    <Modal transparent animationType="fade" visible={!!level} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <Text style={styles.eyebrow}>LEVEL UP</Text>
        <View style={styles.ringWrap}>
          <Animated.View style={[styles.burstRing, burstStyle]} />
          <CircularRing progress={1} size={196} strokeWidth={10} color={colors.xp}>
            <Animated.View style={numberStyle}>
              <Text style={styles.number}>{level.level}</Text>
            </Animated.View>
            <Text style={styles.title}>{levelTitle(level.level)}</Text>
          </CircularRing>
        </View>
        <Text style={styles.sub}>{level.xpForThisLevel} XP to the next rank</Text>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Continue</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(5), padding: spacing(6) },
  eyebrow: { ...font.label, fontSize: 12, color: colors.signal, letterSpacing: 4 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  burstRing: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 1,
    borderColor: colors.xp,
  },
  number: { fontFamily: font.numeral.fontFamily, fontWeight: '800', fontSize: 60, color: colors.text, letterSpacing: -1, textAlign: 'center' },
  title: { ...font.rowTitle, color: colors.xp, textAlign: 'center', marginTop: 2 },
  sub: { ...font.caption, color: colors.textFaint },
  closeBtn: { backgroundColor: colors.xp, borderRadius: radii.pill, paddingVertical: spacing(4), paddingHorizontal: spacing(8), marginTop: spacing(3) },
  closeBtnText: { color: '#07060F', fontWeight: '700', fontSize: 15 },
});
