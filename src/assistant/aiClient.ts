// Stable entry point Arc Island's UI (SystemScreen.tsx) calls through. It
// deliberately knows nothing about Angelo specifically — today `provider`
// is an AngeloProvider, but SystemScreen and tools.ts only ever see the
// AIProvider interface, so swapping the AI layer again later is a one-line
// change in this file rather than a rewrite of the System.
//
// The provider abstraction survived the move off OpenRouter for exactly
// this reason: it is what made the move a new file plus one line here,
// instead of a change to every call site.
import { AngeloProvider } from './providers/angelo';
import {
  AIFailure,
  AIProvider,
  AIProviderError,
  ToolCall,
  ToolResult,
  TurnInput,
  TurnOutput,
} from './provider';

const provider: AIProvider = new AngeloProvider();

export type { AIFailure, ToolCall, ToolResult, TurnInput, TurnOutput };
export { AIProviderError };

/** One turn: what just happened plus current context in, prose and/or
 * tool calls out. Angelo keeps the conversation; Arc Island does not
 * re-send it. */
export function turn(input: TurnInput): Promise<TurnOutput> {
  return provider.turn(input);
}

/** Start a conversation over on Angelo's side too. */
export function resetConversation(session: string): Promise<void> {
  return provider.reset(session);
}

/** Whether Angelo is reachable right now. Never throws. */
export function coreReachable(): Promise<boolean> {
  return provider.health();
}

/**
 * What to show a person when a turn fails.
 *
 * The rule this encodes: name the thing that is actually wrong and the
 * one action that would fix it. "Network error 500 fetch failed" tells
 * someone nothing they can act on; "Angelo is offline" sends them to the
 * right window. Technical detail stays on the error object for logs.
 */
export function describeFailure(error: unknown): string {
  const failure: AIFailure = error instanceof AIProviderError ? error.failure : 'unknown';
  switch (failure) {
    case 'offline':
      return 'Angelo is offline. Start the Core, then try again.';
    case 'unauthorized':
      return "Angelo refused Arc Island's token. Re-enter it in Settings.";
    case 'backend_unavailable':
      return 'Angelo is running but its model is not responding.';
    case 'timeout':
      return 'Angelo took too long to answer.';
    case 'malformed':
      return 'Angelo answered with something unreadable.';
    case 'bad_request':
      return 'Angelo refused that request.';
    default:
      return 'The link to Angelo failed.';
  }
}
