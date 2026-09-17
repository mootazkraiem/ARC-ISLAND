import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// THE SYSTEM — rendered as a presence, not a chat avatar.
//
// Four states, each with a distinct and honest behaviour. Nothing here
// animates speculatively: the orb only shows a state the System is
// genuinely in, driven by SystemScreen's real recognition/inference/speech
// lifecycle.
//
//   IDLE      slow breathing core, one lazily rotating orbit ring.
//             The System is present and waiting. Violet.
//   LISTENING core contracts and sharpens, orbit ring speeds up, and
//             concentric intake rings collapse INWARD — the System is
//             drawing something in. Cyan.
//   THINKING  core dims, two counter-rotating arcs sweep around it, and
//             the whole orb loses its glow — processing, not performing.
//             Violet, desaturated.
//   SPEAKING  core pulses on a faster cycle and emission rings expand
//             OUTWARD — the inverse of listening, so the two states are
//             instantly distinguishable at a glance. Green.
//
// The inward/outward ring direction is the key affordance: a user should
// never have to read a label to know whether the System is taking in or
// giving out.
// ─────────────────────────────────────────────────────────────────────────

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_COLOR: Record<OrbState, string> = {
  idle: colors.signal,
  listening: colors.arcCyan,
  thinking: '#8B7BD8',
  speaking: colors.done,
};


export function SystemOrb({ state, size = 96 }: { state: OrbState; size?: number }) {
  const color = STATE_COLOR[state];
  const box = size * 2.1;

  // Core breathing. Rate is state-dependent: a System that breathes at the
  // same rate while idle and while speaking does not read as alive.
  const breathe = useSharedValue(0);
  // Orbit ring rotation.
  const orbit = useSharedValue(0);
  // Three ring emitters, phase-offset. Direction is flipped by state.
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);
  const r3 = useSharedValue(0);
  // Thinking arcs.
  const think = useSharedValue(0);

  useEffect(() => {
    const period = state === 'speaking' ? 900 : state === 'listening' ? 1600 : 3200;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(breathe);
  }, [state]);

  useEffect(() => {
    const dur = state === 'listening' ? 5200 : state === 'thinking' ? 2600 : 14000;
    orbit.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(orbit);
  }, [state]);

  useEffect(() => {
    const active = state === 'listening' || state === 'speaking';
    if (!active) {
      [r1, r2, r3].forEach((r) => {
        cancelAnimation(r);
        r.value = 0;
      });
      return;
    }
    const dur = state === 'speaking' ? 1700 : 2100;
    const start = (sv: { value: number }, delay: number) => {
      sv.value = withDelay(
        delay,
        withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false)
      );
    };
    start(r1, 0);
    start(r2, dur / 3);
    start(r3, (dur * 2) / 3);
    return () => {
      cancelAnimation(r1);
      cancelAnimation(r2);
      cancelAnimation(r3);
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'thinking') {
      cancelAnimation(think);
      think.value = 0;
      return;
    }
    think.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(think);
  }, [state]);

  const inward = state === 'listening';

  const coreStyle = useAnimatedStyle(() => {
    const amp = state === 'speaking' ? 0.14 : state === 'listening' ? 0.05 : 0.08;
    const base = state === 'listening' ? 0.88 : 1;
    return {
      transform: [{ scale: base + breathe.value * amp }],
      // Thinking deliberately dims — the System withdraws while it works.
      opacity: state === 'thinking' ? 0.55 + breathe.value * 0.12 : 1,
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: state === 'thinking' ? 0.25 : 0.5 + breathe.value * 0.4,
    transform: [{ scale: 1 + breathe.value * 0.1 }],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }],
  }));

  const thinkStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${think.value * 360}deg` }],
    opacity: state === 'thinking' ? 1 : 0,
  }));
  const thinkStyle2 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-think.value * 360}deg` }],
    opacity: state === 'thinking' ? 1 : 0,
  }));

  // Ring emitters. `inward` reverses the travel so listening collapses and
  // speaking expands, from the same shared value.
  const ringStyle = (sv: { value: number }) =>
    useAnimatedStyle(() => {
      const t = sv.value;
      const scale = inward ? 1.75 - t * 0.85 : 0.9 + t * 0.85;
      return {
        opacity: t === 0 ? 0 : (inward ? t : 1 - t) * 0.65,
        transform: [{ scale }],
      };
    });

  const ring1Style = ringStyle(r1);
  const ring2Style = ringStyle(r2);
  const ring3Style = ringStyle(r3);

  // Orbiting particles — three points at fixed angles on the orbit ring,
  // carried around by the ring's own rotation.
  const particles = useMemo(() => [0, 137, 246], []);

  return (
    <View style={[styles.wrap, { width: box, height: box }]}>
      {/* volumetric glow behind everything */}
      <Animated.View style={[styles.abs, glowStyle]}>
        <Svg width={box} height={box}>
          <Defs>
            <RadialGradient id="orbGlow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={color} stopOpacity="0.5" />
              <Stop offset="0.45" stopColor={color} stopOpacity="0.16" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#orbGlow)" />
        </Svg>
      </Animated.View>

      {/* emitted / absorbed rings */}
      {(state === 'listening' || state === 'speaking') && (
        <>
          <Animated.View style={[styles.abs, ring1Style]}>
            <RingSvg box={box} size={size} color={color} />
          </Animated.View>
          <Animated.View style={[styles.abs, ring2Style]}>
            <RingSvg box={box} size={size} color={color} />
          </Animated.View>
          <Animated.View style={[styles.abs, ring3Style]}>
            <RingSvg box={box} size={size} color={color} />
          </Animated.View>
        </>
      )}

      {/* thinking arcs — counter-rotating, only visible while thinking */}
      <Animated.View style={[styles.abs, thinkStyle]} pointerEvents="none">
        <Svg width={box} height={box}>
          <Path
            d={describeArc(box / 2, box / 2, size * 0.66, -70, 70)}
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.abs, thinkStyle2]} pointerEvents="none">
        <Svg width={box} height={box}>
          <Path
            d={describeArc(box / 2, box / 2, size * 0.52, 110, 250)}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.5}
          />
        </Svg>
      </Animated.View>

      {/* orbit ring + carried particles */}
      <Animated.View style={[styles.abs, orbitStyle]} pointerEvents="none">
        <Svg width={box} height={box}>
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={size * 0.78}
            stroke={color}
            strokeOpacity={state === 'thinking' ? 0.12 : 0.22}
            strokeWidth={1}
            fill="none"
            strokeDasharray="3 7"
          />
          {particles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <Circle
                key={i}
                cx={box / 2 + Math.cos(rad) * size * 0.78}
                cy={box / 2 + Math.sin(rad) * size * 0.78}
                r={i === 0 ? 2.4 : 1.6}
                fill={color}
                opacity={state === 'thinking' ? 0.35 : 0.7}
              />
            );
          })}
        </Svg>
      </Animated.View>

      {/* the core */}
      <Animated.View style={[styles.abs, coreStyle]} pointerEvents="none">
        <Svg width={box} height={box}>
          <Defs>
            <RadialGradient id="orbCore" cx="0.38" cy="0.32" r="0.72">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
              <Stop offset="0.3" stopColor={color} stopOpacity="0.95" />
              <Stop offset="1" stopColor="#1A1040" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={size * 0.44} fill="url(#orbCore)" />
          {/* the seal ring — the one closed form, matching the 'system' glyph */}
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={size * 0.44}
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={1}
            fill="none"
          />
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={size * 0.2}
            stroke="#FFFFFF"
            strokeOpacity={0.3}
            strokeWidth={0.8}
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function RingSvg({ box, size, color }: { box: number; size: number; color: string }) {
  return (
    <Svg width={box} height={box}>
      <Circle
        cx={box / 2}
        cy={box / 2}
        r={size * 0.5}
        stroke={color}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  );
}

/** Minimal polar-to-cartesian arc path — used for the thinking sweeps. */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const pol = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = pol(endDeg);
  const end = pol(startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
