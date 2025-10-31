"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sharingService_1 = require("../services/sharingService");
const validation_1 = require("../utils/validation");
const privacyMiddleware_1 = require("../utils/privacyMiddleware");
const joi_1 = __importDefault(require("joi"));
const router = (0, express_1.Router)();
// Validation schemas
const shareEntitySchema = joi_1.default.object({
    type: joi_1.default.string().valid('session', 'match', 'achievement').required(),
    entityId: joi_1.default.string().uuid().required(),
    platform: joi_1.default.string().valid('twitter', 'facebook', 'whatsapp', 'copy_link').required(),
    message: joi_1.default.string().max(500).optional()
});
const connectSocialSchema = joi_1.default.object({
    provider: joi_1.default.string().valid('google', 'facebook', 'twitter').required(),
    providerId: joi_1.default.string().required(),
    providerData: joi_1.default.object().optional()
});
const updatePrivacySchema = joi_1.default.object({
    session_share: joi_1.default.string().valid('public', 'friends', 'private').optional(),
    stats_share: joi_1.default.string().valid('public', 'friends', 'private').optional(),
    achievements_share: joi_1.default.string().valid('public', 'friends', 'private').optional()
});
/**
 * @route POST /api/sharing/share
 * @desc Share an entity (session, match, achievement)
 * @access Private
 */
router.post('/share', (0, validation_1.validate)(shareEntitySchema), (0, privacyMiddleware_1.validateShareOwnership)('entity'), (0, privacyMiddleware_1.generatePreviewMiddleware)(), async (req, res) => {
    try {
        const { type, entityId, platform, message } = req.body;
        const sharerId = req.sharerId || 'player-123'; // From middleware or mock
        const result = await sharingService_1.sharingService.shareEntity(sharerId, {
            type,
            entityId,
            platform,
            message
        });
        // Include social preview if generated
        const response = {
            ...result,
            preview: req.socialPreview
        };
        res.status(201).json({
            success: true,
            data: response,
            message: 'Content shared successfully'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to share content'
        });
    }
});
/**
 * @route GET /api/sharing/feed
 * @desc Get community feed with recent shares and sessions
 * @access Public
 */
router.get('/feed', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const userId = req.query.userId; // Optional for personalized feed
        const feed = await sharingService_1.sharingService.getCommunityFeed(userId, limit, offset);
        res.json({
            success: true,
            data: feed,
            message: 'Community feed retrieved successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve community feed'
        });
    }
});
/**
 * @route POST /api/sharing/connect
 * @desc Connect a social media account
 * @access Private
 */
router.post('/connect', (0, validation_1.validate)(connectSocialSchema), async (req, res) => {
    try {
        const { provider, providerId, providerData } = req.body;
        const playerId = 'player-123'; // Mock user ID for MVP
        const connection = await sharingService_1.sharingService.connectSocialAccount(playerId, {
            provider,
            providerId,
            providerData
        });
        res.status(201).json({
            success: true,
            data: connection,
            message: 'Social account connected successfully'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to connect social account'
        });
    }
});
/**
 * @route GET /api/sharing/connections
 * @desc Get user's social media connections
 * @access Private
 */
router.get('/connections', async (req, res) => {
    try {
        const playerId = 'player-123'; // Mock user ID for MVP
        const connections = await sharingService_1.sharingService.getSocialConnections(playerId);
        res.json({
            success: true,
            data: connections,
            count: connections.length,
            message: 'Social connections retrieved successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve social connections'
        });
    }
});
/**
 * @route PUT /api/sharing/privacy
 * @desc Update privacy settings
 * @access Private
 */
router.put('/privacy', (0, validation_1.validate)(updatePrivacySchema), async (req, res) => {
    try {
        const settings = req.body;
        const playerId = 'player-123'; // Mock user ID for MVP
        const updatedSettings = await sharingService_1.sharingService.updatePrivacySettings(playerId, settings);
        res.json({
            success: true,
            data: updatedSettings,
            message: 'Privacy settings updated successfully'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to update privacy settings'
        });
    }
});
/**
 * @route GET /api/sharing/privacy
 * @desc Get current privacy settings
 * @access Private
 */
router.get('/privacy', async (req, res) => {
    try {
        const playerId = 'player-123'; // Mock user ID for MVP
        const settings = await sharingService_1.sharingService.getPrivacySettings(playerId);
        res.json({
            success: true,
            data: settings,
            message: 'Privacy settings retrieved successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve privacy settings'
        });
    }
});
/**
 * @route GET /api/sharing/stats
 * @desc Get sharing statistics for user
 * @access Private
 */
router.get('/stats', async (req, res) => {
    try {
        const playerId = 'player-123'; // Mock user ID for MVP
        const stats = await sharingService_1.sharingService.getShareStats(playerId);
        res.json({
            success: true,
            data: stats,
            message: 'Sharing statistics retrieved successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve sharing statistics'
        });
    }
});
/**
 * @route GET /api/sharing/preview/:type/:entityId
 * @desc Get social preview data for an entity
 * @access Public
 */
router.get('/preview/:type/:entityId', async (req, res) => {
    try {
        const { type, entityId } = req.params;
        // Generate preview data
        const service = sharingService_1.sharingService; // Type workaround for now
        const preview = await service.generateSocialPreview(type, entityId);
        res.json({
            success: true,
            data: preview,
            message: 'Social preview generated successfully'
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to generate social preview'
        });
    }
});
exports.default = router;
//# sourceMappingURL=sharing.js.map