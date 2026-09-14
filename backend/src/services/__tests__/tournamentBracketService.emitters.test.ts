/**
 * Tournament match-completion → real-time emitter wiring (Story 6.4, AC 3;
 * Defect-3 regression) — re-pointed at the Story 6.7 facade.
 *
 * Proves that `tournamentBracketService.updateMatchResult` **persists first**
 * (through `bracket/persistence.applyResult`) and only then emits, and that a
 * real-time failure can never break the business path.
 *
 * The persistence layer is mocked here on purpose: this is a wiring test, not a
 * behaviour test. The real persistence behaviour is asserted against Postgres in
 * `bracket/__tests__/correction.test.ts`.
 */

const mockApplyResult = jest.fn();
const mockCorrectResult = jest.fn();
const mockGetBracketState = jest.fn();
const mockPersistBracket = jest.fn();

jest.mock('../bracket/persistence', () => ({
  BracketError: class BracketError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(code: string, statusCode: number, message: string) {
      super(message);
      this.name = 'BracketError';
      this.code = code;
      this.statusCode = statusCode;
    }
  },
  applyResult: (...args: unknown[]) => mockApplyResult(...args),
  correctResult: (...args: unknown[]) => mockCorrectResult(...args),
  getBracketState: (...args: unknown[]) => mockGetBracketState(...args),
  persistBracket: (...args: unknown[]) => mockPersistBracket(...args),
}));

const mockEmitMatchComplete = jest.fn();
const mockEmitLeaderboardUpdate = jest.fn();

jest.mock('../../socket/events/tournamentAnalytics', () => ({
  emitMatchComplete: (...args: unknown[]) => mockEmitMatchComplete(...args),
  emitLeaderboardUpdate: (...args: unknown[]) => mockEmitLeaderboardUpdate(...args),
}));

const mockParticipation = jest.fn();
const mockEfficiency = jest.fn();

jest.mock('../tournamentAnalyticsService', () => ({
  TournamentAnalyticsService: {
    calculateParticipationMetrics: (...args: unknown[]) => mockParticipation(...args),
    calculateBracketEfficiency: (...args: unknown[]) => mockEfficiency(...args),
  },
}));

import tournamentBracketService from '../tournamentBracketService';

describe('updateMatchResult → emitters (Story 6.4, AC 3 — Defect-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyResult.mockResolvedValue(undefined);
    mockCorrectResult.mockResolvedValue({
      matchId: 'm1',
      previousWinnerId: null,
      winnerId: 'winner-1',
      reason: 'x',
      cascade: false,
      recomputed: true,
      clearedDownstreamMatchIds: [],
    });
    mockEmitMatchComplete.mockResolvedValue(undefined);
    mockEmitLeaderboardUpdate.mockResolvedValue(undefined);
    mockParticipation.mockResolvedValue({});
    mockEfficiency.mockResolvedValue({});
  });

  it('persists before emitting the authoritative state', async () => {
    const order: string[] = [];
    mockApplyResult.mockImplementation(async () => {
      order.push('persist');
    });
    mockEmitMatchComplete.mockImplementation(async () => {
      order.push('emitMatchComplete');
    });
    mockEmitLeaderboardUpdate.mockImplementation(async () => {
      order.push('emitLeaderboardUpdate');
    });

    await tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1');

    expect(mockApplyResult).toHaveBeenCalledWith('m1', 'winner-1', undefined);
    expect(mockEmitMatchComplete).toHaveBeenCalledWith('t1', 'm1');
    expect(mockEmitLeaderboardUpdate).toHaveBeenCalledWith('t1');
    // The story forbids emitting unpersisted state.
    expect(order[0]).toBe('persist');
    expect(order).toContain('emitMatchComplete');
    expect(order).toContain('emitLeaderboardUpdate');
  });

  it('never lets a real-time failure break the business path', async () => {
    mockEmitMatchComplete.mockRejectedValue(new Error('socket down'));

    await expect(
      tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1'),
    ).resolves.toBeUndefined();

    expect(mockApplyResult).toHaveBeenCalled();
  });

  it('does not emit when persistence throws, and propagates the error', async () => {
    mockApplyResult.mockRejectedValue(new Error('write failed'));

    await expect(
      tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1'),
    ).rejects.toThrow('write failed');

    expect(mockEmitMatchComplete).not.toHaveBeenCalled();
    expect(mockEmitLeaderboardUpdate).not.toHaveBeenCalled();
  });

  it('re-emits after a correction', async () => {
    await tournamentBracketService.correctMatchResult('t1', 'm1', 'winner-2', 'wrong', true);

    expect(mockCorrectResult).toHaveBeenCalledWith('m1', 'winner-2', 'wrong', true);
    expect(mockEmitMatchComplete).toHaveBeenCalledWith('t1', 'm1');
    expect(mockEmitLeaderboardUpdate).toHaveBeenCalledWith('t1');
  });

  it('refreshes analytics participation BEFORE efficiency (design §D7)', async () => {
    const order: string[] = [];
    mockParticipation.mockImplementation(async () => {
      order.push('participation');
    });
    mockEfficiency.mockImplementation(async () => {
      order.push('efficiency');
    });

    await tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1');

    // The participation upsert must run first so the efficiency update has a row.
    expect(order).toEqual(['participation', 'efficiency']);
    expect(mockParticipation).toHaveBeenCalledWith('t1');
    expect(mockEfficiency).toHaveBeenCalledWith('t1');
  });

  it('never lets an analytics failure break the business path', async () => {
    mockParticipation.mockRejectedValue(new Error('analytics down'));

    await expect(
      tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1'),
    ).resolves.toBeUndefined();

    expect(mockEmitMatchComplete).toHaveBeenCalled();
  });
});
