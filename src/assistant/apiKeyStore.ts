import * as SecureStore from 'expo-secure-store';
import { PROVIDER_CONFIG } from './providerConfig';

// One key, stored only on this device, used for both chat and voice
// transcription — OpenRouter is a single account/key in front of every
// model it routes to (see providerConfig.ts). Renamed from the old
// 'openai_api_key' when Arc Island moved off OpenAI directly: an old key saved
// under that name wouldn't work against OpenRouter's API anyway (different
// host, different key format), so there's nothing to migrate.
const KEY = 'openrouter_api_key';

/** Exactly what's been manually saved in Settings, or null. Settings screen
 * uses this directly (not resolveApiKey() below) so it only ever shows/edits
 * what's actually stored on-device, never a pre-configured dev default. */
export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
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
