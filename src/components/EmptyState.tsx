import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function EmptyState() {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>⏰</Text>
      </View>
      <Text style={styles.title}>Nothing scheduled</Text>
      <Text style={styles.subtitle}>
        Tap “+ Add Reminder” to get your first{'\n'}notification on the books.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing(10),
    paddingBottom: theme.spacing(20),
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing(5),
  },
  icon: { fontSize: 30 },
  title: {
    ...theme.font.heading,
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  subtitle: {
    ...theme.font.body,
    color: theme.colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
  },
});
