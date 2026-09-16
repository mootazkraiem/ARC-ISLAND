import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';

/** Waveform bars shown while Nudge is listening — purely decorative
 * motion (the real transcript comes back only once recording stops), but
 * it communicates "I'm hearing you" the way the approved design intends. */
export function ListeningWave({ bars = 20 }: { bars?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} index={i} />
      ))}
    </View>
  );
}

function Bar({ index }: { index: number }) {
  const h = useSharedValue(0.3);
  useEffect(() => {
    h.value = withDelay(
      index * 40,
      withRepeat(
        withSequence(
          withTiming(0.3 + Math.abs(Math.sin(index * 0.8)) * 0.7, { duration: 450, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.25, { duration: 450, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);
  const style = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.bar, style]} />
    </View>
  );
}

/** Three-dot "thinking" indicator for Nudge's processing state. */
export function ThinkingDots() {
  return (
    <View style={styles.dotsRow}>
      <Dot delay={0} />
      <Dot delay={180} />
      <Dot delay={360} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 420, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.7 + v.value * 0.3 }] }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 40 },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 99, backgroundColor: colors.signal, minHeight: 4 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal },
});
