// Arc Island's end of the Angelo contract.
//
// `fetch` is the boundary under test: every case here is about what Arc
// Island puts on the wire and what it does with what comes back — the
// things that break silently when the two projects drift apart. No Core
// runs here, on purpose. Whether Angelo really answers this way is proven
// against a live Core in Angelo's own suite and by hand; this file proves
// Arc Island holds up its half.

import { AngeloProvider } from '../providers/angelo';
import { AIProviderError } from '../provider';
import { describeFailure } from '../aiClient';
import { PROVIDER_CONFIG } from '../providerConfig';

jest.mock('../apiKeyStore', () => ({
  resolveCoreToken: jest.fn(async () => 'test-token'),
}));

const { resolveCoreToken } = jest.requireMock('../apiKeyStore');

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function unreadableResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  } as unknown as Response;
}

const TOOLS = [
  { type: 'function', function: { name: 'list_quests', parameters: { type: 'object' } } },
] as const;

function turnInput(overrides: Record<string, unknown> = {}) {
  return { session: 's1', text: 'hello', context: 'SYSTEM RULES', tools: TOOLS, ...overrides } as any;
}

let provider: AngeloProvider;
let fetchMock: jest.Mock;

beforeEach(() => {
  provider = new AngeloProvider();
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  resolveCoreToken.mockResolvedValue('test-token');
});

// ------------------------------------------------------------ request


describe('what Arc Island puts on the wire', () => {
  it('posts to the Core app-turn route under the versioned prefix', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'ok' }));
    await provider.turn(turnInput());
    expect(fetchMock.mock.calls[0][0]).toBe(`${PROVIDER_CONFIG.coreUrl}/v1/app/turn`);
  });

  it('presents the Core token as a bearer credential', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'ok' }));
    await provider.turn(turnInput());
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('names the application so Angelo keeps this conversation separate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'ok' }));
    await provider.turn(turnInput({ session: 'forge-1' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.app).toBe('arc_island');
    expect(body.session).toBe('forge-1');
  });

  it('sends context and tools, and no message history', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'ok' }));
    await provider.turn(turnInput());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context).toBe('SYSTEM RULES');
    expect(body.tools).toHaveLength(1);
    // The whole point of the migration: Angelo owns the conversation, so
    // Arc Island must never re-send it. A `messages` array reappearing
    // here means two sources of truth are back.
    expect(body.messages).toBeUndefined();
  });

  it('omits text entirely when reporting tool results back', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'done' }));
    await provider.turn(
      turnInput({
        text: undefined,
        toolResults: [{ id: 'c1', name: 'list_quests', content: { count: 2 } }],
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect('text' in body).toBe(false);
    expect(body.tool_results).toEqual([{ id: 'c1', name: 'list_quests', content: { count: 2 } }]);
  });

  it('reads the token per call, so saving one takes effect immediately', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'ok' }));
    await provider.turn(turnInput());
    resolveCoreToken.mockResolvedValue('a-new-token');
    await provider.turn(turnInput());
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer a-new-token');
  });
});

// ----------------------------------------------------------- response


describe('what Arc Island makes of the reply', () => {
  it('returns prose as content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'Quest registered.' }));
    const result = await provider.turn(turnInput());
    expect(result.content).toBe('Quest registered.');
    expect(result.tool_calls).toEqual([]);
  });

  it('passes tool arguments through as the JSON string tools.ts parses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        text: '',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'register_quest', arguments: '{"title":"Gym"}' } },
        ],
      })
    );
    const result = await provider.turn(turnInput());
    expect(result.tool_calls![0].function.arguments).toBe('{"title":"Gym"}');
    expect(JSON.parse(result.tool_calls![0].function.arguments)).toEqual({ title: 'Gym' });
  });

  it('serialises arguments that arrive as an object rather than a string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        tool_calls: [{ id: 'c1', function: { name: 'f', arguments: { a: 1 } } }],
      })
    );
    const result = await provider.turn(turnInput());
    expect(result.tool_calls![0].function.arguments).toBe('{"a":1}');
  });

  it('drops a tool call with no name rather than passing it to the executor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ tool_calls: [{ id: 'c1', function: {} }, { id: 'c2', function: { name: 'ok' } }] })
    );
    const result = await provider.turn(turnInput());
    expect(result.tool_calls!.map((c) => c.function.name)).toEqual(['ok']);
  });

  it('substitutes an id when one is missing, so results can be correlated', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tool_calls: [{ function: { name: 'f' } }] }));
    const result = await provider.turn(turnInput());
    expect(result.tool_calls![0].id).toBeTruthy();
  });

  it('treats an empty reply as no content rather than an empty string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: '   ' }));
    expect((await provider.turn(turnInput())).content).toBeNull();
  });

  it('survives tool_calls being something other than an array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'hi', tool_calls: 'nonsense' }));
    expect((await provider.turn(turnInput())).tool_calls).toEqual([]);
  });
});

// ------------------------------------------------------------ failure


describe('failure, classified so the UI can say something useful', () => {
  it('reports connection refused as Angelo being offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'offline' });
  });

  it('reports an aborted request as a timeout, not as offline', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abort);
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'timeout' });
  });

  it('reports a rejected token as unauthorized', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Unauthorized' }, 401));
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'unauthorized' });
  });

  it('reports a Core whose model is down as backend_unavailable, not offline', async () => {
    // Angelo answers 503 when Ollama is not running. Collapsing this into
    // "offline" would send someone to restart the Core, which is up.
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Can't reach Ollama" }, 503));
    const error = await provider.turn(turnInput()).catch((e) => e);
    expect(error.failure).toBe('backend_unavailable');
    expect(error.detail).toContain('Ollama');
  });

  it('reports a malformed request as bad_request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'app is required' }, 400));
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'bad_request' });
  });

  it('reports an unreadable body as malformed', async () => {
    fetchMock.mockResolvedValue(unreadableResponse());
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'malformed' });
  });

  it('refuses to call at all with no token, rather than getting a 401', async () => {
    resolveCoreToken.mockResolvedValue(null);
    await expect(provider.turn(turnInput())).rejects.toMatchObject({ failure: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never falls back to another AI service', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await provider.turn(turnInput()).catch(() => {});
    // Exactly one host was contacted, and it was Angelo. A silent cloud
    // fallback is the specific thing this migration exists to prevent.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(PROVIDER_CONFIG.coreUrl);
  });
});

describe('what the user is told', () => {
  it.each([
    ['offline', 'Angelo is offline. Start the Core, then try again.'],
    ['unauthorized', "Angelo refused Arc Island's token. Re-enter it in Settings."],
    ['backend_unavailable', 'Angelo is running but its model is not responding.'],
    ['timeout', 'Angelo took too long to answer.'],
    ['malformed', 'Angelo answered with something unreadable.'],
    ['bad_request', 'Angelo refused that request.'],
  ])('%s reads as a sentence a person can act on', (failure, expected) => {
    expect(describeFailure(new AIProviderError(failure as any, 'technical detail'))).toBe(expected);
  });

  it('never shows raw technical detail', () => {
    const message = describeFailure(new AIProviderError('offline', 'TypeError: fetch failed', 0, 'ECONNREFUSED'));
    expect(message).not.toContain('fetch');
    expect(message).not.toContain('ECONNREFUSED');
  });

  it('handles something that is not an AIProviderError at all', () => {
    expect(describeFailure(new Error('boom'))).toBe('The link to Angelo failed.');
    expect(describeFailure(undefined)).toBe('The link to Angelo failed.');
  });
});

// ---------------------------------------------------------- lifecycle


describe('health and reset', () => {
  it('health is false rather than throwing when the Core is gone', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(provider.health()).resolves.toBe(false);
  });

  it('health is true when the Core answers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(provider.health()).resolves.toBe(true);
  });

  it('reset names the app and session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await provider.reset('s1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ app: 'arc_island', session: 's1' });
  });

  it('reset on a dead Core is silent', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(provider.reset('s1')).resolves.toBeUndefined();
  });
});
