import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { colors, motion } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0..1 */
  progress: number;
  size: number;
  strokeWidth?: number;
  color?: string;
  track?: string;
  glow?: boolean;
  /** Fills the ring's interior with a faint lit disc. Without it a large
   * ring reads as a hole punched in the screen rather than a medallion. */
  innerFill?: boolean;
  children?: React.ReactNode;
}

/** The level ring / daily-progress ring from the approved design — a real
 * SVG stroke-dashoffset sweep (RN has no CSS conic-gradient), animated on
 * the UI thread so it never drops frames next to a completion animation. */
export function CircularRing({
  progress,
  size,
  strokeWidth = 8,
  color = colors.signal,
  track = 'rgba(255,255,255,0.07)',
  glow = true,
  innerFill = false,
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const animated = useSharedValue(0);

  useEffect(() => {
    animated.value = withTiming(clamped, {
      duration: motion.medium.duration,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
  }, [clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  return (
    // borderRadius is what makes the glow read as a halo rather than a
    // dark square: on react-native-web the shadow below compiles to a CSS
    // box-shadow, which follows the VIEW's box — without rounding it, a
    // circular ring sits inside a visibly square glow.
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        glow && glowShadow(color),
      ]}
    >
      <Svg width={size} height={size}>
        {innerFill && (
          <Circle cx={size / 2} cy={size / 2} r={radius} fill="rgba(124,92,255,0.07)" />
        )}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          // Start the sweep at 12 o'clock, matching the artifact's rings.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children && <View style={styles.center}>{children}</View>}
    </View>
  );
}

function glowShadow(color: string) {
  return {
    shadowColor: color,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  };
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
