// Shared types plus the one interface every AI provider must implement.
// Arc Island (AssistantScreen.tsx) and the tool executor (tools.ts) only ever
// talk to this shape — never to a provider's own SDK or REST quirks
// directly. Swapping providers later (a different hosted API, or a
// local/offline model server) means writing one new class that implements
// AIProvider and pointing providerConfig.ts at it; nothing in Arc Island's UI
// or conversation logic has to change.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export class AIProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface AIProvider {
  /** One assistant turn: running message history + tool defs in, a reply (and/or tool calls) out. */
  chatCompletion(
    messages: ChatMessage[],
    tools: readonly unknown[],
    apiKey: string
  ): Promise<{ content: string | null; tool_calls?: ToolCall[] }>;

  /** Turns a recorded voice clip (local file uri) into text. */
  transcribeAudio(uri: string, apiKey: string): Promise<string>;
}
