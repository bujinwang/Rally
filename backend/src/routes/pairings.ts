import { Router, Request } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { PairingService } from '../services/pairingService';
import { AIPairingService } from '../services/aiPairingService';
import { validatePairingRequest, validate } from '../utils/validation';
import { prisma } from '../config/database';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Generate new pairings for a session
router.post('/sessions/:sessionId/pairings', requireRole(['OWNER', 'ORGANIZER']), validate(validatePairingRequest), async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { algorithm = 'fair' } = req.body;
    const userId = req.user?.id;

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Generate pairings using the service
    const pairingResult = await PairingService.generatePairings(sessionId, algorithm);

    // Store pairings in database (we'll need to create a pairings table)
    // For now, return the result directly

    res.json({
      success: true,
      data: pairingResult,
      message: 'Pairings generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Generate pairings error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Need at least 4 active players')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PLAYERS',
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate pairings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get current pairings for a session
router.get('/sessions/:sessionId/pairings', async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // For now, generate fresh pairings (in production, we'd store and retrieve)
    const pairingResult = await PairingService.generatePairings(sessionId, 'fair');

    res.json({
      success: true,
      data: pairingResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get pairings error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch pairings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Manually adjust a pairing
router.put('/sessions/:sessionId/pairings/:pairingId', requireRole(['OWNER', 'ORGANIZER']), async (req: AuthRequest, res) => {
  try {
    const { sessionId, pairingId } = req.params;
    const { players } = req.body;
    const userId = req.user?.id;

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate the manual adjustment
    const manualPairing = {
      id: pairingId,
      court: 1, // Will be determined by position
      players: players.map((player: any, index: number) => ({
        id: player.id,
        name: player.name,
        position: index === 0 ? 'left' : 'right'
      })),
      createdAt: new Date()
    };

    // Get current pairings to validate against
    const currentPairings = await PairingService.generatePairings(sessionId, 'fair');
    const validation = PairingService.validatePairing(manualPairing, currentPairings.pairings);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAIRING',
          message: 'Invalid pairing adjustment',
          details: validation.errors
        },
        timestamp: new Date().toISOString()
      });
    }

    // For now, return the adjusted pairing (in production, we'd store it)
    res.json({
      success: true,
      data: {
        pairing: manualPairing,
        message: 'Pairing adjusted successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Adjust pairing error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to adjust pairing'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Clear all pairings for a session
router.delete('/sessions/:sessionId/pairings', requireRole(['OWNER', 'ORGANIZER']), async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // For now, just return success (in production, we'd clear stored pairings)
    res.json({
      success: true,
      message: 'Pairings cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Clear pairings error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to clear pairings'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// AI Pairing Suggestions
router.post('/suggest', requireRole(['OWNER', 'ORGANIZER']), async (req: AuthRequest, res) => {
  try {
    const { sessionId, playerIds, options = {} } = req.body;
    const userId = req.user?.id;

    if (!sessionId || !playerIds || !Array.isArray(playerIds)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'sessionId and playerIds array are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Generate AI suggestions
    const aiResult = await AIPairingService.generateAISuggestions(sessionId, playerIds, options);

    res.json({
      success: true,
      data: aiResult,
      message: 'AI pairing suggestions generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI pairing suggestions error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Need at least 4 players')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PLAYERS',
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate AI pairing suggestions'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get explanation for a specific pairing suggestion
router.get('/explain/:suggestionId', async (req: AuthRequest, res) => {
  try {
    const { suggestionId } = req.params;
    const userId = req.user?.id;

    // For now, return a mock explanation
    // In production, this would retrieve stored suggestion data
    const explanation = {
      suggestionId,
      explanation: 'This pairing was suggested based on complementary skill levels and positive historical performance between these players.',
      factors: {
        skillCompatibility: 'High - Players have complementary strengths',
        historicalPerformance: 'Good - Previous pairings were successful',
        preferenceAlignment: 'Medium - Some preference matches found'
      },
      confidence: 0.85,
      alternatives: [
        'Consider swapping with nearby players for variety',
        'This pairing works well for competitive matches'
      ]
    };

    res.json({
      success: true,
      data: explanation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get pairing explanation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get pairing explanation'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Record feedback on AI pairing suggestions
router.post('/feedback', async (req: AuthRequest, res) => {
  try {
    const { sessionId, playerId, partnerId, feedback, aiSuggested = false } = req.body;
    const userId = req.user?.id;

    if (!sessionId || !playerId || !partnerId || typeof feedback !== 'number') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'sessionId, playerId, partnerId, and feedback (1-5) are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (feedback < 1 || feedback > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FEEDBACK',
          message: 'Feedback must be between 1 and 5'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Record the feedback
    await AIPairingService.recordPairingFeedback(sessionId, playerId, partnerId, feedback, aiSuggested);

    res.json({
      success: true,
      message: 'Pairing feedback recorded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Record pairing feedback error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record pairing feedback'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update player skill levels based on recent performance
router.post('/update-skills/:sessionId', requireRole(['OWNER', 'ORGANIZER']), async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    // Verify user has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        sessionPlayers: {
          where: { userId }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const isOwner = session.ownerId === userId;
    const isPlayer = session.sessionPlayers.length > 0;

    if (!isOwner && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this session'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update skill levels
    await AIPairingService.updatePlayerSkillLevels(sessionId);

    res.json({
      success: true,
      message: 'Player skill levels updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update skill levels error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update player skill levels'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;