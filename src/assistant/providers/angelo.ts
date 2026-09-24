// Arc Island's end of the wire to Angelo.
//
// This is the ONLY file in Arc Island that knows Angelo's HTTP surface:
// its routes, its payload shapes, its status codes. Everything above it
// (aiClient.ts, SystemScreen.tsx, tools.ts) speaks the AIProvider
// interface in ../provider.ts and would not notice if this were rewritten
// to reach Angelo some other way.
//
// The boundary this file defends, in both directions:
//
//   * Arc Island never imports anything from Angelo's source. Angelo is a
//     Python process; this is an HTTP client and nothing more.
//   * Angelo never touches Arc Island's data. It asks for tool calls;
//     Arc Island validates and executes them (see ../tools.ts) and reports
//     back. Angelo has no reminder store, no AsyncStorage, no database.
//
// Plain `fetch`, deliberately — there is nothing here that a dependency
// would do better.

import {
  AIFailure,
  AIProvider,
  AIProviderError,
  ToolCall,
  TurnInput,
  TurnOutput,
} from '../provider';
import { resolveCoreToken } from '../apiKeyStore';
import { PROVIDER_CONFIG } from '../providerConfig';

/** The Core's reply to POST /v1/app/turn. */
interface AppTurnResponse {
  text?: string;
  tool_calls?: unknown;
  app?: string;
  session?: string;
}

function endpoint(path: string): string {
  return `${PROVIDER_CONFIG.coreUrl.replace(/\/+$/, '')}${PROVIDER_CONFIG.apiPrefix}${path}`;
}

/**
 * Turn an HTTP status into the failure kind the UI can speak.
 *
 * Angelo distinguishes these itself, which is why this is a mapping and
 * not a guess: 400 means Arc Island sent something invalid, 401 means the
 * token is wrong, 503 means Angelo is up but its model backend is not
 * (Ollama stopped, or a cloud key missing). Those three want three
 * different sentences from the UI, and lumping them into "request failed"
 * is what sends someone to restart the wrong process.
 */
function failureForStatus(status: number): AIFailure {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 400 || status === 422) return 'bad_request';
  if (status === 503 || status === 502 || status === 504) return 'backend_unavailable';
  return 'unknown';
}

/** Angelo puts the reason in FastAPI's `detail`. Used for logs, not the UI. */
async function detailFrom(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Normalise whatever came back in `tool_calls` into the shape tools.ts
 * parses, dropping anything malformed rather than passing it on.
 *
 * Angelo already emits OpenAI's shape, so in practice this changes
 * nothing — but a reply is a reply from another process, and a tool call
 * with no name would otherwise reach `executeTool` and be reported to the
 * user as an unknown tool instead of as the protocol error it is.
 */
function parseToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  raw.forEach((entry: any, index: number) => {
    const name = entry?.function?.name;
    if (typeof name !== 'string' || !name) return;
    const args = entry?.function?.arguments;
    calls.push({
      id: typeof entry?.id === 'string' && entry.id ? entry.id : `call_${index}`,
      type: 'function',
      // tools.ts parses this with JSON.parse and handles its own failure.
      function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) },
    });
  });
  return calls;
}

export class AngeloProvider implements AIProvider {
  async turn(input: TurnInput): Promise<TurnOutput> {
    const body: Record<string, unknown> = {
      app: PROVIDER_CONFIG.appName,
      session: input.session,
      context: input.context,
      tools: input.tools,
    };
    if (input.text !== undefined) body.text = input.text;
    if (input.toolResults?.length) {
      body.tool_results = input.toolResults.map((result) => ({
        id: result.id,
        name: result.name,
        content: result.content,
      }));
    }

    const response = await this.post('/app/turn', body, PROVIDER_CONFIG.turnTimeoutMs);

    if (!response.ok) {
      const detail = await detailFrom(response);
      throw new AIProviderError(
        failureForStatus(response.status),
        detail,
        response.status,
        detail
      );
    }

    let json: AppTurnResponse;
    try {
      json = await response.json();
    } catch (e: any) {
      throw new AIProviderError('malformed', 'Angelo returned something unreadable.', 200, e?.message);
    }

    if (typeof json !== 'object' || json === null) {
      throw new AIProviderError('malformed', 'Angelo returned something unreadable.', 200);
    }

    const text = typeof json.text === 'string' ? json.text.trim() : '';
    return { content: text || null, tool_calls: parseToolCalls(json.tool_calls) };
  }

  async reset(session: string): Promise<void> {
    try {
      await this.post(
        '/app/reset',
        { app: PROVIDER_CONFIG.appName, session },
        PROVIDER_CONFIG.healthTimeoutMs
      );
    } catch {
      // Forgetting a conversation on a Core that is not running has
      // already happened, as far as anyone can tell. Never worth an error
      // in front of the user.
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.post('/health', undefined, PROVIDER_CONFIG.healthTimeoutMs, 'GET');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * One request, with a timeout and with transport failures already
   * classified.
   *
   * `fetch` rejects with an opaque TypeError when nothing is listening,
   * which is by far the most common state here — Angelo simply is not
   * running — and it must not surface as "Network request failed". The
   * token is read per call rather than cached so that saving one in
   * Settings takes effect on the next turn without a reload.
   */
  private async post(
    path: string,
    body: unknown,
    timeoutMs: number,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<Response> {
    const token = await resolveCoreToken();
    if (!token) {
      throw new AIProviderError(
        'unauthorized',
        'No Angelo Core token. Add one in Settings.',
        401
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(endpoint(path), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new AIProviderError(
          'timeout',
          `Angelo did not answer within ${Math.round(timeoutMs / 1000)}s.`,
          undefined,
          e?.message
        );
      }
      // Anything else from fetch at this layer means the request never
      // completed: connection refused, DNS, no route. All one thing to a
      // person — Angelo isn't reachable.
      throw new AIProviderError(
        'offline',
        `Could not reach Angelo at ${PROVIDER_CONFIG.coreUrl}.`,
        undefined,
        e?.message
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
