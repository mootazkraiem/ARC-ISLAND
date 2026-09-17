import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SILENCE_MS, MAX_SILENCE_MS, MIN_SILENCE_MS } from './webSpeechRecognition';

// ─────────────────────────────────────────────────────────────────────────
// How long the System waits before deciding you've finished speaking.
//
// Separate storage key from reminders and progression, so voice tuning can
// be changed or reset without touching either. Read once at System-screen
// mount and cached in memory, because the value is needed synchronously at
// the moment the mic starts.
//
// Native is unaffected: there, voice is press-and-hold-then-release, so the
// user ends their own turn explicitly and no silence heuristic exists.
// ─────────────────────────────────────────────────────────────────────────

const KEY = 'voice/silenceMs/v1';

export const SILENCE_CHOICES: { ms: number; label: string; hint: string }[] = [
  { ms: 5000, label: '5s', hint: 'Quick back-and-forth' },
  { ms: 7000, label: '7s', hint: 'Recommended — room to think mid-sentence' },
  { ms: 10000, label: '10s', hint: 'Long, unhurried thoughts' },
  { ms: 15000, label: '15s', hint: 'Planning a whole week out loud' },
];

let cached: number = DEFAULT_SILENCE_MS;

export function getSilenceMs(): number {
  return cached;
}

export async function loadSilenceMs(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= MIN_SILENCE_MS && n <= MAX_SILENCE_MS) {
      cached = n;
    }
  } catch {
    // Keep the default — a missing preference must never block voice.
  }
  return cached;
}

export async function setSilenceMs(ms: number): Promise<void> {
  const clamped = Math.max(MIN_SILENCE_MS, Math.min(MAX_SILENCE_MS, Math.round(ms)));
  cached = clamped;
  try {
    await AsyncStorage.setItem(KEY, String(clamped));
  } catch {
    // In-memory value still applies for this session.
  }
}
