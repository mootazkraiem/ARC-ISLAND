// Web-only speech-to-text via the browser's own built-in Web Speech API
// (SpeechRecognition / webkitSpeechRecognition). This is what keeps voice
// input on the web build at strictly $0: the browser itself captures the
// microphone AND turns it into text — on-device or via the browser
// vendor's own free recognition service, depending on the browser. Nothing
// is ever recorded to a file or uploaded to OpenRouter (or anywhere else)
// from this path, so it cannot generate any billing whatsoever.
//
// Completely separate from native iOS/Android voice
// (src/assistant/providers/openrouter.ts's transcribeAudio, backed by the
// paid openai/whisper-1 model on OpenRouter) — this file is never imported
// by anything on the native path, and every function here is a no-op/false
// on native anyway since `window` doesn't exist there.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT A THIN WRAPPER: THE INTERRUPTION PROBLEM
//
// The browser's default behaviour is to listen for ONE short utterance and
// stop at the first pause. With `continuous = false` and
// `interimResults = false`, the recognizer ends the moment you take a
// breath, and only `results[0]` — the first phrase — is ever read.
//
// In practice that meant saying "I need to wash my hair and get a shower"
// produced the fragment "I need to watch", fired it at the model
// immediately, and the System replied over the top of the user while they
// were still talking. Every natural pause mid-sentence was treated as
// "done speaking".
//
// This module fixes that by making a session last until the speaker is
// GENUINELY finished, judged three ways:
//
//   1. SILENCE WINDOW — a configurable stretch of quiet (default 7s, well
//      past a normal thinking pause) with no new words at all. Any speech,
//      even an interim partial result, resets the clock.
//   2. HAND-OFF PHRASE — saying something like "go ahead", "that's it", or
//      "you can schedule that" ends the turn instantly, so a speaker who
//      knows they're done never has to wait out the silence window.
//   3. MANUAL STOP — tapping the orb submits whatever has been gathered.
//
// Everything heard across every pause is accumulated into one transcript
// and delivered as a single result, so a long multi-sentence thought
// arrives whole instead of as its first three words.
//
// Chrome also terminates a `continuous` session on its own every so often
// (and on transient network blips). The session restarts itself silently
// in that case, so a long monologue is never truncated by the browser's
// internal timeout — see `restart()` below.
// ─────────────────────────────────────────────────────────────────────────
//
// Support: recent Chrome, Edge, and Safari expose one of the two
// constructor names below. Firefox implements neither as of this writing.
// isWebSpeechSupported() reports that up front so the UI can show a clear,
// honest message instead of a silent failure or — worse — a hidden
// fallback to a paid API.
//
// No DOM lib types are used here (this project's tsconfig doesn't assume
// one — see the web <input> workaround in EditorScreen.tsx for the same
// pattern): browser globals are read dynamically and typed loosely,
// exactly like src/alert.ts and src/webReminderAlerts.ts already do.

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getWindow(): any {
  return (globalThis as any).window;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const win = getWindow();
  if (!win) return null;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

/**
 * True only in browsers that expose SpeechRecognition or
 * webkitSpeechRecognition. Always false on native (no `window`) and in
 * unsupported browsers (currently Firefox).
 */
export function isWebSpeechSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

/** How long the speaker may stay quiet before the System decides the turn
 * is over. Deliberately generous: a normal mid-thought pause is well under
 * two seconds, so this never cuts anyone off mid-sentence. */
export const DEFAULT_SILENCE_MS = 7000;
export const MIN_SILENCE_MS = 3000;
export const MAX_SILENCE_MS = 20000;

/**
 * Spoken phrases that end the turn immediately. Matched only at the very
 * END of what has been said so far — otherwise "I need to go ahead and
 * book the room" would submit halfway through the sentence.
 *
 * Kept deliberately short and unambiguous; anything that could plausibly
 * appear mid-sentence is excluded.
 */
export const HANDOFF_PHRASES: string[] = [
  'you can schedule that',
  'you can schedule it',
  'schedule that for me',
  'go ahead',
  "that's it",
  'that is it',
  "that's all",
  'that is all',
  'over to you',
  'your turn',
  'i am done',
  "i'm done",
  'done talking',
  'finished talking',
];

/** Strips punctuation/casing so phrase matching survives the recognizer's
 * own formatting (Chrome often returns "That's it." with a full stop). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the speaker signalled they are finished. Only matches at the
 * tail of the transcript, so a hand-off phrase used mid-sentence does not
 * cut the turn short. */
export function endsWithHandoff(text: string, phrases: string[] = HANDOFF_PHRASES): string | null {
  const norm = normalize(text);
  for (const phrase of phrases) {
    if (norm === phrase || norm.endsWith(' ' + phrase)) return phrase;
  }
  return null;
}

/** Removes a trailing hand-off phrase from the transcript. "Book the gym at
 * six tomorrow, that's it" is an instruction plus a turn signal — only the
 * instruction should reach the model, so the signal is trimmed off. Words
 * are counted rather than characters so the original casing/punctuation of
 * the kept part survives untouched. */
export function stripTrailingHandoff(text: string, phrases: string[] = HANDOFF_PHRASES): string {
  const hit = endsWithHandoff(text, phrases);
  if (!hit) return text.trim();

  const dropCount = hit.split(' ').length;
  const words = text.trim().split(/\s+/);
  const kept = words.slice(0, Math.max(0, words.length - dropCount)).join(' ');
  // Tidy a dangling comma/conjunction left behind by the removal.
  const tidied = kept.replace(/[,;:\-]+$/, '').trim();
  // Never hand back an empty string: if the whole utterance WAS the phrase
  // (the user just said "go ahead"), keep it so the model still gets input.
  return tidied || text.trim();
}

export interface WebSpeechHandlers {
  /** Fires ONCE per session with the complete accumulated transcript —
   * everything said across every pause, joined into one string. */
  onResult: (transcript: string) => void;
  /** Live partial text while the user is still speaking. Lets the UI show
   * that the System is still gathering rather than appearing frozen.
   * `committed` is what has been finalized so far; `pending` is the
   * in-flight phrase the recognizer has not committed yet. */
  onInterim?: (committed: string, pending: string) => void;
  /** Fires when the turn actually ends, naming why. Purely informational —
   * used by the UI to explain itself. */
  onTurnEnd?: (reason: 'silence' | 'handoff' | 'manual') => void;
  /** Fires on any failure — mic permission denied, etc. Human-readable. */
  onError: (message: string) => void;
  /** Always fires exactly once when the session is fully over. */
  onEnd: () => void;
}

export interface WebSpeechOptions {
  /** Quiet stretch that ends the turn. Defaults to DEFAULT_SILENCE_MS. */
  silenceMs?: number;
  /** Override the hand-off phrase list. */
  handoffPhrases?: string[];
  lang?: string;
}

export interface WebSpeechSession {
  /** Ends listening now and submits whatever was gathered. Idempotent. */
  stop: () => void;
  /** Throws the turn away without submitting anything. */
  cancel: () => void;
}

/**
 * Starts one listen-until-genuinely-finished session. Call
 * isWebSpeechSupported() first — if it's false, don't call this at all.
 * This function still guards internally and reports through
 * onError/onEnd if called anyway, so it never throws.
 */
export function startWebSpeechRecognition(
  handlers: WebSpeechHandlers,
  options: WebSpeechOptions = {}
): WebSpeechSession | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    handlers.onError("Voice input isn't supported in this browser.");
    handlers.onEnd();
    return null;
  }

  const silenceMs = Math.max(
    MIN_SILENCE_MS,
    Math.min(MAX_SILENCE_MS, options.silenceMs ?? DEFAULT_SILENCE_MS)
  );
  const phrases = options.handoffPhrases ?? HANDOFF_PHRASES;

  // ── session state ──────────────────────────────────────────────────────
  // `committed` accumulates every FINAL phrase across the whole session,
  // including across the browser's own internal restarts. `pending` is the
  // current in-flight interim phrase, which is replaced (not appended) on
  // every event because the recognizer keeps revising it.
  let committed = '';
  let pending = '';
  let finished = false; // the caller has been told the session is over
  let stopping = false; // we asked the recognizer to stop; ignore its restart
  let silenceTimer: any = null;
  let recognition: SpeechRecognitionLike | null = null;

  const clearSilence = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  /** Ends the whole session exactly once and hands the caller the full
   * transcript. Every exit path funnels through here. */
  const finish = (reason: 'silence' | 'handoff' | 'manual' | 'error', submit: boolean) => {
    if (finished) return;
    finished = true;
    stopping = true;
    clearSilence();

    try {
      recognition?.stop();
    } catch {
      /* already stopped */
    }

    const raw = [committed, pending].map((s) => s.trim()).filter(Boolean).join(' ').trim();
    // A hand-off phrase is a turn signal, not part of the request.
    const full = reason === 'handoff' ? stripTrailingHandoff(raw, phrases) : raw;

    if (submit && full) {
      if (reason !== 'error') handlers.onTurnEnd?.(reason as 'silence' | 'handoff' | 'manual');
      handlers.onResult(full);
    }
    handlers.onEnd();
  };

  /** Any speech at all — even an unconfirmed partial — means the speaker is
   * still going, so the silence clock starts over from zero. */
  const armSilence = () => {
    clearSilence();
    silenceTimer = setTimeout(() => finish('silence', true), silenceMs);
  };

  const attach = (rec: SpeechRecognitionLike) => {
    rec.lang = options.lang ?? 'en-US';
    // Keep listening straight through the speaker's pauses. This single
    // flag is the core of the fix — see the note at the top of this file.
    rec.continuous = true;
    // Needed for two reasons: to reset the silence clock while a phrase is
    // still being spoken (a long word is not silence), and to let the UI
    // show live text so the user can see they are still being heard.
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      if (finished) return;
      const results = event?.results;
      if (!results) return;

      // Re-read from resultIndex: earlier entries are already committed.
      let newlyFinal = '';
      let interim = '';
      for (let i = event.resultIndex ?? 0; i < results.length; i++) {
        const res = results[i];
        const text = res?.[0]?.transcript ?? '';
        if (res?.isFinal) newlyFinal += text + ' ';
        else interim += text + ' ';
      }

      if (newlyFinal.trim()) committed = (committed + ' ' + newlyFinal).replace(/\s+/g, ' ').trim();
      pending = interim.trim();

      handlers.onInterim?.(committed, pending);

      // A hand-off phrase ends the turn at once — but only when it is
      // actually FINAL text. Acting on an interim guess would cut people
      // off on a mis-hearing, which is the very bug this file fixes.
      if (newlyFinal.trim()) {
        const hit = endsWithHandoff(committed, phrases);
        if (hit) {
          finish('handoff', true);
          return;
        }
      }

      armSilence();
    };

    rec.onerror = (event: any) => {
      const code = event?.error;

      // "no-speech" and "aborted" are NOT failures here: with a long
      // silence window the recognizer often reports no-speech during a
      // legitimate pause, and aborted fires on our own restarts. Swallow
      // both and let the silence timer decide when the turn is over.
      if (code === 'no-speech' || code === 'aborted') return;

      const message =
        code === 'not-allowed' || code === 'service-not-allowed'
          ? "Microphone access was blocked. Allow it in your browser's site settings, then try again."
          : code === 'audio-capture'
          ? 'No microphone was found.'
          : `Voice recognition error: ${code || 'unknown'}`;

      handlers.onError(message);
      finish('error', true); // still submit anything already gathered
    };

    rec.onend = () => {
      if (finished || stopping) return;
      // Chrome ends a continuous session on its own periodically. Restart
      // transparently so a long thought is never cut off by the browser's
      // internal timeout rather than by the speaker actually stopping.
      restart();
    };
  };

  const restart = () => {
    if (finished || stopping) return;
    try {
      const next = new Ctor();
      attach(next);
      recognition = next;
      next.start();
    } catch {
      // If it refuses to restart, fall back to submitting what we have
      // rather than stranding the user in a dead "listening" state.
      finish('silence', true);
    }
  };

  try {
    const first = new Ctor();
    attach(first);
    recognition = first;
    first.start();
    armSilence();
  } catch (e: any) {
    handlers.onError(e?.message || 'Could not start voice recognition.');
    handlers.onEnd();
    return null;
  }

  return {
    stop: () => finish('manual', true),
    cancel: () => {
      if (finished) return;
      finished = true;
      stopping = true;
      clearSilence();
      try {
        recognition?.abort();
      } catch {
        /* already gone */
      }
      handlers.onEnd();
    },
  };
}
