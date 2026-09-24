import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROVIDER_CONFIG } from './providerConfig';

// Angelo's Core token, stored only on this device.
//
// This is NOT a cloud API key, and it is not a secret that travels: it
// authorises calls to a service bound to this machine's loopback
// interface, and buys nothing anywhere else. Angelo mints it on first
// start and keeps it at %LOCALAPPDATA%\Angelo\core.token. Arc Island
// cannot read that file — a sandboxed app has no filesystem access to it,
// and on web there is no filesystem at all — so the token is pasted into
// Settings once, or supplied through .env for a dev build.
//
// Stored under a new name rather than reusing 'openrouter_api_key': an
// OpenRouter key saved under the old name is worthless against Angelo
// (different service, different format), and silently presenting it as a
// bearer token would produce a 401 that looked like a bug rather than
// like "you haven't set this up yet". The old entry is deliberately left
// where it is rather than migrated or deleted.
const KEY = 'angelo_core_token';

// expo-secure-store has no web implementation at all — it throws when
// called there. AsyncStorage is already a dependency and has an official
// web backend (browser localStorage), so it's the natural fallback for the
// web path. Note this is less secure than the OS keychain SecureStore uses
// on native (localStorage is readable by any script on the page) —
// acceptable for a local `expo start --web` session against a loopback
// service, not for a publicly hosted deployment. Native iOS/Android keep
// using SecureStore, exactly as before.
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

/** Exactly what's been manually saved in Settings, or null. The Settings
 * screen uses this directly (not resolveCoreToken() below) so it only ever
 * shows/edits what's actually stored on-device, never a pre-configured dev
 * default. */
export async function getCoreToken(): Promise<string | null> {
  try {
    return await readStored();
  } catch {
    return null;
  }
}

export async function setCoreToken(value: string): Promise<void> {
  await writeStored(value.trim());
}

export async function clearCoreToken(): Promise<void> {
  await removeStored();
}

/**
 * The token Arc Island should actually present to Angelo: whatever's
 * manually saved in Settings if anything (always wins — this is how you
 * replace a pre-configured one), otherwise the local-dev default from
 * .env (PROVIDER_CONFIG.devDefaultToken) if one's set, otherwise null.
 *
 * The Angelo adapter calls this on every request rather than caching it,
 * which is what makes saving a token in Settings take effect on the very
 * next turn without reloading the app.
 */
export async function resolveCoreToken(): Promise<string | null> {
  const manual = await getCoreToken();
  if (manual) return manual;
  return PROVIDER_CONFIG.devDefaultToken;
}
