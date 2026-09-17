// OpenRouter implementation of AIProvider. OpenRouter exposes an
// OpenAI-compatible /chat/completions and /audio/transcriptions API in
// front of many models (including free ones), so this file is the only
// place that knows about openrouter.ai's URLs/headers — everything else
// talks to the generic AIProvider interface in ../provider.ts.
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
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
    // One attempt, then one retry with a much larger budget if the model
    // was cut off mid-thought. See the note on TRUNCATION below.
    let result = await this.requestOnce(messages, tools, apiKey, PROVIDER_CONFIG.maxTokens);

    if (result.truncated && !result.tool_calls?.length) {
      result = await this.requestOnce(
        messages,
        tools,
        apiKey,
        PROVIDER_CONFIG.maxTokensRetry
      );
    }

    return { content: result.content, tool_calls: result.tool_calls };
  }

  /**
   * TRUNCATION — the reason max_tokens is as large as it is.
   *
   * `openrouter/free` is a router: it picks a different free model per
   * request. Several of the models it now reaches (nvidia/nemotron-3-super,
   * nex-agi/nex-n2.5-mini, and others) are REASONING models that emit a
   * long chain of thought before their actual answer. With the old
   * 300-token ceiling those models reliably spent the entire budget
   * thinking, came back with finish_reason "length", and never emitted the
   * tool call at all — so "I need to wake up at 7am" produced correct
   * reasoning ("this is a QUEST, register it") and then created nothing.
   *
   * Two defences, because the router's model choice is not under our
   * control and can change between any two requests:
   *   1. `reasoning: { exclude: true }` asks OpenRouter to drop reasoning
   *      tokens from the response on models that support the unified
   *      reasoning parameter, which stops most of the budget being burned.
   *   2. A budget large enough to survive the models that ignore (1),
   *      plus a single automatic retry at a much larger ceiling when a
   *      response still comes back truncated without a tool call.
   *
   * This costs nothing extra: these are free models, and the retry only
   * fires on the failure path.
   */
  private async requestOnce(
    messages: ChatMessage[],
    tools: readonly unknown[],
    apiKey: string,
    maxTokens: number
  ): Promise<{ content: string | null; tool_calls?: ToolCall[]; truncated: boolean }> {
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
        max_tokens: maxTokens,
        // OpenRouter's unified reasoning control. Ignored by models that
        // don't support it, so it is safe to always send.
        reasoning: { exclude: true },
      }),
    });

    if (!res.ok) throw new AIProviderError(await parseErrorBody(res), res.status);
    const json = await res.json();
    const choice = json.choices?.[0] ?? {};
    const message = choice.message ?? {};
    return {
      content: message.content ?? null,
      tool_calls: message.tool_calls,
      truncated: choice.finish_reason === 'length',
    };
  }

  /**
   * Native (iOS/Android) ONLY. Whisper (openai/whisper-1) is a paid
   * OpenRouter model billed per minute — the web build never calls this at
   * all anymore; it uses the browser's own free, on-device/browser-vendor
   * SpeechRecognition instead (see ../../webSpeechRecognition.ts and its
   * wiring in SystemScreen.tsx), so no audio is ever recorded or
   * uploaded on web, and this endpoint is never hit from there.
   *
   * The guard below is a hard safety net, not just a convention: if any
   * future change accidentally routed a web call in here, it throws
   * instead of silently making a paid request.
   */
  async transcribeAudio(uri: string, apiKey: string): Promise<string> {
    if (Platform.OS === 'web') {
      throw new AIProviderError(
        'transcribeAudio (paid Whisper) must never be called on web — voice on web uses the free on-device SpeechRecognition path instead. This is a bug if you see this message.'
      );
    }
    // SDK 57 made `expo/fetch` (a spec-compliant WinterCG fetch) the GLOBAL
    // fetch, replacing React Native's old fetch polyfill. Its FormData only
    // accepts string/Blob parts, so the old React-Native-only file shape —
    // form.append('file', { uri, name, type }) — now throws "Unsupported
    // FormDataPart implementation".
    const form = new FormData();
    // expo-file-system's File class wraps an existing file and implements
    // the real Blob interface, so it can be appended directly, with the
    // filename passed as append()'s 3rd arg. Native only — no web
    // implementation exists for this class, which is fine since web never
    // reaches this line (see the guard above).
    const file = new File(uri);
    form.append('file', file, file.name || 'speech.m4a');
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
