// Shared types plus the one interface every AI backend must implement.
// The System (SystemScreen.tsx) and the tool executor (tools.ts) only ever
// talk to this shape — never to a backend's own REST quirks directly.
//
// WHAT CHANGED WHEN ARC ISLAND MOVED TO ANGELO
//
// This used to be an OpenAI-shaped interface: `chatCompletion(messages,
// tools, apiKey)`, where Arc Island kept the whole conversation in memory
// and re-sent it on every request. That is the right shape for a stateless
// cloud endpoint and the wrong one for Angelo, which owns the conversation
// itself (one per app+session) and only wants what is new.
//
// So the interface is now a *turn*: Arc Island says what just happened —
// the user spoke, or the tools Angelo asked for have been run — plus the
// application context that is true right now, and gets back prose and/or
// the next tool calls. History lives on one side of the wire only, which
// is what stops Arc Island and Angelo becoming two competing sources of
// truth for the same conversation.

/** One tool Angelo wants Arc Island to run. OpenAI's shape, because that
 * is what `tools.ts` already speaks and what `executeTool` already
 * parses — `arguments` is a JSON string, not a parsed object. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** What Arc Island reports back after running one. */
export interface ToolResult {
  id: string;
  name: string;
  /** Whatever `executeTool` returned. Serialised by the adapter. */
  content: unknown;
}

export interface TurnInput {
  /** Which conversation this belongs to. Angelo keeps one per session. */
  session: string;
  /** What the user just said. Absent when reporting tool results back. */
  text?: string;
  /** The System's instructions plus a snapshot of the world right now.
   * Sent every turn and stored by nobody: it is true at this instant and
   * will be stale by the next one. */
  context: string;
  /** What Angelo may ask Arc Island to do. Arc Island runs them, never
   * Angelo — Angelo has no access to any Arc Island data. */
  tools: readonly unknown[];
  /** Results of the calls from the previous turn. */
  toolResults?: ToolResult[];
}

export interface TurnOutput {
  content: string | null;
  tool_calls?: ToolCall[];
}

/**
 * Why a turn fails, in terms the UI can speak to a person.
 *
 * The old provider threw an `AIProviderError` carrying an HTTP status,
 * which was enough when every failure was "the cloud said no". A local
 * Core fails in kinds that a status code cannot express — most commonly
 * by not being there at all, which is not an error condition so much as
 * Angelo being switched off — so the adapter classifies instead, and
 * SystemScreen renders the classification rather than a status number.
 */
export type AIFailure =
  /** Nothing is listening on the Core's address. Angelo isn't running. */
  | 'offline'
  /** Reached it, but the token was missing or wrong. */
  | 'unauthorized'
  /** Angelo is up but its model backend isn't (Ollama down, no key). */
  | 'backend_unavailable'
  /** Took too long. A local model on a cold start can genuinely do this. */
  | 'timeout'
  /** Answered with something that isn't the agreed contract. */
  | 'malformed'
  /** Arc Island sent something Angelo refused as invalid. */
  | 'bad_request'
  /** Anything unclassified. */
  | 'unknown';

export class AIProviderError extends Error {
  readonly failure: AIFailure;
  readonly status?: number;
  /** The technical detail, for logs — never the message shown to a user. */
  readonly detail?: string;

  constructor(failure: AIFailure, message: string, status?: number, detail?: string) {
    super(message);
    this.name = 'AIProviderError';
    this.failure = failure;
    this.status = status;
    this.detail = detail;
  }
}

export interface AIProvider {
  /** One turn: what is new plus current context in, prose and/or tool
   * calls out. */
  turn(input: TurnInput): Promise<TurnOutput>;

  /** Forget a conversation on the backend. Called when Arc Island starts a
   * fresh exchange, so a new conversation is new on both sides. */
  reset(session: string): Promise<void>;

  /** Whether the backend is reachable right now, for a status indicator.
   * Never throws — an unreachable backend is an answer, not a failure. */
  health(): Promise<boolean>;
}
