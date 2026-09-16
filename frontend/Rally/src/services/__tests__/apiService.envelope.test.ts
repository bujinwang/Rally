/**
 * Story 6.10 — `ApiService.request()` envelope contract.
 *
 * These tests deliberately do NOT mock the HTTP layer. A real `http` server on an
 * ephemeral port returns byte-exact, backend-shaped bodies, and `authFetch` is
 * replaced by a thin adapter that performs a genuine socket round-trip and hands
 * back the raw bytes via `json()`. The assertions therefore run against the real
 * `request()` implementation and real response bytes — not against a stub that
 * could agree with a wrong assumption.
 *
 * Only `authFetch` (bearer-token attach + single refresh retry) is substituted.
 * It is covered separately by `authFetch.test.ts` and is not what this story
 * changed; substituting it keeps `AsyncStorage` out of the request path without
 * weakening the claim under test (how a response body is interpreted).
 */

import http from 'http';
import type { AddressInfo } from 'net';

jest.mock('../authFetch', () => ({
  __esModule: true,
  authFetch: jest.fn(),
  clearAuthTokens: jest.fn(),
}));

// `apiService` → `syncManager` → `deviceService` → `expo-constants`, whose
// published build is untranspiled ESM and dies at load in this jest setup
// (`SyntaxError: Cannot use import statement outside a module`). Mock the
// boundary rather than the transport: the device-id path is not under test here
// and is covered by its own suites.
jest.mock('../deviceService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

import { authFetch } from '../authFetch';
import { ApiService } from '../apiService';

/** Performs a real HTTP request and exposes the raw bytes as a `json()` reader. */
function realRoundTrip(url: string, init: RequestInit = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method: (init.method as string) || 'GET',
        headers: (init.headers as Record<string, string>) || {},
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(raw),
            __rawBody: raw,
          });
        });
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

let server: http.Server;
let svc: ApiService;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    switch (req.url) {
      // Byte-exact copy of `GET /tournaments` (backend/src/routes/tournaments.ts:157)
      case '/env/tournaments':
        return send(200, {
          success: true,
          data: {
            tournaments: [{ id: 't1', name: 'Autumn Open' }],
            total: 1,
            limit: 20,
            offset: 0,
          },
          timestamp: '2026-09-16T00:00:00.000Z',
        });
      // Byte-exact copy of `GET /mvp-sessions/join/:shareCode` (mvpSessions.ts:665)
      case '/env/session':
        return send(200, {
          success: true,
          data: { session: { id: 's1', shareCode: 'ABC123', name: 'Fri Night' } },
        });
      // A payload that legitimately contains its own `data` key.
      case '/env/payload-with-data-key':
        return send(200, {
          success: true,
          data: { data: { nested: 1 }, id: 'x' },
        });
      // `success: true` but no payload at all.
      case '/env/no-data':
        return send(200, { success: true, message: 'ok' });
      // Non-enveloped bodies — must pass through untouched.
      case '/env/raw-array':
        return send(200, [{ id: 'a' }, { id: 'b' }]);
      case '/env/raw-object':
        return send(200, { foo: 1 });
      // Error envelope.
      case '/env/error':
        return send(403, {
          success: false,
          error: { code: 'FORBIDDEN', message: 'not the organizer' },
        });
      default:
        return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'nope' } });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  svc = new ApiService(`http://127.0.0.1:${port}`);
  (authFetch as unknown as jest.Mock).mockImplementation(realRoundTrip);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  hits = 0;
});

describe('ApiService.request — envelope unwrapping (Story 6.10)', () => {
  it('unwraps the backend envelope so `data` is the payload, not the envelope', async () => {
    const res = await svc.get<{ tournaments: unknown[]; total: number }>('/env/tournaments');

    expect(res.success).toBe(true);
    expect(Array.isArray(res.data?.tournaments)).toBe(true);
    expect(res.data?.tournaments).toHaveLength(1);
    expect(res.data?.total).toBe(1);
    // The pre-fix behaviour: `data` was the envelope, so this was `undefined`.
    expect((res.data as any).success).toBeUndefined();
  });

  it('preserves `message` and `timestamp` from the envelope', async () => {
    const res = await svc.get('/env/tournaments');
    expect(res.timestamp).toBe('2026-09-16T00:00:00.000Z');
  });

  it('unwraps a nested payload (mvp session shape)', async () => {
    const res = await svc.get<{ session: { shareCode: string } }>('/env/session');
    expect(res.data?.session?.shareCode).toBe('ABC123');
  });

  it('does NOT over-unwrap when the payload itself has a `data` key', async () => {
    const res = await svc.get<{ data: { nested: number }; id: string }>(
      '/env/payload-with-data-key',
    );
    expect(res.data?.id).toBe('x');
    expect(res.data?.data?.nested).toBe(1);
  });

  it('handles an envelope with no payload', async () => {
    const res = await svc.get('/env/no-data');
    expect(res.success).toBe(true);
    expect(res.data).toBeUndefined();
  });

  it('passes a raw array through untouched', async () => {
    const res = await svc.get<Array<{ id: string }>>('/env/raw-array');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data?.[0]?.id).toBe('a');
  });

  it('passes a raw object without a boolean `success` through untouched', async () => {
    const res = await svc.get<{ foo: number }>('/env/raw-object');
    expect(res.data).toEqual({ foo: 1 });
  });

  it('leaves the error path unchanged and preserves the backend error code', async () => {
    const res = await svc.get('/env/error');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('FORBIDDEN');
    expect(res.error?.message).toBe('not the organizer');
  });

  it('really performed HTTP round-trips (the seam is not stubbed)', async () => {
    await svc.get('/env/tournaments');
    await svc.get('/env/raw-array');
    expect(hits).toBe(2);
  });
});
