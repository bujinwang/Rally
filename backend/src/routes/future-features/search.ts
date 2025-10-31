import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { query, validationResult } from 'express-validator';

const router = Router();

// Validation for search endpoints
const searchValidation = [
  query('q').isLength({ min: 1 }).withMessage('Search query is required'),
  query('type').optional().isIn(['sessions', 'players', 'all']).withMessage('Invalid search type'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('includeCompleted').optional().isBoolean().withMessage('includeCompleted must be boolean')
];

// Advanced search endpoint
router.get('/', searchValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search parameters',
          details: errors.array()
        },
        timestamp: new Date().toISOString()
      });
    }

    const {
      q: searchQuery,
      type = 'all',
      limit = 20,
      includeCompleted = false
    } = req.query;

    const query = (searchQuery as string).toLowerCase();
    const searchLimit = parseInt(limit as string);
    
    let results: any = {
      sessions: [],
      players: [],
      totalResults: 0
    };

    // Search sessions
    if (type === 'sessions' || type === 'all') {
      const sessionWhere: any = {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { location: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { ownerName: { contains: query, mode: 'insensitive' } }
        ]
      };

      // Filter by session status
      if (!includeCompleted) {
        sessionWhere.status = 'ACTIVE';
      }

      const sessions = await prisma.mvpSession.findMany({
        where: sessionWhere,
        include: {
          players: {
            select: {
              name: true,
              gamesPlayed: true,
              wins: true,
              status: true
            }
          },
          games: {
            select: {
              id: true,
              status: true
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // Active sessions first
          { scheduledAt: 'desc' }
        ],
        take: type === 'sessions' ? searchLimit : Math.floor(searchLimit / 2)
      });

      results.sessions = sessions.map(session => ({
        id: session.id,
        name: session.name,
        location: session.location,
        scheduledAt: session.scheduledAt,
        organizer: session.ownerName,
        playerCount: session.players.length,
        maxPlayers: session.maxPlayers,
        status: session.status,
        shareCode: session.shareCode,
        skillLevel: session.skillLevel,
        cost: session.cost,
        description: session.description,
        gamesCount: session.games.length,
        activeGames: session.games.filter(g => g.status === 'IN_PROGRESS').length
      }));
    }

    // Search players across sessions
    if (type === 'players' || type === 'all') {
      const players = await prisma.mvpPlayer.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
          session: includeCompleted ? undefined : { status: 'ACTIVE' }
        },
        include: {
          session: {
            select: {
              id: true,
              name: true,
              scheduledAt: true,
              status: true,
              shareCode: true
            }
          }
        },
        orderBy: [
          { wins: 'desc' },
          { gamesPlayed: 'desc' }
        ],
        take: type === 'players' ? searchLimit : Math.floor(searchLimit / 2)
      });

      // Group players by name and aggregate stats
      const playerMap = new Map();
      players.forEach(player => {
        const key = player.name.toLowerCase();
        if (playerMap.has(key)) {
          const existing = playerMap.get(key);
          existing.totalGames += player.gamesPlayed;
          existing.totalWins += player.wins;
          existing.totalLosses += player.losses;
          existing.sessions.push({
            sessionId: player.session.id,
            sessionName: player.session.name,
            sessionDate: player.session.scheduledAt,
            sessionStatus: player.session.status,
            shareCode: player.session.shareCode,
            gamesInSession: player.gamesPlayed,
            winsInSession: player.wins
          });
        } else {
          playerMap.set(key, {
            name: player.name,
            totalGames: player.gamesPlayed,
            totalWins: player.wins,
            totalLosses: player.losses,
            winRate: player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0,
            sessionCount: 1,
            lastActive: player.session.scheduledAt,
            sessions: [{
              sessionId: player.session.id,
              sessionName: player.session.name,
              sessionDate: player.session.scheduledAt,
              sessionStatus: player.session.status,
              shareCode: player.session.shareCode,
              gamesInSession: player.gamesPlayed,
              winsInSession: player.wins
            }]
          });
        }
      });

      results.players = Array.from(playerMap.values()).map(player => ({
        ...player,
        winRate: player.totalGames > 0 ? Math.round((player.totalWins / player.totalGames) * 100) : 0,
        sessionCount: player.sessions.length
      }));
    }

    results.totalResults = results.sessions.length + results.players.length;

    // Add search suggestions if no results
    let suggestions: string[] = [];
    if (results.totalResults === 0) {
      // Get recent active sessions for suggestions
      const recentSessions = await prisma.mvpSession.findMany({
        where: { status: 'ACTIVE' },
        select: { name: true, location: true },
        orderBy: { scheduledAt: 'desc' },
        take: 3
      });

      suggestions = [
        ...recentSessions.map(s => s.name),
        ...recentSessions.map(s => s.location).filter((loc): loc is string => Boolean(loc))
      ];
    }

    res.json({
      success: true,
      data: {
        query: searchQuery,
        type,
        results,
        suggestions: suggestions.slice(0, 5) // Limit suggestions
      },
      message: `Found ${results.totalResults} result(s) for "${searchQuery}"`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Search operation failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get search suggestions based on partial query
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || (q as string).length < 2) {
      return res.json({
        success: true,
        data: { suggestions: [] },
        message: 'Query too short for suggestions',
        timestamp: new Date().toISOString()
      });
    }

    const query = (q as string).toLowerCase();
    
    // Get session name suggestions
    const sessionSuggestions = await prisma.mvpSession.findMany({
      where: {
        OR: [
          { name: { startsWith: query, mode: 'insensitive' } },
          { location: { startsWith: query, mode: 'insensitive' } }
        ],
        status: 'ACTIVE'
      },
      select: { name: true, location: true },
      take: 5
    });

    // Get player name suggestions
    const playerSuggestions = await prisma.mvpPlayer.findMany({
      where: {
        name: { startsWith: query, mode: 'insensitive' },
        session: { status: 'ACTIVE' }
      },
      select: { name: true },
      distinct: ['name'],
      take: 5
    });

    const suggestions = [
      ...sessionSuggestions.map(s => ({ text: s.name, type: 'session' })),
      ...sessionSuggestions.map(s => s.location ? ({ text: s.location, type: 'location' }) : null).filter(Boolean),
      ...playerSuggestions.map(p => ({ text: p.name, type: 'player' }))
    ].slice(0, 8);

    res.json({
      success: true,
      data: { suggestions },
      message: 'Search suggestions retrieved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get suggestions'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;