import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { rankingService } from '../services/rankingService';

const router = Router();
const prisma = new PrismaClient();

// Enhanced scoring interfaces
interface MatchScoreData {
  player1Id: string;
  player2Id: string;
  sets: Array<{
    setNumber: number;
    player1Score: number;
    player2Score: number;
    winnerId: string;
  }>;
  scoringSystem?: '21_POINT' | '15_POINT' | '11_POINT';
  bestOfGames?: 1 | 3 | 5;
}

interface DetailedMatchResult {
  matchId: string;
  sessionId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  scoreType: string;
  sets: Array<{
    setNumber: number;
    player1Score: number;
    player2Score: number;
    winnerId: string;
  }>;
  totalSetsWon: {
    player1: number;
    player2: number;
  };
  recordedBy: string;
  recordedAt: Date;
}

// POST /api/matches/detailed - Record detailed match with set-by-set scores
router.post('/detailed', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      player1Id,
      player2Id,
      sets,
      scoringSystem = '21_POINT',
      bestOfGames = 3,
      deviceId,
      courtName
    }: MatchScoreData & { sessionId: string; deviceId: string; courtName?: string } = req.body;

    // Validate required fields
    if (!sessionId || !player1Id || !player2Id || !sets || !Array.isArray(sets) || sets.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: sessionId, player1Id, player2Id, sets array'
        }
      });
    }

    // Validate scoring system
    const validScoringSystems = ['21_POINT', '15_POINT', '11_POINT'];
    if (!validScoringSystems.includes(scoringSystem)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid scoring system. Must be 21_POINT, 15_POINT, or 11_POINT'
        }
      });
    }

    // Validate sets data
    for (const set of sets) {
      if (!set.setNumber || typeof set.player1Score !== 'number' || typeof set.player2Score !== 'number' || !set.winnerId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Each set must have setNumber, player1Score, player2Score, and winnerId'
          }
        });
      }

      // Validate winner is one of the players
      if (set.winnerId !== player1Id && set.winnerId !== player2Id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Set winner must be one of the match players'
          }
        });
      }
    }

    // Verify session exists and is active
    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_NOT_ACTIVE',
          message: 'Cannot record matches for inactive sessions'
        }
      });
    }

    // Verify both players are in the session
    const player1InSession = session.players.find(p => p.id === player1Id);
    const player2InSession = session.players.find(p => p.id === player2Id);

    if (!player1InSession || !player2InSession) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_IN_SESSION',
          message: 'Both players must be active participants in the session'
        }
      });
    }

    // Check permission
    const isPlayer1 = deviceId === player1Id;
    const isPlayer2 = deviceId === player2Id;
    const isOrganizer = session.ownerDeviceId === deviceId;

    if (!isPlayer1 && !isPlayer2 && !isOrganizer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'You can only record matches involving yourself or be the session organizer'
        }
      });
    }

    // Calculate match winner and sets won
    const setsWonByPlayer1 = sets.filter(set => set.winnerId === player1Id).length;
    const setsWonByPlayer2 = sets.filter(set => set.winnerId === player2Id).length;
    const matchWinnerId = setsWonByPlayer1 > setsWonByPlayer2 ? player1Id : player2Id;
    const scoreType = `${setsWonByPlayer1}-${setsWonByPlayer2}`;

    // Create detailed match record using MvpMatch for now (will migrate to Match model later)
    const match = await prisma.mvpMatch.create({
      data: {
        sessionId,
        matchNumber: 1, // Will be updated with proper numbering
        team1Player1: player1Id,
        team1Player2: '', // Singles match
        team2Player1: player2Id,
        team2Player2: '', // Singles match
        winnerTeam: matchWinnerId === player1Id ? 1 : 2,
        status: 'COMPLETED' // Auto-approve for detailed matches
      },
      include: {
        session: { select: { id: true, name: true } }
      }
    });

    // Create game record for backward compatibility
    const game = await prisma.mvpGame.create({
      data: {
        sessionId,
        courtName,
        gameNumber: 1, // Simplified for MVP
        team1Player1: player1Id,
        team1Player2: '',
        team2Player1: player2Id,
        team2Player2: '',
        team1FinalScore: setsWonByPlayer1,
        team2FinalScore: setsWonByPlayer2,
        winnerTeam: matchWinnerId === player1Id ? 1 : 2,
        status: 'COMPLETED'
      }
    });

    // Create set records
    for (const setData of sets) {
      await prisma.mvpGameSet.create({
        data: {
          gameId: game.id,
          setNumber: setData.setNumber,
          team1Score: setData.player1Score,
          team2Score: setData.player2Score,
          winnerTeam: setData.winnerId === player1Id ? 1 : 2
        }
      });
    }

    // Update player statistics
    await updatePlayerStatistics(player1Id, matchWinnerId === player1Id);
    await updatePlayerStatistics(player2Id, matchWinnerId === player2Id);

    // Update rankings
    try {
      await rankingService.updateRankingsAfterDetailedMatch(match.id);
    } catch (rankingError) {
      console.error('Error updating rankings after match:', rankingError);
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`session-${sessionId}`).emit('detailed_match_recorded', {
        matchId: match.id,
        sessionId,
        winnerId: matchWinnerId,
        scoreType,
        sets,
        recordedAt: match.createdAt,
        statistics: await getUpdatedStatistics([player1Id, player2Id])
      });
    }

    const result: DetailedMatchResult = {
      matchId: match.id,
      sessionId,
      player1Id,
      player2Id,
      winnerId: matchWinnerId,
      scoreType,
      sets,
      totalSetsWon: {
        player1: setsWonByPlayer1,
        player2: setsWonByPlayer2
      },
      recordedBy: deviceId,
      recordedAt: match.createdAt
    };

    res.status(201).json({
      success: true,
      data: result,
      message: 'Detailed match recorded successfully'
    });

  } catch (error) {
    console.error('Error recording detailed match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record detailed match'
      }
    });
  }
});

// POST /api/matches - Record a match result (legacy endpoint)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, player1Id, player2Id, winnerId, scoreType, deviceId } = req.body;
    const recordedBy = deviceId; // Use deviceId for MVP system

    // Validate required fields
    if (!sessionId || !player1Id || !player2Id || !winnerId || !scoreType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: sessionId, player1Id, player2Id, winnerId, scoreType'
        }
      });
    }

    // Validate score type
    if (!['2-0', '2-1'].includes(scoreType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid score type. Must be "2-0" or "2-1"'
        }
      });
    }

    // Validate winner is one of the players
    if (winnerId !== player1Id && winnerId !== player2Id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Winner must be one of the players in the match'
        }
      });
    }

    // Verify session exists and is active
    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_NOT_ACTIVE',
          message: 'Cannot record matches for inactive sessions'
        }
      });
    }

    // Verify both players are in the session
    const player1InSession = session.players.find(p => p.id === player1Id);
    const player2InSession = session.players.find(p => p.id === player2Id);

    if (!player1InSession || !player2InSession) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_IN_SESSION',
          message: 'Both players must be active participants in the session'
        }
      });
    }

    // Check permission: players can record their own matches, organizers can record any
    const isPlayer1 = recordedBy === player1Id;
    const isPlayer2 = recordedBy === player2Id;
    const isOrganizer = session.ownerDeviceId === deviceId;

    if (!isPlayer1 && !isPlayer2 && !isOrganizer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'You can only record matches involving yourself or be the session organizer'
        }
      });
    }

    // Check if organizer approval is required
    const requiresApproval = !isOrganizer; // Organizer doesn't need approval

    // Create the match record using MvpMatch model
    const match = await prisma.mvpMatch.create({
      data: {
        sessionId,
        matchNumber: 1, // Will be updated with proper numbering
        team1Player1: player1Id,
        team1Player2: '', // Singles match
        team2Player1: player2Id,
        team2Player2: '', // Singles match
        winnerTeam: winnerId === player1Id ? 1 : 2,
        status: requiresApproval ? 'IN_PROGRESS' : 'COMPLETED'
      },
      include: {
        session: { select: { id: true, name: true } }
      }
    });

    // Update player statistics
    await updatePlayerStatistics(player1Id, winnerId === player1Id);
    await updatePlayerStatistics(player2Id, winnerId === player2Id);

    // Update rankings after match
    try {
      await rankingService.updateRankingsAfterDetailedMatch(match.id);
    } catch (rankingError) {
      console.error('Error updating rankings after match:', rankingError);
      // Don't fail the match recording if ranking update fails
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`session-${sessionId}`).emit('match_recorded', {
        matchId: match.id,
        sessionId,
        winnerId,
        scoreType,
        recordedAt: match.createdAt,
        statistics: await getUpdatedStatistics([player1Id, player2Id])
      });
    }

    res.status(201).json({
      success: true,
      data: {
        match,
        requiresApproval,
        message: requiresApproval
          ? 'Match recorded and pending organizer approval'
          : 'Match recorded successfully'
      }
    });

  } catch (error) {
    console.error('Error recording match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record match'
      }
    });
  }
});

// PUT /api/matches/:id/approve - Approve a match (organizer only)
router.put('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deviceId } = req.body;
    const approvedBy = deviceId;

    // Find the match
    const match = await prisma.mvpMatch.findUnique({
      where: { id },
      include: { session: true }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MATCH_NOT_FOUND',
          message: 'Match not found'
        }
      });
    }

    // Check if user is session organizer
    if (match.session.ownerDeviceId !== deviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Only session organizers can approve matches'
        }
      });
    }

    // Check if already approved (status is COMPLETED)
    if (match.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_APPROVED',
          message: 'Match is already approved'
        }
      });
    }

    // Approve the match by setting status to COMPLETED
    const updatedMatch = await prisma.mvpMatch.update({
      where: { id },
      data: {
        status: 'COMPLETED'
      },
      include: {
        session: { select: { id: true, name: true } }
      }
    });

    // Emit real-time update for approval
    const io = req.app.get('io');
    if (io) {
      io.to(`session-${match.sessionId}`).emit('match_approved', {
        matchId: updatedMatch.id,
        sessionId: match.sessionId,
        approvedAt: updatedMatch.updatedAt
      });
    }

    res.json({
      success: true,
      data: {
        match: updatedMatch,
        message: 'Match approved successfully'
      }
    });

  } catch (error) {
    console.error('Error approving match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve match'
      }
    });
  }
});

// GET /api/matches/detailed/:matchId - Get detailed match information
router.get('/detailed/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const { deviceId } = req.query;

    // Get the match with game and set details
    const match = await prisma.mvpMatch.findUnique({
      where: { id: matchId },
      include: {
        session: { select: { id: true, name: true } },
        games: {
          include: {
            sets: true
          }
        }
      }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MATCH_NOT_FOUND',
          message: 'Match not found'
        }
      });
    }

    // Check if user has access to the session
    const session = await prisma.mvpSession.findUnique({
      where: { id: match.sessionId },
      include: { players: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }

    const isParticipant = session.players.some(p => p.deviceId === deviceId);
    const isOrganizer = session.ownerDeviceId === deviceId;

    if (!isParticipant && !isOrganizer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You must be a participant or organizer to view match details'
        }
      });
    }

    // Get player information
    const player1 = await prisma.mvpPlayer.findUnique({
      where: { id: match.team1Player1 },
      select: { id: true, name: true }
    });

    const player2 = await prisma.mvpPlayer.findUnique({
      where: { id: match.team2Player1 },
      select: { id: true, name: true }
    });

    // Transform the data to match our detailed format
    const detailedMatch = {
      id: match.id,
      sessionId: match.sessionId,
      sessionName: match.session.name,
      courtName: match.courtName,
      player1,
      player2,
      winner: match.winnerTeam === 1 ? player1 : player2,
      status: match.status,
      createdAt: match.createdAt,
      games: match.games.map(game => ({
        id: game.id,
        gameNumber: game.gameNumber,
        winnerTeam: game.winnerTeam,
        team1Score: game.team1FinalScore,
        team2Score: game.team2FinalScore,
        sets: game.sets.map(set => ({
          setNumber: set.setNumber,
          team1Score: set.team1Score,
          team2Score: set.team2Score,
          winnerTeam: set.winnerTeam
        }))
      }))
    };

    res.json({
      success: true,
      data: detailedMatch
    });

  } catch (error) {
    console.error('Error fetching detailed match:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch detailed match'
      }
    });
  }
});

// GET /api/matches/session/:sessionId - Get matches for a session
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { deviceId } = req.query;

    // Verify user has access to the session
    const session = await prisma.mvpSession.findUnique({
      where: { id: sessionId },
      include: { players: true }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
    }

    // Check if user is a participant or organizer
    const isParticipant = session.players.some(p => p.deviceId === deviceId);
    const isOrganizer = session.ownerDeviceId === deviceId;

    if (!isParticipant && !isOrganizer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You must be a participant or organizer to view matches'
        }
      });
    }

    // Get matches for the session
    const matches = await prisma.mvpMatch.findMany({
      where: { sessionId },
      include: {
        session: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform matches to include player names
    const transformedMatches = await Promise.all(
      matches.map(async (match) => {
        const player1 = await prisma.mvpPlayer.findUnique({
          where: { id: match.team1Player1 },
          select: { id: true, name: true }
        });
        const player2 = await prisma.mvpPlayer.findUnique({
          where: { id: match.team2Player1 },
          select: { id: true, name: true }
        });
        const winner = match.winnerTeam === 1 ? player1 : player2;

        return {
          id: match.id,
          sessionId: match.sessionId,
          player1,
          player2,
          winner,
          scoreType: match.winnerTeam === 1 ? '2-0' : '2-1', // Simplified for MVP
          recordedAt: match.createdAt,
          status: match.status
        };
      })
    );

    res.json({
      success: true,
      data: {
        matches: transformedMatches,
        total: transformedMatches.length
      }
    });

  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch matches'
      }
    });
  }
});

// Helper function to update player statistics
async function updatePlayerStatistics(playerId: string, isWinner: boolean) {
  const currentStats = await prisma.mvpPlayer.findUnique({
    where: { id: playerId },
    select: {
      matchesPlayed: true,
      wins: true,
      losses: true
    }
  });

  if (!currentStats) return;

  const newMatchesPlayed = currentStats.matchesPlayed + 1;
  const newWins = currentStats.wins + (isWinner ? 1 : 0);
  const newLosses = currentStats.losses + (isWinner ? 0 : 1);
  const newWinRate = newMatchesPlayed > 0 ? (newWins / newMatchesPlayed) * 100 : 0;

  await prisma.mvpPlayer.update({
    where: { id: playerId },
    data: {
      matchesPlayed: newMatchesPlayed,
      wins: newWins,
      losses: newLosses,
      winRate: newWinRate
    }
  });
}

// Helper function to get updated statistics for real-time updates
async function getUpdatedStatistics(playerIds: string[]) {
  const statistics = await prisma.mvpPlayer.findMany({
    where: { id: { in: playerIds } },
    select: {
      id: true,
      matchesPlayed: true,
      wins: true,
      losses: true,
      winRate: true
    }
  });

  return statistics.reduce((acc, stat) => {
    acc[stat.id] = stat;
    return acc;
  }, {} as Record<string, any>);
}

export default router;