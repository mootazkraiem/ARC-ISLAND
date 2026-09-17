import React, { useEffect, useMemo } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../../theme';

// ─────────────────────────────────────────────────────────────────────────
// ARC ISLAND — the world itself.
//
// This is deliberately NOT one big image. It is six stacked layers, each
// cheap on its own, that together read as depth:
//
//   1. sky        — vertical gradient, zenith to horizon (deep blue/violet)
//   2. bloom      — soft radial glows, volumetric light behind and below
//   3. starfield  — static deterministic points, parallax-slow drift
//   4. farIslands — distant floating formations, low contrast
//   5. arcs       — the energy formations: thin luminous curves + a ring
//   6. nearIsland — foreground silhouette mass anchoring the bottom
//
// Every layer is pointerEvents="none" and sits behind content. The whole
// stack is capped at low peak luminance so body text stays readable on top
// of it without an extra scrim — the brightest thing in the world layer is
// still dimmer than colors.textFaint.
//
// Motion is intentionally near-imperceptible: 9s-40s loops at small
// translate/opacity deltas. It should feel alive, not animated. Pass
// animated={false} (used by dense screens like the calendar grid) to get
// the exact same picture with zero running timers.
// ─────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG so the starfield is identical on every render and
 * every reload — a world that reshuffles its stars each mount reads as
 * noise, not as a place. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
}

function buildStars(count: number, w: number, h: number): Star[] {
  const rand = mulberry32(0x41524331); // "ARC1"
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    // Bias stars toward the upper sky — they thin out near the horizon
    // where atmospheric haze would wash them out.
    const y = Math.pow(rand(), 1.6) * h * 0.78;
    out.push({ x, y, r: 0.5 + rand() * 1.15, o: 0.18 + rand() * 0.62 });
  }
  return out;
}

export interface WorldBackgroundProps {
  /** Disable the drift/pulse timers while keeping the identical picture. */
  animated?: boolean;
  /** 0-1 multiplier on the whole world layer. Screens with dense text
   * (calendar grid, editor forms) dial this down rather than covering the
   * world with an opaque scrim. */
  intensity?: number;
}

export function WorldBackground({ animated = true, intensity = 1 }: WorldBackgroundProps) {
  const { width, height } = Dimensions.get('window');
  const w = Math.max(width, 360);
  const h = Math.max(height, 640);

  const stars = useMemo(() => buildStars(Platform.OS === 'web' ? 110 : 80, w, h), [w, h]);

  // Slow vertical drift for the star layer, and an independent slower
  // horizontal drift for the far islands — two different rates is what
  // actually sells parallax depth.
  const starDrift = useSharedValue(0);
  const islandDrift = useSharedValue(0);
  const bloomPulse = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    const loop = (sv: { value: number }, duration: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    };
    loop(starDrift, 26000);
    loop(islandDrift, 40000);
    loop(bloomPulse, 9000);
    return () => {
      cancelAnimation(starDrift);
      cancelAnimation(islandDrift);
      cancelAnimation(bloomPulse);
    };
  }, [animated]);

  const starStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: starDrift.value * -14 }, { translateX: starDrift.value * 6 }],
  }));
  const islandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: islandDrift.value * 12 }],
  }));
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + bloomPulse.value * 0.28,
  }));

  const horizonY = h * 0.66;

  return (
    <View style={[StyleSheet.absoluteFill, { opacity: intensity }]} pointerEvents="none">
      {/* 1 + 2 — sky gradient and volumetric bloom, one SVG so the
          gradients composite without an extra native view each. */}
      <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.worldDeep} />
              <Stop offset="0.38" stopColor={colors.worldMid} />
              <Stop offset="0.72" stopColor={colors.worldHorizon} />
              <Stop offset="1" stopColor={colors.worldDeep} />
            </SvgLinearGradient>
            <RadialGradient id="horizonBloom" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.worldGlow} stopOpacity="0.85" />
              <Stop offset="0.55" stopColor={colors.worldGlow} stopOpacity="0.28" />
              <Stop offset="1" stopColor={colors.worldGlow} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="emberBloom" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.worldEmber} stopOpacity="0.55" />
              <Stop offset="1" stopColor={colors.worldEmber} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="signalBloom" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.signal} stopOpacity="0.22" />
              <Stop offset="1" stopColor={colors.signal} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Rect x="0" y="0" width={w} height={h} fill="url(#sky)" />
          {/* Wide, flat bloom sitting ON the horizon line — this is what
              makes the islands read as lit from behind rather than as flat
              cut-outs. */}
          <Ellipse cx={w * 0.5} cy={horizonY} rx={w * 0.85} ry={h * 0.2} fill="url(#horizonBloom)" />
          <Ellipse cx={w * 0.2} cy={h * 0.82} rx={w * 0.6} ry={h * 0.22} fill="url(#emberBloom)" />
          <Ellipse cx={w * 0.82} cy={h * 0.22} rx={w * 0.5} ry={h * 0.26} fill="url(#signalBloom)" />
        </Svg>
      </Animated.View>

      {/* 3 — starfield */}
      <Animated.View style={[StyleSheet.absoluteFill, starStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
          <G>
            {stars.map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={colors.star} opacity={s.o * 0.7} />
            ))}
          </G>
        </Svg>
      </Animated.View>

      {/* 4 + 5 + 6 — formations. Islands are drawn as closed paths with a
          flat top and an irregular tapering underside: floating landmass,
          not a mountain range. The arcs are the energy of the world — thin,
          luminous, and only ever partial curves so they read as fragments
          of a much larger structure. */}
      <Animated.View style={[StyleSheet.absoluteFill, islandStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <SvgLinearGradient id="farRock" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.islandFar} stopOpacity="0.95" />
              <Stop offset="1" stopColor={colors.worldDeep} stopOpacity="0.4" />
            </SvgLinearGradient>
            <SvgLinearGradient id="nearRock" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.islandNear} stopOpacity="1" />
              <Stop offset="1" stopColor={colors.worldDeep} stopOpacity="0.85" />
            </SvgLinearGradient>
          </Defs>

          {/* distant formation, left */}
          <G opacity={0.55}>
            <Path
              d={`M ${w * 0.02} ${horizonY - 26} L ${w * 0.3} ${horizonY - 34} L ${w * 0.26} ${
                horizonY + 4
              } L ${w * 0.19} ${horizonY + 30} L ${w * 0.13} ${horizonY + 12} L ${w * 0.07} ${
                horizonY + 22
              } Z`}
              fill="url(#farRock)"
            />
            {/* rim light along the lit top edge */}
            <Path
              d={`M ${w * 0.02} ${horizonY - 26} L ${w * 0.3} ${horizonY - 34}`}
              stroke={colors.arcCyan}
              strokeOpacity="0.2"
              strokeWidth="1"
            />
          </G>

          {/* distant formation, right — smaller and higher, so the two
              don't read as a symmetrical pair */}
          <G opacity={0.42}>
            <Path
              d={`M ${w * 0.66} ${horizonY - 58} L ${w * 0.93} ${horizonY - 64} L ${w * 0.88} ${
                horizonY - 34
              } L ${w * 0.8} ${horizonY - 16} L ${w * 0.72} ${horizonY - 36} Z`}
              fill="url(#farRock)"
            />
            <Path
              d={`M ${w * 0.66} ${horizonY - 58} L ${w * 0.93} ${horizonY - 64}`}
              stroke={colors.arcCyan}
              strokeOpacity="0.18"
              strokeWidth="1"
            />
          </G>

          {/* the arc formations — the world's namesake */}
          <G opacity={0.3}>
            <Path
              d={`M ${-w * 0.1} ${horizonY - 120} Q ${w * 0.5} ${horizonY - 250} ${w * 1.1} ${
                horizonY - 90
              }`}
              stroke={colors.signal}
              strokeOpacity="0.55"
              strokeWidth="1.2"
              fill="none"
            />
            <Path
              d={`M ${-w * 0.05} ${horizonY - 70} Q ${w * 0.55} ${horizonY - 180} ${w * 1.05} ${
                horizonY - 50
              }`}
              stroke={colors.arcCyan}
              strokeOpacity="0.32"
              strokeWidth="0.9"
              fill="none"
            />
            {/* a single suspended ring, off-centre — the one element that
                says "structure", not "landscape" */}
            <Circle
              cx={w * 0.76}
              cy={horizonY - 150}
              r={Math.min(w, h) * 0.11}
              stroke={colors.arcCyan}
              strokeOpacity="0.28"
              strokeWidth="1"
              fill="none"
            />
            <Circle
              cx={w * 0.76}
              cy={horizonY - 150}
              r={Math.min(w, h) * 0.075}
              stroke={colors.signal}
              strokeOpacity="0.22"
              strokeWidth="0.8"
              fill="none"
            />
          </G>

          {/* near silhouette — heaviest mass, bottom of frame, gives the
              whole composition a floor */}
          <Path
            d={`M 0 ${h * 0.88} L ${w * 0.16} ${h * 0.855} L ${w * 0.34} ${h * 0.875} L ${w * 0.55} ${
              h * 0.845
            } L ${w * 0.78} ${h * 0.872} L ${w} ${h * 0.85} L ${w} ${h} L 0 ${h} Z`}
            fill="url(#nearRock)"
          />
          <Path
            d={`M 0 ${h * 0.88} L ${w * 0.16} ${h * 0.855} L ${w * 0.34} ${h * 0.875} L ${w * 0.55} ${
              h * 0.845
            } L ${w * 0.78} ${h * 0.872} L ${w} ${h * 0.85}`}
            stroke={colors.signal}
            strokeOpacity="0.22"
            strokeWidth="1"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
