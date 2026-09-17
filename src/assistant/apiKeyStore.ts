import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROVIDER_CONFIG } from './providerConfig';

// One key, stored only on this device, used for both chat and voice
// transcription — OpenRouter is a single account/key in front of every
// model it routes to (see providerConfig.ts). Renamed from the old
// 'openai_api_key' when Arc Island moved off OpenAI directly: an old key saved
// under that name wouldn't work against OpenRouter's API anyway (different
// host, different key format), so there's nothing to migrate.
const KEY = 'openrouter_api_key';

// expo-secure-store has no web implementation at all — it throws when
// called there. AsyncStorage is already a dependency and has an official
// web backend (browser localStorage), so it's the natural fallback for this
// temporary web-preview path. Note this is less secure than the OS keychain
// SecureStore uses on native (localStorage is readable by any script on the
// page) — acceptable for a one-off local `expo start --web` session, not
// for a publicly hosted deployment. Native iOS/Android keep using
// SecureStore, exactly as before.
async function readStored(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

async function writeStored(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function removeStored(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

/** Exactly what's been manually saved in Settings, or null. Settings screen
 * uses this directly (not resolveApiKey() below) so it only ever shows/edits
 * what's actually stored on-device, never a pre-configured dev default. */
export async function getApiKey(): Promise<string | null> {
  try {
    return await readStored();
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  await writeStored(value.trim());
}

export async function clearApiKey(): Promise<void> {
  await removeStored();
}

/**
 * The key Arc Island should actually use to call OpenRouter with: whatever's
 * manually saved in Settings if anything (always wins — this is how you
 * "replace" the pre-configured key), otherwise the local-dev default from
 * .env (PROVIDER_CONFIG.devDefaultApiKey) if one's set, otherwise null
 * (same "no key yet" behavior as before this existed). AssistantScreen.tsx
 * calls this, not getApiKey(), for every actual chat/transcription call —
 * that's what makes a dev build with a .env key "just work" with no
 * Settings visit on a fresh install.
 */
export async function resolveApiKey(): Promise<string | null> {
  const manual = await getApiKey();
  if (manual) return manual;
  return PROVIDER_CONFIG.devDefaultApiKey;
}
