import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder } from './types';

const KEY = 'reminders/v1';

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Reminder[];
  } catch (e) {
    console.warn('Failed to load reminders', e);
    return [];
  }
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(reminders));
  } catch (e) {
    console.warn('Failed to save reminders', e);
  }
}
