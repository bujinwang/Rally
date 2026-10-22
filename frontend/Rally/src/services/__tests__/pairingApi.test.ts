// Regression tests for the pairing API auth wiring.
//
// The backend mounts `router.use(authenticateToken)` on every /pairings route,
// so a request without `Authorization: Bearer <token>` fails with 401
// "Access token required" before the role check even runs. These tests pin that
// every pairing call goes through `authFetch` (which attaches the token and
// refreshes once on 401) instead of a bare `fetch`.

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3001/api/v1',
  ACCESS_TOKEN_KEY: 'accessToken',
  REFRESH_TOKEN_KEY: 'refreshToken',
}));

jest.mock('../authFetch', () => ({
  __esModule: true,
  authFetch: jest.fn(),
  clearAuthTokens: jest.fn(),
}));

import { authFetch } from '../authFetch';
import pairingApi from '../pairingApi';

const authFetchMock = authFetch as unknown as jest.Mock;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

const pairingBody = {
  success: true,
  data: {
    pairings: [{ id: 'p1', court: 1, players: [], createdAt: new Date() }],
    fairnessScore: 92,
    generatedAt: new Date(),
  },
};

describe('pairingApi auth wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generatePairings goes through authFetch with a relative path', async () => {
    authFetchMock.mockResolvedValue(jsonResponse(200, pairingBody));

    await pairingApi.generatePairings('sess-1', 'fair');

    expect(authFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('/pairings/sessions/sess-1/pairings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ algorithm: 'fair' });
  });

  it('sends every algorithm the backend service implements', async () => {
    for (const algorithm of [
      'fair',
      'random',
      'skill_balanced',
      'partnership_rotation',
    ] as const) {
      authFetchMock.mockResolvedValue(jsonResponse(200, pairingBody));
      await pairingApi.generatePairings('sess-1', algorithm);
      const [, init] = authFetchMock.mock.calls.at(-1)!;
      expect(JSON.parse(init.body)).toEqual({ algorithm });
    }
  });

  it('does not attach an Authorization header itself (authFetch owns that)', async () => {
    authFetchMock.mockResolvedValue(jsonResponse(200, pairingBody));

    await pairingApi.generatePairings('sess-1', 'fair');

    const [, init] = authFetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('surfaces the backend error message on 401', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      })
    );

    await expect(pairingApi.generatePairings('sess-1', 'fair')).rejects.toThrow(
      'Access token required'
    );
  });

  it('routes reads and mutations through authFetch too', async () => {
    authFetchMock.mockResolvedValue(jsonResponse(200, pairingBody));

    await pairingApi.getPairings('sess-1');
    expect(authFetchMock.mock.calls.at(-1)![0]).toBe('/pairings/sessions/sess-1/pairings');

    authFetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await pairingApi.clearPairings('sess-1');
    const [clearUrl, clearInit] = authFetchMock.mock.calls.at(-1)!;
    expect(clearUrl).toBe('/pairings/sessions/sess-1/pairings');
    expect(clearInit.method).toBe('DELETE');
  });
});
