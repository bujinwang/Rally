import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuditLogger } from '../utils/auditLogger';

// Permission matrix defining what each role can do
export const PERMISSION_MATRIX = {
  ORGANIZER: {
    canEditSession: true,
    canDeleteSession: true,
    canManagePlayers: true,
    canRemovePlayers: true,
    canAddPlayers: true,
    canUpdatePlayerStatus: true,
    canGeneratePairings: true,
    canModifyPairings: true,
  },
  PLAYER: {
    canEditSession: false,
    canDeleteSession: false,
    canManagePlayers: false,
    canRemovePlayers: false,
    canAddPlayers: false,
    canUpdatePlayerStatus: true, // Players can update their own status
    canGeneratePairings: false,
    canModifyPairings: false,
  }
};

// Types for permission checking
export type PlayerRole = 'ORGANIZER' | 'PLAYER';
export type PermissionAction =
  | 'edit_session'
  | 'delete_session'
  | 'manage_players'
  | 'remove_players'
  | 'add_players'
  | 'update_player_status'
  | 'generate_pairings'
  | 'modify_pairings';

// Permission error response
export const createPermissionError = (requiredRole: PlayerRole, userRole: PlayerRole, action: PermissionAction) => ({
  error: 'Insufficient permissions',
  requiredRole,
  userRole,
  operation: action,
  message: `Only ${requiredRole} can perform this action`
});

// Check if a role has permission for an action
export const hasPermission = (role: PlayerRole, action: PermissionAction): boolean => {
  // Convert snake_case action to PascalCase permission key
  // e.g. "generate_pairings" → "canGeneratePairings"
  const pascalParts = action.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1));
  const permissionKey = `can${pascalParts.join('')}` as keyof typeof PERMISSION_MATRIX.ORGANIZER;
  return PERMISSION_MATRIX[role][permissionKey] as boolean;
};

// Middleware to authorize the session organizer identified by device, keyed on
// a :sessionId route param. Falls back to an authenticated OWNER/ORGANIZER user.
export const requireSessionOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const deviceId =
      req.body?.deviceId ||
      (req.headers?.['x-device-id'] as string);

    // ownerDeviceId is no longer accepted from query params for security
    // It should only be sent in the request body

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_SESSION_ID', message: 'Session id is required' },
        timestamp: new Date().toISOString()
      });
    }

    const session = await prisma.mvpSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        timestamp: new Date().toISOString()
      });
    }

    const requesterDevice = deviceId;
    if (requesterDevice && session.ownerDeviceId === requesterDevice) {
      return next();
    }

    const role = (req as Request & { user?: { role?: string } }).user?.role;
    if (role === 'OWNER' || role === 'ORGANIZER') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only the session organizer can modify its configuration' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('requireSessionOwner error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to authorize organizer' },
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware to check if user has required role for a session
export const requireRole = (requiredRole: PlayerRole, action: PermissionAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shareCode } = req.params;
      // Device identity can arrive in the body (POST/PUT) only; query params
      // are no longer accepted for device identity security.
      const deviceId =
        req.body?.deviceId ||
        (req.headers?.['x-device-id'] as string);

      // ownerDeviceId is no longer accepted from query params for security
      // const ownerDeviceId = ... (removed)

      // Without any device identity the player lookup would match every player
      // in the session (Prisma drops undefined filters), so reject instead.
      if (!deviceId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'MISSING_DEVICE_ID',
            message: 'Device identifier is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!shareCode) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SHARE_CODE',
            message: 'Share code is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Find the session
      const session = await prisma.mvpSession.findUnique({
        where: { shareCode },
        include: {
          players: {
            where: {
              deviceId: deviceId
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

      // Find the player making the request
      const player = session.players[0];
      if (!player) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAYER_NOT_FOUND',
            message: 'Player not found in session'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Check if player has required role
      if (player.role !== requiredRole) {
        return res.status(403).json({
          success: false,
          error: createPermissionError(requiredRole, player.role, action),
          timestamp: new Date().toISOString()
        });
      }

      // Check specific permission
      if (!hasPermission(player.role, action)) {
        return res.status(403).json({
          success: false,
          error: createPermissionError(requiredRole, player.role, action),
          timestamp: new Date().toISOString()
        });
      }

      // Add player and session info to request for use in route handlers
      (req as any).player = player;
      (req as any).session = session;

      // Log permission check for audit trail (organizer actions only)
      if (requiredRole === 'ORGANIZER') {
        AuditLogger.logAction({
          action: `PERMISSION_CHECK_${action.toUpperCase()}`,
          actorId: player.id,
          actorName: player.name,
          sessionId: session.id,
          metadata: { action, granted: true },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        });
      }

      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Permission check failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  };
};

// Middleware to check if user is session organizer
export const requireOrganizer = (action: PermissionAction) => {
  return requireRole('ORGANIZER', action);
};

// Middleware to allow organizer or self for player status updates
export const requireOrganizerOrSelf = (action: PermissionAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shareCode, playerId } = req.params;
      const { deviceId } = req.body;

      if (!shareCode) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SHARE_CODE',
            message: 'Share code is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Find the session and target player
      const session = await prisma.mvpSession.findUnique({
        where: { shareCode },
        include: {
          players: true
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

      // Find the requesting player
      const requestingPlayer = session.players.find(p => p.deviceId === deviceId);
      const targetPlayer = session.players.find(p => p.id === playerId);

      if (!requestingPlayer) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REQUESTING_PLAYER_NOT_FOUND',
            message: 'Requesting player not found in session'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!targetPlayer) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TARGET_PLAYER_NOT_FOUND',
            message: 'Target player not found in session'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Allow if requesting player is organizer OR if they're updating their own status
      const isOrganizer = requestingPlayer.role === 'ORGANIZER';
      const isSelfUpdate = requestingPlayer.id === targetPlayer.id;

      if (!isOrganizer && !isSelfUpdate) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only organizer or player themselves can update status'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Add player and session info to request
      (req as any).requestingPlayer = requestingPlayer;
      (req as any).targetPlayer = targetPlayer;
      (req as any).session = session;

      next();
    } catch (error) {
      console.error('Organizer or self middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Permission check failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  };
};