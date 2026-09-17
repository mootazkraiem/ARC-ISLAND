// The one place that knows which AI provider Arc Island talks to, and which
// models it asks that provider for. Everything else in src/assistant and
// src/screens/SystemScreen.tsx is provider-agnostic — to point Arc Island at
// a different OpenAI-compatible endpoint (another hosted router, or a
// local/offline model server on your own network) later, edit this file
// only, not the conversation or tool-calling logic.

export const PROVIDER_CONFIG = {
  /** Base URL for the OpenAI-compatible chat + transcription API. */
  apiBase: 'https://openrouter.ai/api/v1',

  /**
   * OpenRouter's free-model router: for each request it picks a free model
   * that supports what the request needs (here, tool calling), at no cost.
   * It's not pinned to one specific model, so replies can vary slightly in
   * phrasing/quality between turns — that's the trade-off for "free."
   * Swap this for a specific model id (e.g.
   * "meta-llama/llama-3.3-70b-instruct:free") if you'd rather have
   * consistent behavior from one named free model instead of the router.
   */
  chatModel: 'openrouter/free',

  /**
   * Native (iOS/Android) ONLY — the web build never calls this model at
   * all (see src/webSpeechRecognition.ts and the hard guard in
   * src/assistant/providers/openrouter.ts's transcribeAudio()). OpenRouter
   * doesn't currently have a free speech-to-text model, so voice
   * transcription on native is billed a small per-minute amount on the
   * same OpenRouter key (still no separate OpenAI account/key needed).
   * Swap this for another transcription model id OpenRouter offers if
   * you'd prefer a different one.
   */
  transcribeModel: 'openai/whisper-1',

  /**
   * Optional attribution headers OpenRouter's docs recommend sending
   * (for their own app-ranking pages) — not required for requests to work.
   */
  appTitle: 'Arc Island',
  appReferer: 'https://github.com/remind-mvp',

  /**
   * Optional pre-configured key for local development, so a private dev
   * build can start already talking to OpenRouter without opening Settings
   * on every fresh install. Read from a gitignored .env file via Expo's
   * built-in EXPO_PUBLIC_ env var support (no extra package) — see
   * .env.example for the variable name and setup, and
   * apiKeyStore.ts's resolveApiKey() for how this is used as a fallback
   * *under* whatever's manually saved in Settings, never instead of it.
   *
   * Must stay a direct `process.env.EXPO_PUBLIC_...` property access
   * (not a computed/bracket lookup) — Expo's bundler statically replaces
   * exactly that syntax at build time.
   *
   * This value ends up readable in the compiled JS bundle, like any
   * EXPO_PUBLIC_ variable — fine for a private device-only dev build, but
   * this is not a secure secret store. Never used for a distributed build.
   */
  devDefaultApiKey: (process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '').trim() || null,
} as const;
