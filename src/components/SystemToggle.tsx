import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, motion } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// Active / dormant, in the world's own language.
//
// This replaces React Native's built-in <Switch> in the quest log. The
// platform Switch renders its own iOS/Android/web chrome — on web that came
// out as a bright teal-and-violet control that was, by a wide margin, the
// loudest thing in every row: it pulled the eye away from the quest itself
// and looked imported from a different product.
//
// This one is the same affordance at a quieter volume: a dim track that
// lights to `signal` when the quest is active, and a knob that slides. It
// is still a real button with the same on/off semantics — nothing about
// enable/disable behaviour changed, only its appearance.
// ─────────────────────────────────────────────────────────────────────────

const W = 34;
const H = 18;
const KNOB = 12;

export function SystemToggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(value ? 1 : 0, {
      duration: 180,
      easing: Easing.bezier(...(motion.mediumEasing as unknown as [number, number, number, number])),
    });
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      t.value,
      [0, 1],
      ['rgba(255,255,255,0.07)', 'rgba(124,92,255,0.30)']
    ),
    borderColor: interpolateColor(
      t.value,
      [0, 1],
      ['rgba(255,255,255,0.12)', 'rgba(124,92,255,0.65)']
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * (W - KNOB - 6) }],
    backgroundColor: interpolateColor(t.value, [0, 1], [colors.textFainter, colors.signal]),
    shadowOpacity: t.value * 0.8,
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={10}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: W,
    height: H,
    borderRadius: H / 2,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    shadowColor: colors.signal,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
});
