import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInitialProgress, UserProgress } from './types';

// Deliberately a separate storage key from reminders — the progression
// layer can be wiped, migrated, or reset without ever touching the
// reminder engine's own data.
const KEY = 'progression/v1';

export async function loadProgress(): Promise<UserProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    // Merge onto a fresh default so new fields introduced later (e.g. a
    // future skill or counter) don't crash on an older saved snapshot.
    return { ...createInitialProgress(), ...parsed };
  } catch (e) {
    console.warn('Failed to load progression state', e);
    return createInitialProgress();
  }
}

export async function saveProgress(progress: UserProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('Failed to save progression state', e);
  }
}
