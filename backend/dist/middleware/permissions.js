"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOrganizerOrSelf = exports.requireOrganizer = exports.requireRole = exports.hasPermission = exports.createPermissionError = exports.PERMISSION_MATRIX = void 0;
const database_1 = require("../config/database");
// Permission matrix defining what each role can do
exports.PERMISSION_MATRIX = {
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
// Permission error response
const createPermissionError = (requiredRole, userRole, action) => ({
    error: 'Insufficient permissions',
    requiredRole,
    userRole,
    operation: action,
    message: `Only ${requiredRole} can perform this action`
});
exports.createPermissionError = createPermissionError;
// Check if a role has permission for an action
const hasPermission = (role, action) => {
    const permissionKey = `can${action.charAt(0).toUpperCase()}${action.slice(1).replace(/_/g, '')}`;
    return exports.PERMISSION_MATRIX[role][permissionKey];
};
exports.hasPermission = hasPermission;
// Middleware to check if user has required role for a session
const requireRole = (requiredRole, action) => {
    return async (req, res, next) => {
        try {
            const { shareCode } = req.params;
            const { deviceId, ownerDeviceId } = req.body;
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
            const session = await database_1.prisma.mvpSession.findUnique({
                where: { shareCode },
                include: {
                    players: {
                        where: {
                            deviceId: deviceId || ownerDeviceId
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
                    error: (0, exports.createPermissionError)(requiredRole, player.role, action),
                    timestamp: new Date().toISOString()
                });
            }
            // Check specific permission
            if (!(0, exports.hasPermission)(player.role, action)) {
                return res.status(403).json({
                    success: false,
                    error: (0, exports.createPermissionError)(requiredRole, player.role, action),
                    timestamp: new Date().toISOString()
                });
            }
            // Add player and session info to request for use in route handlers
            req.player = player;
            req.session = session;
            next();
        }
        catch (error) {
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
exports.requireRole = requireRole;
// Middleware to check if user is session organizer
const requireOrganizer = (action) => {
    return (0, exports.requireRole)('ORGANIZER', action);
};
exports.requireOrganizer = requireOrganizer;
// Middleware to allow organizer or self for player status updates
const requireOrganizerOrSelf = (action) => {
    return async (req, res, next) => {
        try {
            const { shareCode, playerId } = req.params;
            const { deviceId, ownerDeviceId } = req.body;
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
            const session = await database_1.prisma.mvpSession.findUnique({
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
            const requestingPlayer = session.players.find(p => p.deviceId === deviceId || p.deviceId === ownerDeviceId);
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
            req.requestingPlayer = requestingPlayer;
            req.targetPlayer = targetPlayer;
            req.session = session;
            next();
        }
        catch (error) {
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
exports.requireOrganizerOrSelf = requireOrganizerOrSelf;
//# sourceMappingURL=permissions.js.map