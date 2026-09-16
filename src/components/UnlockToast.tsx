import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';
import { CardUnlockInfo, RARITY_META } from '../progression/types';

export function UnlockToast({ unlock, onPress, onDismiss }: { unlock: CardUnlockInfo; onPress: () => void; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const rarity = RARITY_META[unlock.rarity];

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(onDismiss);
    }, 4200);
    return () => clearTimeout(timer);
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View
      style={[
        styles.wrap,
        { borderColor: rarity.color, shadowColor: rarity.color, opacity: anim, transform: [{ translateY }] },
      ]}
    >
      <Pressable style={styles.pressable} onPress={onPress}>
        <Text style={[styles.rarity, { color: rarity.color }]}>{rarity.label.toUpperCase()} DISCOVERED</Text>
        <Text style={styles.title}>{unlock.title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1.5,
    borderRadius: theme.radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressable: { paddingHorizontal: theme.spacing(5), paddingVertical: theme.spacing(4) },
  rarity: { ...theme.font.caption, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  title: { ...theme.font.heading, color: theme.colors.text },
});
