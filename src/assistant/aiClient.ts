// Stable entry point Nudge's UI (AssistantScreen.tsx) calls through. It
// deliberately knows nothing about OpenRouter specifically — today
// `provider` is an OpenRouterProvider, but AssistantScreen and tools.ts
// only ever see chatCompletion()/transcribeAudio(), so swapping in a
// different AIProvider (another hosted API, or a local/offline model
// later) is a one-line change in this file, not a rewrite of Nudge.
import { OpenRouterProvider } from './providers/openrouter';
import { AIProvider, AIProviderError, ChatMessage, ToolCall } from './provider';

const provider: AIProvider = new OpenRouterProvider();

export type { ChatMessage, ToolCall };
export { AIProviderError };

export function chatCompletion(
  messages: ChatMessage[],
  tools: readonly unknown[],
  apiKey: string
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  return provider.chatCompletion(messages, tools, apiKey);
}

export function transcribeAudio(uri: string, apiKey: string): Promise<string> {
  return provider.transcribeAudio(uri, apiKey);
}
