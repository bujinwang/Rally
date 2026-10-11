import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuditLogger } from '../utils/auditLogger';
import { deviceTokenService } from '../services/deviceTokenService';

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

/**
 * Story 6.1 (design D2) — single place that defines identity precedence.
 * A verified JWT wins over a device token; a device token wins over a
 * client-asserted raw id; the raw-id path is a transitional fallback only.
 */
export type IdentitySource = 'jwt' | 'device' | 'device-legacy' | 'anonymous';

export interface ResolvedIdentity {
  userId?: string;
  deviceId?: string;
  role?: PlayerRole;
  source: IdentitySource;
}

/**
 * Raised when an `x-device-token` header is present but does not verify
 * (unknown / expired / revoked). A present-but-invalid credential is a HARD
 * denial — never a silent downgrade to a raw `deviceId` or to anonymous
 * (design §3.1, mirroring `optionalAuth` rule 3, `middleware/auth.ts:82-89`).
 *
 * Callers that can write an HTTP response map this to a 401. In production the
 * global `deviceTokenGuard` rejects the request first, so handlers never see it.
 */
export class InvalidDeviceTokenError extends Error {
  constructor() {
    super('Invalid or expired device token');
    this.name = 'InvalidDeviceTokenError';
  }
}

/**
 * Counts how often the Phase-1 legacy raw-id path (`source: 'device-legacy'`)
 * was used. This branch exists ONLY so the migration window can be measured and
 * is deleted in Phase 3; until then this counter — together with the
 * `[device-legacy]` log line emitted on every use — is how adoption is observed.
 */
export const deviceIdentityMetrics = { deviceLegacyResolutions: 0 };

/** Stable, greppable marker for the Phase-1 legacy-identity log line. */
export const DEVICE_LEGACY_LOG_PREFIX = '[device-legacy]';

/**
 * Resolve the caller's identity (design §3.1). Async because the device-token
 * branch performs a DB lookup.
 *
 * Precedence — exactly:
 *   1. Valid JWT (`Authorization: Bearer`)   → { source: 'jwt', userId, deviceId? }
 *   2. Valid device token (`x-device-token`) → { source: 'device', deviceId }  // deviceId FROM the token
 *   3. [Phase 1–2 only] raw body.deviceId ‖ x-device-id → { source: 'device-legacy', deviceId }  // logged
 *   4. otherwise                             → { source: 'anonymous' }
 *
 * 🔴 When a device token is present the body/header/query `deviceId` is ignored
 *    ENTIRELY — the authoritative `deviceId` is the token's.
 * 🔴 A present-but-invalid token throws `InvalidDeviceTokenError` (→ 401).
 */
export async function resolveIdentity(req: Request): Promise<ResolvedIdentity> {
  const user = (req as Request & { user?: { id?: string } }).user;

  // Verified device identity, populated once by `deviceTokenGuard`. Kept on the
  // request so the token is not re-verified by every resolver call.
  const preVerified = (req as Request & { deviceIdentity?: { deviceId?: string } })
    .deviceIdentity;

  const rawDeviceId =
    (req.body?.deviceId as string | undefined) ||
    (req.headers?.['x-device-id'] as string | undefined) ||
    undefined;

  const headerToken = req.headers?.['x-device-token'];
  const rawToken = typeof headerToken === 'string' && headerToken.length > 0 ? headerToken : undefined;

  let tokenDeviceId = preVerified?.deviceId;
  if (!tokenDeviceId && rawToken) {
    // Self-contained fallback: the guard did not run (e.g. a direct unit call).
    // A present-but-invalid token is a hard denial, never a silent downgrade.
    const verified = await deviceTokenService.verifyDeviceToken(rawToken);
    if (!verified) throw new InvalidDeviceTokenError();
    tokenDeviceId = verified.deviceId;
  }

  // Branch 1 — a verified JWT wins for `source`. When a device token is also
  // present its (token-derived) deviceId is carried; otherwise the raw id.
  if (user?.id) {
    return { userId: user.id, deviceId: tokenDeviceId ?? rawDeviceId, source: 'jwt' };
  }

  // Branch 2 — verified device token. `deviceId` comes FROM the token.
  if (tokenDeviceId) {
    return { deviceId: tokenDeviceId, source: 'device' };
  }

  // Branch 3 — [Phase 1–2 only] legacy client-asserted raw id. Observable via
  // the counter + log line; deleted in Phase 3.
  if (rawDeviceId) {
    deviceIdentityMetrics.deviceLegacyResolutions += 1;
    console.warn(
      `${DEVICE_LEGACY_LOG_PREFIX} raw deviceId accepted for ${req.method} ${
        req.originalUrl ?? req.url
      }`
    );
    return { deviceId: rawDeviceId, source: 'device-legacy' };
  }

  // Branch 4.
  return { source: 'anonymous' };
}

/** Standard 401 envelope for an invalid device token. */
const respondInvalidDeviceToken = (res: Response): Response =>
  res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Invalid or expired device token' },
    timestamp: new Date().toISOString(),
  });

// Middleware to authorize the session organizer identified by device, keyed on
// a :sessionId route param. Falls back to an authenticated OWNER/ORGANIZER user.
export const requireSessionOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const identity = await resolveIdentity(req);
    const deviceId = identity.deviceId;

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

    // JWT (user) identity wins: the session's owning account is authoritative.
    if (identity.userId && session.ownerUserId === identity.userId) {
      return next();
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
    if (error instanceof InvalidDeviceTokenError) {
      return respondInvalidDeviceToken(res);
    }
    console.error('requireSessionOwner error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to authorize organizer' },
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware to check if user has required role for a session.
// Signatures are unchanged so the ~20 existing call sites need no edits; the
// guard is user-aware internally (JWT wins over deviceId).
export const requireRole = (requiredRole: PlayerRole, action: PermissionAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { shareCode } = req.params;
      const identity = await resolveIdentity(req);
      const deviceId = identity.deviceId;

      const deny = (code: string, message: string, status: number) =>
        res.status(status).json({
          success: false,
          error: { code, message },
          timestamp: new Date().toISOString()
        });

      if (identity.source === 'jwt') {
        if (!shareCode) {
          return deny('MISSING_SHARE_CODE', 'Share code is required', 400);
        }

        const session = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: { players: true }
        });

        if (!session) {
          return deny('SESSION_NOT_FOUND', 'Session not found', 404);
        }

        const isUserOwner = !!identity.userId && session.ownerUserId === identity.userId;
        const player =
          session.players.find(p => p.userId && p.userId === identity.userId) ||
          (deviceId ? session.players.find(p => p.deviceId === deviceId) : undefined);

        if (!player && !isUserOwner) {
          return deny('PLAYER_NOT_FOUND', 'Player not found in session', 404);
        }

        // The owning account acts as ORGANIZER even without a player row.
        const actingRole: PlayerRole = player ? (player.role as PlayerRole) : 'ORGANIZER';

        if (actingRole !== requiredRole) {
          return res.status(403).json({
            success: false,
            error: createPermissionError(requiredRole, actingRole, action),
            timestamp: new Date().toISOString()
          });
        }

        if (!hasPermission(actingRole, action)) {
          return res.status(403).json({
            success: false,
            error: createPermissionError(requiredRole, actingRole, action),
            timestamp: new Date().toISOString()
          });
        }

        (req as any).player = player;
        (req as any).session = session;

        if (requiredRole === 'ORGANIZER') {
          AuditLogger.logAction({
            action: `PERMISSION_CHECK_${action.toUpperCase()}`,
            actorId: player?.id || identity.userId!,
            actorName: player?.name || 'authenticated-user',
            sessionId: session.id,
            metadata: { action, granted: true },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
          });
        }

        return next();
      }

      // ── Device / anonymous path — behaviour preserved verbatim ──
      // Without any device identity the player lookup would match every player
      // in the session (Prisma drops undefined filters), so reject instead.
      if (!deviceId) {
        return deny('MISSING_DEVICE_ID', 'Device identifier is required', 403);
      }

      if (!shareCode) {
        return deny('MISSING_SHARE_CODE', 'Share code is required', 400);
      }

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
        return deny('SESSION_NOT_FOUND', 'Session not found', 404);
      }

      const player = session.players[0];
      if (!player) {
        return deny('PLAYER_NOT_FOUND', 'Player not found in session', 404);
      }

      if (player.role !== requiredRole) {
        return res.status(403).json({
          success: false,
          error: createPermissionError(requiredRole, player.role, action),
          timestamp: new Date().toISOString()
        });
      }

      if (!hasPermission(player.role, action)) {
        return res.status(403).json({
          success: false,
          error: createPermissionError(requiredRole, player.role, action),
          timestamp: new Date().toISOString()
        });
      }

      (req as any).player = player;
      (req as any).session = session;

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
      if (error instanceof InvalidDeviceTokenError) {
        return respondInvalidDeviceToken(res);
      }
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
      const identity = await resolveIdentity(req);

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

      // Find the requesting player — JWT (userId) first, then device fallback.
      const ownerByUser = !!identity.userId && session.ownerUserId === identity.userId;
      const requestingPlayer =
        identity.source === 'jwt'
          ? session.players.find(p => p.userId && p.userId === identity.userId) ||
            (identity.deviceId
              ? session.players.find(p => p.deviceId === identity.deviceId)
              : undefined)
          : session.players.find(p => p.deviceId === identity.deviceId);

      if (!requestingPlayer && !ownerByUser) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REQUESTING_PLAYER_NOT_FOUND',
            message: 'Requesting player not found in session'
          },
          timestamp: new Date().toISOString()
        });
      }

      const targetPlayer = session.players.find(p => p.id === playerId);

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

      // Allow if requesting player is organizer (or the owning account) OR if
      // they're updating their own status.
      const isOrganizer = requestingPlayer?.role === 'ORGANIZER' || ownerByUser;
      const isSelfUpdate = !!requestingPlayer && requestingPlayer.id === targetPlayer.id;

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
      if (error instanceof InvalidDeviceTokenError) {
        return respondInvalidDeviceToken(res);
      }
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