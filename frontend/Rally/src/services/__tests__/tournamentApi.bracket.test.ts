// Story 6.7 T05 — bracket API methods.
//
// These tests pin the two things that matter most for the frontend contract:
//   1. Every bracket call attaches the caller's device id as `x-device-id`, so a
//      logged-out device-based organizer is authorised on the guarded mutation
//      endpoints (the backend guard reads `req.body.deviceId` OR this header).
//   2. The standard error envelope is surfaced as a `TournamentApiError` that
//      preserves the backend `error.code` (FORBIDDEN / BRACKET_GENERATION_FAILED
//      / BRACKET_NOT_FOUND), so the UI can show something meaningful.

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../deviceService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('device-xyz'),
  },
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

jest.mock('../apiService', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { authFetch } from '../authFetch';
import tournamentApi, { TournamentApiError } from '../tournamentApi';
import type { TournamentBracket } from '../tournamentApi';

const authFetchMock = authFetch as unknown as jest.Mock;

/** Minimal fake fetch Response with a JSON body. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

const sampleBracket: TournamentBracket = {
  tournamentId: 't1',
  totalRounds: 1,
  totalPlayers: 2,
  bracket: [
    [
      {
        id: 'm1',
        round: 1,
        match: 1,
        player1Id: 'p1',
        player2Id: 'p2',
        winnerId: null,
        status: 'SCHEDULED',
        feedMatch1Id: null,
        feedMatch2Id: null,
        bracket: 'WINNERS',
      },
    ],
  ],
  currentRound: 1,
  isComplete: false,
  format: 'SINGLE_ELIMINATION',
  totalMatches: 1,
  byePlayers: [],
};

beforeEach(() => {
  authFetchMock.mockReset();
});

describe('tournamentApi — bracket identity', () => {
  it('sends x-device-id and the correct URL when generating a bracket', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(201, { success: true, data: { bracket: sampleBracket } }),
    );

    const result = await tournamentApi.generateBracket('t1');

    expect(result).toEqual(sampleBracket);
    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/tournaments/t1/bracket/generate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-device-id']).toBe('device-xyz');
  });

  it('sends x-device-id and the winner when recording a result', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, message: 'Result recorded successfully' }),
    );

    await tournamentApi.recordResult('t1', 'm1', 'p1', '21-19 21-15');

    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/tournaments/t1/matches/m1/result');
    expect(init.headers['x-device-id']).toBe('device-xyz');
    expect(JSON.parse(init.body)).toEqual({ winnerId: 'p1', score: '21-19 21-15' });
  });

  it('omits the score field when none is supplied', async () => {
    authFetchMock.mockResolvedValue(jsonResponse(200, { success: true }));

    await tournamentApi.recordResult('t1', 'm1', 'p2');

    const [, init] = authFetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ winnerId: 'p2' });
  });

  it('sends x-device-id, reason and cascade when correcting a result', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { matchId: 'm1', recomputed: true } }),
    );

    const result = await tournamentApi.correctResult('t1', 'm1', 'p2', 'wrong winner', true);

    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/tournaments/t1/matches/m1/correct');
    expect(init.headers['x-device-id']).toBe('device-xyz');
    expect(JSON.parse(init.body)).toEqual({
      winnerId: 'p2',
      reason: 'wrong winner',
      cascade: true,
    });
    expect(result).toEqual({ matchId: 'm1', recomputed: true });
  });
});

describe('tournamentApi — bracket responses and errors', () => {
  it('unwraps data.bracket from the envelope', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { bracket: sampleBracket } }),
    );

    const bracket = await tournamentApi.getBracket('t1');
    expect(bracket).toEqual(sampleBracket);
  });

  it('returns null when no bracket exists yet (404 BRACKET_NOT_FOUND)', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(404, {
        success: false,
        error: { code: 'BRACKET_NOT_FOUND', message: 'No bracket exists for this tournament' },
      }),
    );

    await expect(tournamentApi.getBracket('t1')).resolves.toBeNull();
  });

  it('surfaces FORBIDDEN with its message', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not the organizer of this tournament' },
      }),
    );

    await expect(tournamentApi.generateBracket('t1')).rejects.toMatchObject({
      name: 'TournamentApiError',
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('surfaces an actionable BRACKET_GENERATION_FAILED message', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(400, {
        success: false,
        error: {
          code: 'BRACKET_GENERATION_FAILED',
          message: 'Double elimination requires a power-of-two field',
        },
      }),
    );

    try {
      await tournamentApi.generateBracket('t1');
      throw new Error('expected generateBracket to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(TournamentApiError);
      expect((error as TournamentApiError).code).toBe('BRACKET_GENERATION_FAILED');
      expect((error as TournamentApiError).message).toContain('power-of-two');
    }
  });

  it('surfaces DOWNSTREAM_COMPLETED (409) when a correction needs a cascade', async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: {
          code: 'DOWNSTREAM_COMPLETED',
          message:
            'Cannot correct match m1: 2 downstream match(es) are already completed. ' +
            'Retry with cascade=true to void them.',
        },
      }),
    );

    await expect(tournamentApi.correctResult('t1', 'm1', 'p2', 'wrong winner')).rejects.toMatchObject({
      name: 'TournamentApiError',
      code: 'DOWNSTREAM_COMPLETED',
      status: 409,
    });
  });

  it('returns standings from the envelope', async () => {
    const standings = [
      {
        playerId: 'p1',
        playerName: 'Alice',
        rank: 1,
        seed: 1,
        winRate: 1,
        totalMatches: 3,
        isEliminated: false,
        status: 'ADVANCED',
      },
    ];
    authFetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { standings } }));

    await expect(tournamentApi.getStandings('t1')).resolves.toEqual(standings);
  });
});
