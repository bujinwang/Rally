import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';
import { requireOrganizer } from '../middleware/permissions';
import { createRateLimiters } from '../middleware/rateLimit';
import { updatePlayerMatchStatistics } from '../utils/statisticsService';
import { AuditLogger } from '../utils/auditLogger';

const router = Router();
const rateLimiters = createRateLimiters();

// Validation middleware
const scoreValidation = [
  param('shareCode').isLength({ min: 1 }).withMessage('Share code is required'),
  param('matchId').isLength({ min: 1 }).withMessage('Match ID is required'),
  body('team1Score').isInt({ min: 0, max: 2 }).withMessage('Team 1 score must be 0, 1, or 2'),
  body('team2Score').isInt({ min: 0, max: 2 }).withMessage('Team 2 score must be 0, 1, or 2'),
  body('recordedBy').isLength({ min: 1 }).withMessage('Recorder is required')
];

/**
 * Record match score (2-0 or 2-1 format)
 * POST /:shareCode/matches/:matchId/score
 */
router.post(
  '/:shareCode/matches/:matchId/score',
  rateLimiters.api,
  requireOrganizer('modify_pairings'),
  scoreValidation,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array()
          },
          timestamp: new Date().toISOString()
        });
      }

      const { shareCode, matchId } = req.params;
      const { team1Score, team2Score, recordedBy, deviceId } = req.body;

      // Find session
      const session = await prisma.mvpSession.findUnique({
        where: { shareCode }
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Validate score format (must be 2-0 or 2-1)
      const totalScore = team1Score + team2Score;
      if (totalScore !== 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SCORE',
            message: 'Invalid match score. Must be 2-0 or 2-1 (best of 3)'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Find match
      const match = await prisma.mvpMatch.findUnique({
        where: { id: matchId },
        include: {
          games: true
        }
      });

      if (!match) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MATCH_NOT_FOUND',
            message: 'Match not found'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (match.sessionId !== session.id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MATCH_SESSION_MISMATCH',
            message: 'Match does not belong to this session'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Determine winner
      const winnerTeam = team1Score > team2Score ? 1 : 2;
      const scoreType = `${Math.max(team1Score, team2Score)}-${Math.min(team1Score, team2Score)}`;

      // Update match with final score
      const updatedMatch = await prisma.mvpMatch.update({
        where: { id: matchId },
        data: {
          team1GamesWon: team1Score,
          team2GamesWon: team2Score,
          winnerTeam,
          status: 'COMPLETED',
          endTime: new Date()
        }
      });

      // Update player statistics
      await updatePlayerMatchStatistics(session.id, {
        team1Player1: match.team1Player1,
        team1Player2: match.team1Player2,
        team2Player1: match.team2Player1,
        team2Player2: match.team2Player2,
        winnerTeam
      });

      // Audit log
      await AuditLogger.logAction({
        action: 'SCORE_RECORDED',
        actorId: deviceId || recordedBy,
        actorName: recordedBy,
        targetId: matchId,
        targetType: 'match',
        sessionId: session.id,
        metadata: {
          team1Score,
          team2Score,
          scoreType,
          winnerTeam
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // Emit real-time update
      try {
        const { io } = await import('../server');
        io.to(`session-${shareCode}`).emit('score_recorded', {
          matchId,
          team1Score,
          team2Score,
          winnerTeam,
          scoreType,
          recordedAt: new Date().toISOString()
        });
        console.log(`📡 Socket.IO: Score recorded for match ${matchId}`);
      } catch (error) {
        console.warn('Failed to emit score update:', error);
      }

      res.json({
        success: true,
        data: {
          match: {
            id: updatedMatch.id,
            matchNumber: updatedMatch.matchNumber,
            team1GamesWon: updatedMatch.team1GamesWon,
            team2GamesWon: updatedMatch.team2GamesWon,
            winnerTeam: updatedMatch.winnerTeam,
            scoreType,
            status: updatedMatch.status
          }
        },
        message: `Score recorded: ${scoreType}`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Record score error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to record score'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * Get match score history for a session
 * GET /:shareCode/scores
 */
router.get('/:shareCode/scores', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        matches: {
          where: {
            status: 'COMPLETED'
          },
          orderBy: {
            endTime: 'desc'
          },
          take: parseInt(limit as string),
          skip: parseInt(offset as string)
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const scores = session.matches.map(match => ({
      matchId: match.id,
      matchNumber: match.matchNumber,
      team1: {
        player1: match.team1Player1,
        player2: match.team1Player2,
        gamesWon: match.team1GamesWon
      },
      team2: {
        player1: match.team2Player1,
        player2: match.team2Player2,
        gamesWon: match.team2GamesWon
      },
      winnerTeam: match.winnerTeam,
      scoreType: `${match.team1GamesWon}-${match.team2GamesWon}`,
      completedAt: match.endTime,
      duration: match.duration
    }));

    res.json({
      success: true,
      data: {
        scores,
        total: scores.length
      },
      message: `Retrieved ${scores.length} completed match(es)`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get scores error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve scores'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get player statistics for a session
 * GET /:shareCode/statistics/:playerName
 */
router.get('/:shareCode/statistics/:playerName', async (req: Request, res: Response) => {
  try {
    const { shareCode, playerName } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const player = await prisma.mvpPlayer.findFirst({
      where: {
        sessionId: session.id,
        name: playerName
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found in this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Calculate statistics
    const stats = {
      name: player.name,
      gamesPlayed: player.gamesPlayed,
      wins: player.wins,
      losses: player.losses,
      winRate: player.winRate,
      matchesPlayed: player.matchesPlayed,
      matchWins: player.matchWins,
      matchLosses: player.matchLosses,
      matchWinRate: player.matchWinRate,
      totalSetsWon: player.totalSetsWon,
      totalSetsLost: player.totalSetsLost,
      totalPlayTime: player.totalPlayTime,
      averageGameDuration: player.averageGameDuration,
      partnershipStats: player.partnershipStats || {}
    };

    res.json({
      success: true,
      data: {
        player: stats
      },
      message: 'Player statistics retrieved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get player statistics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve player statistics'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get session leaderboard
 * GET /:shareCode/leaderboard
 */
router.get('/:shareCode/leaderboard', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { sortBy = 'winRate', limit = 20 } = req.query;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          where: {
            gamesPlayed: { gt: 0 } // Only include players who have played
          },
          orderBy: sortBy === 'matchWinRate' 
            ? { matchWinRate: 'desc' }
            : sortBy === 'wins'
            ? { wins: 'desc' }
            : { winRate: 'desc' },
          take: parseInt(limit as string)
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const leaderboard = session.players.map((player, index) => ({
      rank: index + 1,
      name: player.name,
      gamesPlayed: player.gamesPlayed,
      wins: player.wins,
      losses: player.losses,
      winRate: player.winRate,
      matchesPlayed: player.matchesPlayed,
      matchWins: player.matchWins,
      matchLosses: player.matchLosses,
      matchWinRate: player.matchWinRate,
      totalSetsWon: player.totalSetsWon,
      totalSetsLost: player.totalSetsLost
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        sessionName: session.name,
        totalPlayers: leaderboard.length,
        sortedBy: sortBy
      },
      message: `Leaderboard retrieved (${leaderboard.length} players)`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve leaderboard'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Export leaderboard to CSV
 * GET /:shareCode/leaderboard/export
 */
router.get('/:shareCode/leaderboard/export', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { sortBy = 'winRate' } = req.query;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          where: {
            gamesPlayed: { gt: 0 }
          },
          orderBy: sortBy === 'matchWinRate' 
            ? { matchWinRate: 'desc' }
            : sortBy === 'wins'
            ? { wins: 'desc' }
            : { winRate: 'desc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Build CSV content
    const csvHeaders = [
      'Rank',
      'Player Name',
      'Games Played',
      'Wins',
      'Losses',
      'Game Win %',
      'Matches Played',
      'Match Wins',
      'Match Losses',
      'Match Win %',
      'Total Sets Won',
      'Total Sets Lost',
      'Sets Differential',
      'Total Play Time (min)',
      'Avg Game Duration (min)'
    ];

    const csvRows = session.players.map((player, index) => [
      index + 1, // Rank
      player.name,
      player.gamesPlayed,
      player.wins,
      player.losses,
      (player.winRate * 100).toFixed(1),
      player.matchesPlayed,
      player.matchWins,
      player.matchLosses,
      (player.matchWinRate * 100).toFixed(1),
      player.totalSetsWon,
      player.totalSetsLost,
      player.totalSetsWon - player.totalSetsLost,
      player.totalPlayTime,
      player.averageGameDuration.toFixed(1)
    ]);

    // Convert to CSV format
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Add session metadata as header
    const csvWithMetadata = [
      `# ${session.name} - Leaderboard Export`,
      `# Generated: ${new Date().toISOString()}`,
      `# Total Players: ${session.players.length}`,
      `# Sorted By: ${sortBy}`,
      '',
      csvContent
    ].join('\n');

    // Set headers for file download
    const filename = `leaderboard-${session.shareCode}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvWithMetadata);

  } catch (error) {
    console.error('Export leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to export leaderboard'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Export score history to CSV
 * GET /:shareCode/scores/export
 */
router.get('/:shareCode/scores/export', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        matches: {
          where: {
            status: 'COMPLETED'
          },
          orderBy: {
            endTime: 'desc'
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Build CSV content
    const csvHeaders = [
      'Match #',
      'Team 1 Player 1',
      'Team 1 Player 2',
      'Team 1 Score',
      'Team 2 Player 1',
      'Team 2 Player 2',
      'Team 2 Score',
      'Winner',
      'Score Type',
      'Duration (min)',
      'Completed At'
    ];

    const csvRows = session.matches.map(match => [
      match.matchNumber,
      match.team1Player1,
      match.team1Player2,
      match.team1GamesWon,
      match.team2Player1,
      match.team2Player2,
      match.team2GamesWon,
      match.winnerTeam === 1 ? 'Team 1' : 'Team 2',
      `${match.team1GamesWon}-${match.team2GamesWon}`,
      match.duration || 'N/A',
      match.endTime?.toISOString() || 'N/A'
    ]);

    // Convert to CSV format
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Add session metadata
    const csvWithMetadata = [
      `# ${session.name} - Score History Export`,
      `# Generated: ${new Date().toISOString()}`,
      `# Total Matches: ${session.matches.length}`,
      '',
      csvContent
    ].join('\n');

    // Set headers for file download
    const filename = `scores-${session.shareCode}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvWithMetadata);

  } catch (error) {
    console.error('Export scores error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to export scores'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
