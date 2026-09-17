/**
 * Story 6.11 follow-up — `tournamentApi.getTournamentStats` and the
 * `TournamentStats` contract.
 *
 * `TournamentStats` declared `totalGames`, `totalSets`, `currentRound` and
 * `tournamentProgress`, none of which `GET /tournaments/:id/stats` has ever
 * returned, while omitting `maxPlayers`, `completionRate` and `status`, which it
 * always returns. `TournamentDetailScreen` read `tournamentProgress` and rendered
 * `Math.round(undefined)` — the literal string **"NaN%"** in the Progress tile.
 *
 * Two independent guards here, because either half can drift:
 *   1. a **compile-time** check tying `TournamentStats` to a single key list, so
 *      adding or removing a field on either side fails the build; and
 *   2. a **runtime** round-trip against a real HTTP server returning the
 *      byte-exact backend body, so the list cannot quietly stop matching reality.
 *
 * The server body is copied verbatim from `getTournamentStats`
 * (`backend/src/services/tournamentService.ts:397-404`), whose field set is in
 * turn pinned from the producer side by
 * `backend/src/services/__tests__/tournamentService.stats.test.ts`.
 *
 * `authFetch` is substituted for a real socket round-trip so the genuine
 * `apiService` runs — `getTournamentStats` reads `response.data` off the unwrapped
 * envelope (Story 6.10), and that indirection is exactly what could regress.
 */

jest.mock('../authFetch', () => ({
  __esModule: true,
  authFetch: jest.fn(),
  clearAuthTokens: jest.fn(),
}));

jest.mock('../deviceService', () => ({
  __esModule: true,
  default: { getDeviceId: jest.fn().mockResolvedValue('test-device-id') },
}));

// Resolves to the live ephemeral port once `mockPort` is set below.
let mockPort = 0;
jest.mock('../../config/api', () => ({
  get API_BASE_URL() {
    return `http://127.0.0.1:${mockPort}`;
  },
  ACCESS_TOKEN_KEY: 'accessToken',
  REFRESH_TOKEN_KEY: 'refreshToken',
  DEVICE_ID_KEY: '@badminton_device_id',
}));

import http from 'http';
import type { AddressInfo } from 'net';
import { authFetch } from '../authFetch';
import type { TournamentStats } from '../tournamentApi';

// ---------------------------------------------------------------------------
// The contract — one list, checked against the type in BOTH directions
// ---------------------------------------------------------------------------

const TOURNAMENT_STATS_KEYS = [
  'totalPlayers',
  'maxPlayers',
  'totalMatches',
  'completedMatches',
  'completionRate',
  'status',
] as const satisfies readonly (keyof TournamentStats)[];

/** Fails to compile unless the argument type is exactly `never`. */
type AssertNever<T extends never> = T;

// Every field `TournamentStats` declares must appear in the list…
type _NoFieldMissingFromList = AssertNever<
  Exclude<keyof TournamentStats, (typeof TOURNAMENT_STATS_KEYS)[number]>
>;
// …and the list must not invent a field the type does not declare.
type _NoExtraEntryInList = AssertNever<
  Exclude<(typeof TOURNAMENT_STATS_KEYS)[number], keyof TournamentStats>
>;

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
        res.on('data', (c) => {
          raw += c;
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

/**
 * The exact body `GET /api/v1/tournaments/:id/stats` produces for a tournament
 * with 16 registered players, 24 matches of which 6 are complete.
 *
 * `completionRate` is `(6 / 24) * 100 = 25` — a **percentage**, which is what the
 * Progress tile renders with a literal `%`.
 */
const BACKEND_STATS_BODY = {
  success: true,
  data: {
    totalPlayers: 16,
    maxPlayers: 32,
    totalMatches: 24,
    completedMatches: 6,
    completionRate: 25,
    status: 'IN_PROGRESS',
  },
  timestamp: '2026-09-17T00:00:00.000Z',
};

let server: http.Server;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(BACKEND_STATS_BODY));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  mockPort = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  hits = 0;
  (authFetch as unknown as jest.Mock).mockImplementation((url: string, init: RequestInit = {}) =>
    realRoundTrip(url, init),
  );
});

describe('getTournamentStats — payload', () => {
  it('returns the stats payload, not the envelope', async () => {
    // `require()` after the server has bound, so the mocked `API_BASE_URL` getter
    // resolves to the live port.
    const { default: tournamentApi } = require('../tournamentApi');

    const stats: TournamentStats = await tournamentApi.getTournamentStats('t1');

    expect(hits).toBe(1);
    // Post-6.10, `apiService` unwraps, so `response.data` is the payload. If that
    // ever regressed, these would read off the envelope and be `undefined`.
    expect(stats.totalPlayers).toBe(16);
    expect(stats.maxPlayers).toBe(32);
    expect(stats.totalMatches).toBe(24);
    expect(stats.completedMatches).toBe(6);
    expect(stats.completionRate).toBe(25);
    expect(stats.status).toBe('IN_PROGRESS');
  });

  it('populates every declared field — none is undefined', async () => {
    const { default: tournamentApi } = require('../tournamentApi');

    const stats = (await tournamentApi.getTournamentStats('t1')) as Record<string, unknown>;

    expect(Object.keys(stats).sort()).toEqual([...TOURNAMENT_STATS_KEYS].sort());
    for (const key of TOURNAMENT_STATS_KEYS) {
      expect(stats[key]).not.toBeUndefined();
    }
  });
});

describe('the NaN% regression', () => {
  it('completionRate is a finite number, so `Math.round` cannot yield NaN', async () => {
    const { default: tournamentApi } = require('../tournamentApi');

    const stats = await tournamentApi.getTournamentStats('t1');

    // This is the exact expression the Progress tile renders
    // (`TournamentDetailScreen.tsx:533`). It used to be
    // `Math.round(stats.tournamentProgress)`, where the field did not exist.
    const rendered = `${Math.round(stats.completionRate)}%`;
    expect(rendered).toBe('25%');
    expect(rendered).not.toContain('NaN');
  });

  it('the phantom field the screen used to read is gone from the type and the payload', async () => {
    const { default: tournamentApi } = require('../tournamentApi');

    const stats = (await tournamentApi.getTournamentStats('t1')) as Record<string, unknown>;

    expect(stats).not.toHaveProperty('tournamentProgress');
    // Belt and braces: the old code's failure mode, reproduced.
    expect(Number.isNaN(Math.round(stats.tournamentProgress as number))).toBe(true);
  });
});
