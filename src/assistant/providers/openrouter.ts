// OpenRouter implementation of AIProvider. OpenRouter exposes an
// OpenAI-compatible /chat/completions and /audio/transcriptions API in
// front of many models (including free ones), so this file is the only
// place that knows about openrouter.ai's URLs/headers — everything else
// talks to the generic AIProvider interface in ../provider.ts.
import { AIProvider, AIProviderError, ChatMessage, ToolCall } from '../provider';
import { PROVIDER_CONFIG } from '../providerConfig';

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    // Optional per OpenRouter's docs — identifies this app on their
    // rankings pages, has no effect on whether requests succeed.
    'HTTP-Referer': PROVIDER_CONFIG.appReferer,
    'X-Title': PROVIDER_CONFIG.appTitle,
  };
}

export class OpenRouterProvider implements AIProvider {
  async chatCompletion(
    messages: ChatMessage[],
    tools: readonly unknown[],
    apiKey: string
  ): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
    const res = await fetch(`${PROVIDER_CONFIG.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        model: PROVIDER_CONFIG.chatModel,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!res.ok) throw new AIProviderError(await parseErrorBody(res), res.status);
    const json = await res.json();
    const message = json.choices?.[0]?.message ?? {};
    return { content: message.content ?? null, tool_calls: message.tool_calls };
  }

  async transcribeAudio(uri: string, apiKey: string): Promise<string> {
    const form = new FormData();
    // @ts-expect-error React Native's FormData accepts this file-object shape.
    form.append('file', { uri, name: 'speech.m4a', type: 'audio/m4a' });
    form.append('model', PROVIDER_CONFIG.transcribeModel);

    const res = await fetch(`${PROVIDER_CONFIG.apiBase}/audio/transcriptions`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: form,
    });

    if (!res.ok) throw new AIProviderError(await parseErrorBody(res), res.status);
    const json = await res.json();
    return (json.text ?? '').trim();
  }
}
