import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, motion } from '../theme';

export function ProgressBar({
  progress,
  color = colors.signal,
  height = 8,
  track = colors.divider,
  glowColor,
}: {
  progress: number; // 0..1
  color?: string;
  height?: number;
  track?: string;
  /** Adds a soft shadow matching the fill — used for the one or two bars
   * on screen that represent something that just changed. */
  glowColor?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withTiming(clamped, {
      duration: motion.medium.duration,
      easing: Easing.bezier(...motion.mediumEasing),
    });
  }, [clamped]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${anim.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track }]}>
      <Animated.View
        style={[
          styles.fill,
          { height, borderRadius: height / 2, backgroundColor: color },
          glowColor ? { shadowColor: glowColor, shadowOpacity: 0.7, shadowRadius: height * 2, shadowOffset: { width: 0, height: 0 } } : null,
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%' },
  fill: {},
});
