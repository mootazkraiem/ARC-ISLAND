import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, motion } from '../theme';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// One orb, four behaviours — matches the approved design's Nudge states.
// Real states only: this always reflects AssistantScreen's actual
// recording/transcribing/speaking flow, never a fake animation standing
// in for state that hasn't happened yet.
const STATE_COLOR: Record<OrbState, string> = {
  idle: colors.signal,
  listening: colors.due,
  thinking: colors.signal,
  speaking: colors.done,
};

export function PulseOrb({ state, size = 96 }: { state: OrbState; size?: number }) {
  const breathe = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  useEffect(() => {
    // Idle breathing loop — always running, per the motion spec
    // ("Nudge orb idle: loop breathe 3.2s, ±8% scale").
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.breathe.duration / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: motion.breathe.duration / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(breathe);
  }, []);

  useEffect(() => {
    if (state === 'listening') {
      ring1.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
      ring2.value = withDelay(700, withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false));
    } else {
      cancelAnimation(ring1);
      cancelAnimation(ring2);
      ring1.value = 0;
      ring2.value = 0;
    }
  }, [state]);

  const color = STATE_COLOR[state];

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.value * 0.08 }],
  }));
  const ring1Style = useAnimatedStyle(() => ({
    opacity: 1 - ring1.value,
    transform: [{ scale: 1 + ring1.value * 0.6 }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 1 - ring2.value,
    transform: [{ scale: 1 + ring2.value * 0.6 }],
  }));

  return (
    <View style={[styles.wrap, { width: size * 1.9, height: size * 1.9 }]}>
      {state === 'listening' && (
        <>
          <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, ring1Style]} />
          <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, ring2Style]} />
        </>
      )}
      <Animated.View
        style={[
          styles.orb,
          { width: size, height: size, borderRadius: size / 2, shadowColor: color, shadowRadius: state === 'idle' ? 26 : 46 },
          orbStyle,
        ]}
      >
        <LinearGradient
          colors={['#D9CFFF', color, '#3D1FA8']}
          start={{ x: 0.34, y: 0.28 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
        <View style={styles.orbInner} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.85,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  orbInner: {
    position: 'absolute',
    width: '34%',
    height: '34%',
    top: '18%',
    left: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
