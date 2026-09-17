import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, radii } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// The holographic surface every piece of Arc Island UI sits on.
//
// The point of this component is that the world (see world/WorldBackground)
// must stay VISIBLE THROUGH the interface. A normal opaque card would turn
// the atmosphere back into a flat black rectangle the moment you stack a
// few of them — which is exactly the "dump black space" problem this
// redesign exists to fix. So a panel here is:
//
//   - translucent, not opaque (colors.holo is ~62% alpha)
//   - cornered with BRACKETS rather than a continuous border, so the panel
//     reads as a projection registered onto the world rather than a solid
//     object occluding it
//   - optionally lit along one edge, which is how a panel signals that it
//     is the active/primary surface on screen
//
// `scan` runs a single slow luminance sweep down the panel. It is reserved
// for panels the System is currently acting on (thinking, forging) — it is
// a state, not decoration, and defaults off.
// ─────────────────────────────────────────────────────────────────────────

export type PanelTone = 'default' | 'signal' | 'done' | 'due' | 'danger' | 'cyan';

const TONE: Record<PanelTone, string> = {
  default: colors.holoBorder,
  signal: colors.signal,
  done: colors.done,
  due: colors.due,
  danger: colors.danger,
  cyan: colors.arcCyan,
};

export interface SystemPanelProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Accent hue for the brackets and edge light. */
  tone?: PanelTone;
  /** Raises contrast + brightens the brackets. Use for the one primary
   * surface on a screen, never for every panel at once. */
  lit?: boolean;
  /** A single slow top-to-bottom luminance sweep, looping. Reserved for
   * "the System is working on this" states. */
  scan?: boolean;
  /** Corner bracket arm length in px. Smaller panels need shorter arms. */
  bracket?: number;
  radius?: number;
  /** Drop the translucent fill entirely — brackets and content only. Used
   * where a panel would otherwise stack on another panel and double up the
   * tint into an opaque block. */
  ghost?: boolean;
}

export function SystemPanel({
  children,
  style,
  tone = 'default',
  lit = false,
  scan = false,
  bracket = 14,
  radius = radii.lg,
  ghost = false,
}: SystemPanelProps) {
  const accent = TONE[tone];
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (!scan) {
      cancelAnimation(sweep);
      sweep.value = 0;
      return;
    }
    sweep.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    return () => cancelAnimation(sweep);
  }, [scan]);

  // `top` is animated as a percentage string rather than a translateY, so
  // the sweep tracks the panel's real height without this component having
  // to measure it — a percentage translate is not reliably supported across
  // RN/RN-web, a percentage `top` is.
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: sweep.value < 0.08 || sweep.value > 0.92 ? 0 : 0.5,
    top: `${sweep.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.panel,
        {
          borderRadius: radius,
          backgroundColor: ghost ? 'transparent' : lit ? colors.holoRaise : colors.holo,
          borderColor: lit ? colors.holoBorderLit : colors.holoBorder,
        },
        lit && {
          shadowColor: accent,
          shadowOpacity: 0.3,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        },
        style as ViewStyle,
      ]}
    >
      {/* Corner brackets. Four separate absolutely-positioned SVGs rather
          than one full-size overlay so the panel can size itself to its
          content without the bracket layer forcing a layout pass. */}
      <Bracket corner="tl" size={bracket} color={accent} lit={lit} radius={radius} />
      <Bracket corner="tr" size={bracket} color={accent} lit={lit} radius={radius} />
      <Bracket corner="bl" size={bracket} color={accent} lit={lit} radius={radius} />
      <Bracket corner="br" size={bracket} color={accent} lit={lit} radius={radius} />

      {scan && (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
          <Animated.View style={[styles.scanLine, sweepStyle]}>
            <Svg width="100%" height="100%">
              <Defs>
                <SvgLinearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={accent} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={accent} stopOpacity="0.5" />
                  <Stop offset="1" stopColor={accent} stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#scanGrad)" />
            </Svg>
          </Animated.View>
        </View>
      )}

      {children}
    </View>
  );
}

function Bracket({
  corner,
  size,
  color,
  lit,
  radius,
}: {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  size: number;
  color: string;
  lit: boolean;
  radius: number;
}) {
  // Each bracket is an L drawn into its own square, then the whole square
  // is rotated into place. Drawing one path and rotating is what guarantees
  // all four corners are geometrically identical.
  const rotate =
    corner === 'tl' ? '0deg' : corner === 'tr' ? '90deg' : corner === 'br' ? '180deg' : '270deg';
  const pos: ViewStyle =
    corner === 'tl'
      ? { top: -1, left: -1 }
      : corner === 'tr'
      ? { top: -1, right: -1 }
      : corner === 'br'
      ? { bottom: -1, right: -1 }
      : { bottom: -1, left: -1 };

  const r = Math.min(radius, size);

  return (
    <View
      pointerEvents="none"
      style={[styles.bracket, pos, { width: size, height: size, transform: [{ rotate }] }]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={`M 1 ${size} L 1 ${r} A ${r - 1} ${r - 1} 0 0 1 ${r} 1 L ${size} 1`}
          stroke={color}
          strokeWidth={lit ? 1.8 : 1.3}
          strokeOpacity={lit ? 0.95 : 0.55}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    overflow: 'visible',
  },
  bracket: { position: 'absolute' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 56, marginTop: -28 },
});
