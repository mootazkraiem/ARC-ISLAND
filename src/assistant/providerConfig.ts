// The one place that knows where Angelo is and how Arc Island addresses
// it. Everything else in src/assistant and src/screens/SystemScreen.tsx is
// backend-agnostic — it talks to the AIProvider interface in ./provider.ts.
//
// Arc Island no longer calls a cloud model. Its assistant is Angelo, the
// local AI core running as a separate process on this machine, and Angelo
// decides which LLM answers (Ollama locally by default, or Anthropic if
// its own config says so). Arc Island is a client of Angelo; it does not
// pick models, hold model keys, or talk to any model vendor.

export const PROVIDER_CONFIG = {
  /**
   * Where Angelo's Core is listening.
   *
   * MOBILE REALITY — read this before wondering why a phone can't connect.
   * Angelo's Core binds to 127.0.0.1 and *refuses* to bind anywhere else
   * (see angelo/core/__main__.py: it exits rather than listen on a LAN
   * address, deliberately — a network-reachable Core is a different
   * product with a different threat model). So:
   *
   *   - Web build on the same PC as Angelo:  works. This is the supported
   *     configuration today, and the browser reaches 127.0.0.1 directly.
   *   - iOS/Android on a physical phone:     cannot work. "localhost" on
   *     an iPhone means the iPhone, and Angelo is not on the iPhone.
   *     Pointing this at the PC's LAN IP does not help either, because
   *     the Core will not listen on one.
   *
   * There is no client-side trick that fixes that, and this file does not
   * pretend otherwise — Arc Island shows "Angelo is offline" on a phone,
   * which is the truth. Reaching Angelo from a phone needs a decision on
   * the Angelo side (an explicitly-configured non-loopback bind, or a
   * local tunnel), and that is Angelo's call to make, not Arc Island's.
   *
   * Overridable for the case this genuinely serves: a different port, or
   * a tunnel someone has deliberately set up. Never hardcode a machine's
   * own IP address here.
   */
  coreUrl: (process.env.EXPO_PUBLIC_ANGELO_CORE_URL ?? '').trim() || 'http://127.0.0.1:8770',

  /** Angelo's API is versioned; every route lives under this prefix. */
  apiPrefix: '/v1',

  /**
   * Which application Angelo is holding conversations for. Angelo's app
   * surface is generic — it keeps one conversation per (app, session) —
   * so this name is what keeps Arc Island's conversation separate from
   * Angelo's own desk conversation and from any future application's.
   */
  appName: 'arc_island',

  /**
   * How long to wait for one turn.
   *
   * Generous on purpose, and measured rather than guessed: a cold
   * llama3.1:8b on this machine took ~22s to produce its first tool call,
   * because the first request also loads the model into memory. A
   * two-minute ceiling covers a cold start plus a long planning turn; a
   * typical warm turn is a few seconds.
   */
  turnTimeoutMs: 120_000,

  /** Short, because this one only asks whether anything is listening. */
  healthTimeoutMs: 3_000,

  /**
   * Optional pre-configured Core token for local development, so a dev
   * build talks to Angelo without visiting Settings on every fresh
   * install. Read from a gitignored .env via Expo's EXPO_PUBLIC_ support.
   *
   * Must stay a direct `process.env.EXPO_PUBLIC_...` property access (not
   * a computed lookup) — Expo's bundler statically replaces exactly that
   * syntax at build time.
   *
   * Like any EXPO_PUBLIC_ value this ends up readable in the compiled JS
   * bundle. That is acceptable here in a way a cloud API key never was:
   * this token only authorises calls to a service bound to this machine's
   * loopback interface, it buys nothing off this machine, and it can be
   * rotated by deleting the token file. It is still never used for a
   * distributed build.
   */
  devDefaultToken: (process.env.EXPO_PUBLIC_ANGELO_CORE_TOKEN ?? '').trim() || null,
} as const;

/** Where Angelo keeps the token a client must present, per platform. Shown
 * in Settings so the token can be found without reading Angelo's source. */
export const CORE_TOKEN_PATH_HINT = '%LOCALAPPDATA%\\Angelo\\core.token';
