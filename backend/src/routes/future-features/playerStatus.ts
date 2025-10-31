import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';
import { requireOrganizer, requireOrganizerOrSelf } from '../middleware/permissions';

const router = Router();

// Validation middleware
const statusRequestValidation = [
  param('playerId').isLength({ min: 1 }).withMessage('Player ID is required'),
  body('action').isIn(['rest', 'leave']).withMessage('Action must be rest or leave'),
  body('reason').optional().isLength({ max: 255 }).withMessage('Reason must be less than 255 characters')
];

const approvalValidation = [
  param('requestId').isLength({ min: 1 }).withMessage('Request ID is required'),
  body('approved').isBoolean().withMessage('Approved must be a boolean'),
  body('reason').optional().isLength({ max: 255 }).withMessage('Reason must be less than 255 characters')
];

// Request status change (rest or leave)
router.post('/:playerId/status', statusRequestValidation, async (req: Request, res: Response) => {
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

    const { playerId } = req.params;
    const { action, reason, deviceId } = req.body;

    // Find player and session
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      include: { session: true }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if player is currently in an active game
    const activeGames = await prisma.mvpGame.findMany({
      where: {
        sessionId: player.sessionId,
        status: 'IN_PROGRESS',
        OR: [
          { team1Player1: player.name },
          { team1Player2: player.name },
          { team2Player1: player.name },
          { team2Player2: player.name }
        ]
      }
    });

    if (action === 'leave' && activeGames.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PLAYER_IN_ACTIVE_GAME',
          message: 'Cannot leave session while playing in an active game. Please finish the game first.',
          activeGames: activeGames.map(game => ({
            id: game.id,
            gameNumber: game.gameNumber,
            courtName: game.courtName
          }))
        },
        timestamp: new Date().toISOString()
      });
    }

    // Create status change request
    const statusRequest = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: {
        statusRequestedAt: new Date(),
        statusRequestedBy: player.deviceId === deviceId ? 'self' : 'organizer',
        statusChangeReason: reason || null,
        // Store the requested action in a temporary field or use status history
        statusHistory: {
          push: {
            action,
            requestedAt: new Date().toISOString(),
            requestedBy: player.deviceId === deviceId ? 'self' : 'organizer',
            reason: reason || null
          }
        }
      }
    });

    // Emit real-time notification to organizer
    try {
      const { io } = await import('../server');
      io.to(`session-${player.session.shareCode}`).emit('status_request', {
        requestId: `req_${playerId}_${Date.now()}`,
        playerId: playerId,
        playerName: player.name,
        action,
        reason: reason || null,
        requestedAt: new Date().toISOString(),
        requestedBy: player.deviceId === deviceId ? 'self' : 'organizer'
      });
    } catch (error) {
      console.warn('Failed to emit status request notification:', error);
    }

    res.status(201).json({
      success: true,
      data: {
        requestId: `req_${playerId}_${Date.now()}`,
        player: {
          id: player.id,
          name: player.name,
          currentStatus: player.status
        },
        action,
        reason: reason || null,
        requestedAt: new Date().toISOString()
      },
      message: `Status change request submitted. Waiting for organizer approval.`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Status request error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to submit status change request'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Approve or deny status change request
router.put('/approve/:requestId', requireOrganizer('update_player_status'), approvalValidation, async (req: Request, res: Response) => {
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

    const { requestId } = req.params;
    const { approved, reason, ownerDeviceId } = req.body;

    // Parse request ID to get player ID
    const playerId = requestId.split('_')[1];
    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST_ID',
          message: 'Invalid request ID format'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Find player and session
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      include: { session: true }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify ownership
    if (player.session.ownerDeviceId !== ownerDeviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the session organizer can approve status changes'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get the latest status request from history
    const statusHistory = player.statusHistory as any[] || [];
    const latestRequest = statusHistory[statusHistory.length - 1];

    if (!latestRequest) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PENDING_REQUEST',
          message: 'No pending status change request found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const { action } = latestRequest;

    if (approved) {
      // Update player status
      let newStatus: 'ACTIVE' | 'RESTING' | 'LEFT';
      let restExpiresAt: Date | null = null;

      if (action === 'rest') {
        newStatus = 'RESTING';
        restExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      } else if (action === 'leave') {
        newStatus = 'LEFT';
      } else {
        newStatus = 'ACTIVE';
      }

      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: playerId },
        data: {
          status: newStatus,
          restExpiresAt: action === 'rest' ? restExpiresAt : null,
          statusApprovedAt: new Date(),
          statusApprovedBy: player.session.ownerName,
          // Update status history
          statusHistory: {
            push: {
              ...latestRequest,
              approved: true,
              approvedAt: new Date().toISOString(),
              approvedBy: player.session.ownerName,
              approvalReason: reason || null
            }
          }
        }
      });

      // Emit real-time status update
      try {
        const { io } = await import('../server');
        io.to(`session-${player.session.shareCode}`).emit('status_approved', {
          playerId: playerId,
          playerName: player.name,
          newStatus,
          action,
          approvedAt: new Date().toISOString(),
          expiresAt: restExpiresAt?.toISOString(),
          reason: reason || null
        });
      } catch (error) {
        console.warn('Failed to emit status approval notification:', error);
      }

      res.json({
        success: true,
        data: {
          player: {
            id: updatedPlayer.id,
            name: updatedPlayer.name,
            status: updatedPlayer.status,
            restExpiresAt: updatedPlayer.restExpiresAt
          },
          action,
          approved: true,
          approvedAt: new Date().toISOString(),
          expiresAt: restExpiresAt?.toISOString()
        },
        message: `Status change approved. Player is now ${newStatus.toLowerCase()}.`,
        timestamp: new Date().toISOString()
      });

    } else {
      // Deny the request
      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: playerId },
        data: {
          // Clear the request
          statusRequestedAt: null,
          statusRequestedBy: null,
          statusChangeReason: null,
          // Update status history
          statusHistory: {
            push: {
              ...latestRequest,
              approved: false,
              deniedAt: new Date().toISOString(),
              deniedBy: player.session.ownerName,
              denialReason: reason || null
            }
          }
        }
      });

      // Emit real-time denial notification
      try {
        const { io } = await import('../server');
        io.to(`session-${player.session.shareCode}`).emit('status_denied', {
          playerId: playerId,
          playerName: player.name,
          action,
          deniedAt: new Date().toISOString(),
          reason: reason || null
        });
      } catch (error) {
        console.warn('Failed to emit status denial notification:', error);
      }

      res.json({
        success: true,
        data: {
          player: {
            id: updatedPlayer.id,
            name: updatedPlayer.name,
            status: updatedPlayer.status
          },
          action,
          approved: false,
          deniedAt: new Date().toISOString()
        },
        message: `Status change request denied.`,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Status approval error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process status change approval'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get pending status requests for organizer
router.get('/pending/:shareCode', requireOrganizer('update_player_status'), async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          where: {
            statusRequestedAt: { not: null }
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

    const pendingRequests = session.players.map(player => {
      const statusHistory = player.statusHistory as any[] || [];
      const latestRequest = statusHistory[statusHistory.length - 1];

      if (!latestRequest || latestRequest.approved !== undefined) {
        return null; // Skip if no pending request or already processed
      }

      return {
        requestId: `req_${player.id}_${player.statusRequestedAt?.getTime()}`,
        playerId: player.id,
        playerName: player.name,
        action: latestRequest.action,
        reason: latestRequest.reason,
        requestedAt: player.statusRequestedAt?.toISOString(),
        requestedBy: player.statusRequestedBy
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: {
        pendingRequests,
        count: pendingRequests.length
      },
      message: `Found ${pendingRequests.length} pending status change request(s)`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get pending status requests'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Automatic rest expiration handler (to be called by a scheduled job)
router.post('/expire-rest/:playerId', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      include: { session: true }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'Player not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (player.status !== 'RESTING' || !player.restExpiresAt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_RESTING',
          message: 'Player is not currently resting'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check if rest has actually expired
    const now = new Date();
    if (player.restExpiresAt > now) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REST_NOT_EXPIRED',
          message: 'Rest period has not yet expired'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Expire the rest
    const updatedPlayer = await prisma.mvpPlayer.update({
      where: { id: playerId },
      data: {
        status: 'ACTIVE',
        restExpiresAt: null,
        statusHistory: {
          push: {
            action: 'rest_expired',
            expiredAt: new Date().toISOString()
          }
        }
      }
    });

    // Emit real-time update
    try {
      const { io } = await import('../server');
      io.to(`session-${player.session.shareCode}`).emit('status_expired', {
        playerId: playerId,
        playerName: player.name,
        newStatus: 'ACTIVE',
        expiredAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to emit rest expiration notification:', error);
    }

    res.json({
      success: true,
      data: {
        player: {
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          status: updatedPlayer.status
        },
        expiredAt: new Date().toISOString()
      },
      message: 'Rest period expired. Player is now active.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Expire rest error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to expire rest period'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;