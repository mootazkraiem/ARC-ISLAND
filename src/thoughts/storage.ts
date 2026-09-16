import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInitialVaultState, ThoughtVaultState } from './types';

// Its own key, its own file, its own concern — same pattern as
// progression/storage.ts. Wiping this never touches reminders or XP.
const KEY = 'thoughtVault/v1';

export async function loadVault(): Promise<ThoughtVaultState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return createInitialVaultState();
    const parsed = JSON.parse(raw);
    return { ...createInitialVaultState(), ...parsed };
  } catch (e) {
    console.warn('Failed to load idea vault', e);
    return createInitialVaultState();
  }
}

export async function saveVault(state: ThoughtVaultState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save idea vault', e);
  }
}
