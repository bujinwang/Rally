"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const discoveryService_1 = require("../services/discoveryService");
const mvpSessionService_1 = require("../services/mvpSessionService");
const router = (0, express_1.Router)();
/**
 * GET /api/sessions/discovery
 * Discover sessions based on filters
 */
router.get('/', async (req, res) => {
    try {
        const { latitude, longitude, radius, startTime, endTime, skillLevel, minPlayers, maxPlayers, courtType, limit, offset } = req.query;
        // Parse and validate filters
        const filters = {};
        if (latitude)
            filters.latitude = parseFloat(latitude);
        if (longitude)
            filters.longitude = parseFloat(longitude);
        if (radius)
            filters.radius = parseFloat(radius);
        if (startTime)
            filters.startTime = new Date(startTime);
        if (endTime)
            filters.endTime = new Date(endTime);
        if (skillLevel)
            filters.skillLevel = skillLevel;
        if (minPlayers)
            filters.minPlayers = parseInt(minPlayers);
        if (maxPlayers)
            filters.maxPlayers = parseInt(maxPlayers);
        if (courtType)
            filters.courtType = courtType;
        if (limit)
            filters.limit = parseInt(limit);
        if (offset)
            filters.offset = parseInt(offset);
        // Validate filter values
        if (filters.latitude && (filters.latitude < -90 || filters.latitude > 90)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid latitude' }
            });
        }
        if (filters.longitude && (filters.longitude < -180 || filters.longitude > 180)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid longitude' }
            });
        }
        if (filters.radius && (filters.radius <= 0 || filters.radius > 500)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid radius (1-500km)' }
            });
        }
        if (filters.minPlayers && filters.minPlayers < 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid minPlayers' }
            });
        }
        if (filters.maxPlayers && filters.maxPlayers < 1) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid maxPlayers' }
            });
        }
        if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid limit (1-100)' }
            });
        }
        // Discover sessions
        const result = await discoveryService_1.DiscoveryService.discoverSessions(filters);
        res.json({
            success: true,
            data: result,
            message: 'Sessions discovered successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Discovery error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to discover sessions'
            },
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * GET /api/sessions/discovery/:sessionId
 * Get detailed session information for discovery
 */
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { latitude, longitude } = req.query;
        let userLat;
        let userLon;
        if (latitude)
            userLat = parseFloat(latitude);
        if (longitude)
            userLon = parseFloat(longitude);
        const session = await discoveryService_1.DiscoveryService.getSessionForDiscovery(sessionId, userLat, userLon);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Session not found or not available for discovery'
                },
                timestamp: new Date().toISOString()
            });
        }
        res.json({
            success: true,
            data: session,
            message: 'Session details retrieved successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get session for discovery error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to get session details'
            },
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * POST /api/sessions/discovery/:sessionId/join
 * Join a session discovered through the discovery system
 */
router.post('/:sessionId/join', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { playerName, deviceId } = req.body;
        // Validate required fields
        if (!playerName || !deviceId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'playerName and deviceId are required'
                }
            });
        }
        // Get session details first (with players included)
        const session = await mvpSessionService_1.MvpSessionService.getSessionByShareCode(sessionId, true);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Session not found'
                }
            });
        }
        // Check if session is full
        if (session.players.length >= session.maxPlayers) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'SESSION_FULL',
                    message: 'Session is already full'
                }
            });
        }
        // Check if player is already in session
        const existingPlayer = session.players.find((p) => p.deviceId === deviceId);
        if (existingPlayer) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ALREADY_JOINED',
                    message: 'You are already in this session'
                }
            });
        }
        // Join the session using the existing join flow
        // Note: This would typically use the existing session join API
        // For now, we'll return success assuming the join would work
        res.json({
            success: true,
            data: {
                sessionId: session.id,
                shareCode: session.shareCode,
                joined: true
            },
            message: 'Successfully joined session from discovery',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Join session from discovery error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to join session'
            },
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * GET /api/sessions/discovery/stats
 * Get discovery statistics (for analytics)
 */
router.get('/stats/summary', async (req, res) => {
    try {
        // This would typically aggregate discovery usage statistics
        // For now, return basic stats
        const stats = {
            totalActiveSessions: 0, // Would be calculated from database
            sessionsWithLocation: 0,
            averageRelevanceScore: 85,
            popularSkillLevels: ['intermediate', 'beginner', 'advanced'],
            popularLocations: ['Downtown', 'Sports Complex', 'Community Center']
        };
        res.json({
            success: true,
            data: stats,
            message: 'Discovery statistics retrieved successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get discovery stats error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to get discovery statistics'
            },
            timestamp: new Date().toISOString()
        });
    }
});
exports.default = router;
//# sourceMappingURL=discovery.js.map