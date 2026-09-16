/**
 * Story 6.10 — consumer-level proof.
 *
 * `apiService.envelope.test.ts` proves `request()` unwraps correctly. This suite
 * proves the *wrappers the screens actually call* now hand back payloads, against
 * a real HTTP server returning byte-exact backend bodies.
 *
 * This matters because the defect was silent: `tournamentApi.getTournaments()`
 * resolved successfully, it just resolved to the envelope. A type check cannot
 * see that, and a mocked `authFetch` would have agreed with the wrong assumption.
 *
 * Why `require()` inside `beforeAll` rather than top-level `import`: the modules
 * under test read `API_BASE_URL` at load time, and the port is only known once
 * the server has bound. Requiring after the bind lets the mocked config resolve
 * to the live port.
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
let tournamentApi: any;
let rankingApi: any;
let socialApi: any;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    const send = (body: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (path === '/tournaments') {
      // Byte-exact `GET /tournaments` (backend/src/routes/tournaments.ts:157)
      return send({
        success: true,
        data: {
          tournaments: [{ id: 't1', name: 'Autumn Open', scoringSystem: '21_POINT' }],
          total: 1,
          limit: 20,
          offset: 0,
        },
      });
    }
    if (path === '/tournaments/t1') {
      // Byte-exact `GET /tournaments/:id` (backend/src/routes/tournaments.ts:192)
      return send({
        success: true,
        data: { id: 't1', name: 'Autumn Open', scoringSystem: '21_POINT', maxPlayers: 16 },
      });
    }
    if (path === '/rankings/global') {
      return send({
        success: true,
        data: [
          { id: 'p1', name: 'Ada', ranking: 1, rankingPoints: 100, winRate: 0.8, matchesPlayed: 10, wins: 8, losses: 2 },
        ],
      });
    }
    if (path === '/sharing/feed') {
      return send({
        success: true,
        data: { shares: [{ id: 'sh1', type: 'session' }], sessions: [], total: 1 },
      });
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'nope' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  mockPort = (server.address() as AddressInfo).port;
  (authFetch as unknown as jest.Mock).mockImplementation(realRoundTrip);

  tournamentApi = require('../tournamentApi').tournamentApi;
  rankingApi = require('../rankingApi').rankingApi;
  socialApi = require('../socialApi').socialApi;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('consumers receive payloads, not envelopes (Story 6.10)', () => {
  it('tournamentApi.getTournaments returns a real tournaments array (TournamentListScreen)', async () => {
    const res = await tournamentApi.getTournaments({ status: 'REGISTRATION_OPEN' });

    expect(Array.isArray(res.tournaments)).toBe(true);
    expect(res.tournaments).toHaveLength(1);
    expect(res.tournaments[0].id).toBe('t1');
    expect(res.total).toBe(1);
    // The pre-fix shape: `res` was the envelope, so `.tournaments` was undefined.
    expect((res as any).success).toBeUndefined();
  });

  it('tournamentApi.getTournamentById returns the tournament itself (TournamentDetailScreen)', async () => {
    const res = await tournamentApi.getTournamentById('t1');
    // Pre-fix this was the envelope and `.scoringSystem` was undefined, which is
    // exactly the render-time TypeError at TournamentDetailScreen.tsx:467.
    expect(res.scoringSystem).toBe('21_POINT');
    expect((res as any).success).toBeUndefined();
  });

  it('rankingApi.getGlobalRankings returns the array directly (RankingScreen)', async () => {
    const res = await rankingApi.getGlobalRankings(5, 100);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].name).toBe('Ada');
  });

  it('socialApi.getCommunityFeed exposes the feed payload (CommunityFeedScreen)', async () => {
    const res = await socialApi.getCommunityFeed();
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data?.shares)).toBe(true);
    expect(res.data?.total).toBe(1);
  });
});
