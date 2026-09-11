// @ts-nocheck
/**
 * Tournament match-completion → real-time emitter wiring (Story 6.4, AC 3;
 * Defect-3 regression).
 *
 * Proves that the previously-dead emitters (`emitMatchComplete`,
 * `emitLeaderboardUpdate`) are actually invoked on the real match-result write
 * path (`tournamentBracketService.updateMatchResult`), AFTER persistence, and
 * that a real-time failure can never break the business path.
 */
import { PrismaClient } from '@prisma/client';

const mockEmitMatchComplete = jest.fn();
const mockEmitLeaderboardUpdate = jest.fn();

jest.mock('../../socket/events/tournamentAnalytics', () => ({
  emitMatchComplete: (...a: unknown[]) => mockEmitMatchComplete(...a),
  emitLeaderboardUpdate: (...a: unknown[]) => mockEmitLeaderboardUpdate(...a),
}));

jest.mock('@prisma/client', () => {
  const instance = {
    tournamentMatch: { update: jest.fn(), findUnique: jest.fn() },
    tournamentGame: { update: jest.fn() },
    tournamentRound: { findFirst: jest.fn() },
    tournamentPlayer: { findUnique: jest.fn() },
    tournamentResult: { create: jest.fn() },
    tournament: { update: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => instance) };
});

import tournamentBracketService from '../tournamentBracketService';

const prisma = new PrismaClient() as any;

describe('updateMatchResult → emitters (Story 6.4, AC 3 — Defect-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitMatchComplete.mockResolvedValue(undefined);
    mockEmitLeaderboardUpdate.mockResolvedValue(undefined);

    // Persistence succeeds and advances the winner to the next round.
    prisma.tournamentMatch.update.mockResolvedValue({ id: 'm1' });
    prisma.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      roundId: 'r1',
      round: { roundNumber: 1 },
    });
    prisma.tournamentRound.findFirst.mockResolvedValue({
      matches: [{ id: 'm2', player1Id: null, player2Id: null }],
    });
  });

  it('invokes emitMatchComplete + emitLeaderboardUpdate after the write commits', async () => {
    const persistCallOrder: string[] = [];
    prisma.tournamentMatch.update.mockImplementation(async () => {
      persistCallOrder.push('persist');
      return { id: 'm1' };
    });
    mockEmitMatchComplete.mockImplementation(async () => {
      persistCallOrder.push('emitMatchComplete');
    });
    mockEmitLeaderboardUpdate.mockImplementation(async () => {
      persistCallOrder.push('emitLeaderboardUpdate');
    });

    await tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1');

    expect(mockEmitMatchComplete).toHaveBeenCalledWith('t1', 'm1');
    expect(mockEmitLeaderboardUpdate).toHaveBeenCalledWith('t1');
    // Persist must happen first (the story forbids emitting unpersisted state).
    expect(persistCallOrder[0]).toBe('persist');
    expect(persistCallOrder).toContain('emitMatchComplete');
    expect(persistCallOrder).toContain('emitLeaderboardUpdate');
  });

  it('never lets a real-time failure break the business path', async () => {
    mockEmitMatchComplete.mockRejectedValue(new Error('socket down'));

    await expect(
      tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1')
    ).resolves.toBeUndefined();

    // The write still happened.
    expect(prisma.tournamentMatch.update).toHaveBeenCalled();
  });

  it('does not emit when the persistence step throws', async () => {
    prisma.tournamentMatch.update.mockRejectedValue(new Error('write failed'));

    await expect(
      tournamentBracketService.updateMatchResult('t1', 'm1', 'winner-1')
    ).rejects.toThrow('Failed to update match result');

    expect(mockEmitMatchComplete).not.toHaveBeenCalled();
    expect(mockEmitLeaderboardUpdate).not.toHaveBeenCalled();
  });
});
