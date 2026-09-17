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
 * unsupported browsers (currently Firefox) — callers should check this
 * before offering voice input on web, so the message is clear rather than
 * a generic error after the mic tap.
 */
export function isWebSpeechSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

export interface WebSpeechHandlers {
  /** Fires once with the final recognized text. Never fires if nothing was understood. */
  onResult: (transcript: string) => void;
  /** Fires on any failure — mic permission denied, no speech detected, a network hiccup in the browser's own recognizer, etc. Always human-readable. */
  onError: (message: string) => void;
  /** Always fires exactly once when the recognizer stops — after a result, after an error, or after a manual stop() — so the caller can reset UI state in one place. */
  onEnd: () => void;
}

export interface WebSpeechSession {
  /** Ends listening early (e.g. the user tapped the orb again). Safe to call more than once. */
  stop: () => void;
}

/**
 * Starts one listen-until-pause session. Call isWebSpeechSupported() first
 * — if it's false, don't call this at all and show your own message
 * instead. This function still guards internally and reports through
 * onError/onEnd if called anyway, so it never throws.
 */
export function startWebSpeechRecognition(handlers: WebSpeechHandlers): WebSpeechSession | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    handlers.onError("Voice input isn't supported in this browser.");
    handlers.onEnd();
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = 'en-US';
  // One utterance per tap, matching the existing tap-to-talk /
  // tap-to-stop orb UX — the recognizer stops itself after a pause, or the
  // caller can stop it early via the returned session.
  recognition.continuous = false;
  // Only the final transcript is used — no interim/partial text is shown,
  // so there's nothing to reconcile mid-utterance.
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) handlers.onResult(transcript);
  };

  recognition.onerror = (event: any) => {
    const code = event?.error;
    const message =
      code === 'not-allowed' || code === 'service-not-allowed'
        ? "Microphone access was blocked. Allow it in your browser's site settings, then try again."
        : code === 'no-speech'
        ? "Didn't hear anything — try again?"
        : `Voice recognition error: ${code || 'unknown'}`;
    handlers.onError(message);
  };

  // Per the Web Speech API spec, onend always fires after onresult and
  // after onerror (as well as after a manual stop() with neither) — so
  // this is the one place callers need to reset "listening" UI state.
  recognition.onend = () => {
    handlers.onEnd();
  };

  try {
    recognition.start();
  } catch (e: any) {
    handlers.onError(e?.message || 'Could not start voice recognition.');
    handlers.onEnd();
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Already stopped/aborted — nothing to do.
      }
    },
  };
}
