"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationService_1 = require("../services/notificationService");
const notifications_1 = require("../types/notifications");
const auth_1 = require("../middleware/auth");
const joi_1 = __importDefault(require("joi"));
const router = express_1.default.Router();
// Validation schemas
const registerTokenSchema = joi_1.default.object({
    token: joi_1.default.string().required(),
    platform: joi_1.default.string().valid('ios', 'android').required(),
    deviceId: joi_1.default.string().optional(),
});
const updatePreferencesSchema = joi_1.default.object({
    matchResults: joi_1.default.boolean().optional(),
    achievements: joi_1.default.boolean().optional(),
    friendRequests: joi_1.default.boolean().optional(),
    challenges: joi_1.default.boolean().optional(),
    tournamentUpdates: joi_1.default.boolean().optional(),
    socialMessages: joi_1.default.boolean().optional(),
    sessionReminders: joi_1.default.boolean().optional(),
    pushEnabled: joi_1.default.boolean().optional(),
    emailEnabled: joi_1.default.boolean().optional(),
    quietHoursStart: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    quietHoursEnd: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
});
const getNotificationsSchema = joi_1.default.object({
    limit: joi_1.default.number().integer().min(1).max(100).optional(),
    offset: joi_1.default.number().integer().min(0).optional(),
    unreadOnly: joi_1.default.boolean().optional(),
    category: joi_1.default.string().valid(...Object.values(notifications_1.NotificationCategory)).optional(),
});
/**
 * Register push notification token
 * POST /api/notifications/token
 */
router.post('/token', auth_1.authenticateToken, async (req, res) => {
    try {
        const { error, value } = registerTokenSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.details[0].message,
            });
        }
        const playerId = req.user.id;
        await notificationService_1.NotificationService.registerPushToken(playerId, value);
        res.json({ success: true, message: 'Push token registered successfully' });
    }
    catch (error) {
        console.error('Error registering push token:', error);
        res.status(500).json({
            error: 'Failed to register push token',
            message: error.message,
        });
    }
});
/**
 * Unregister push notification token
 * DELETE /api/notifications/token
 */
router.delete('/token', auth_1.authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }
        await notificationService_1.NotificationService.unregisterPushToken(token);
        res.json({ success: true, message: 'Push token unregistered successfully' });
    }
    catch (error) {
        console.error('Error unregistering push token:', error);
        res.status(500).json({
            error: 'Failed to unregister push token',
            message: error.message,
        });
    }
});
/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', auth_1.authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;
        const preferences = await notificationService_1.NotificationService.getNotificationPreferences(playerId);
        res.json({ preferences });
    }
    catch (error) {
        console.error('Error getting notification preferences:', error);
        res.status(500).json({
            error: 'Failed to get notification preferences',
            message: error.message,
        });
    }
});
/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
router.put('/preferences', auth_1.authenticateToken, async (req, res) => {
    try {
        const { error, value } = updatePreferencesSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.details[0].message,
            });
        }
        const playerId = req.user.id;
        await notificationService_1.NotificationService.updateNotificationPreferences(playerId, value);
        res.json({ success: true, message: 'Notification preferences updated successfully' });
    }
    catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({
            error: 'Failed to update notification preferences',
            message: error.message,
        });
    }
});
/**
 * Get notifications
 * GET /api/notifications
 */
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const { error, value } = getNotificationsSchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.details[0].message,
            });
        }
        const playerId = req.user.id;
        const notifications = await notificationService_1.NotificationService.getNotifications(playerId, value);
        res.json({ notifications });
    }
    catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({
            error: 'Failed to get notifications',
            message: error.message,
        });
    }
});
/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;
        await notificationService_1.NotificationService.markNotificationAsRead(id, playerId);
        res.json({ success: true, message: 'Notification marked as read' });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            error: 'Failed to mark notification as read',
            message: error.message,
        });
    }
});
/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
router.put('/read-all', auth_1.authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;
        await notificationService_1.NotificationService.markAllNotificationsAsRead(playerId);
        res.json({ success: true, message: 'All notifications marked as read' });
    }
    catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            error: 'Failed to mark all notifications as read',
            message: error.message,
        });
    }
});
/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', auth_1.authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;
        const count = await notificationService_1.NotificationService.getUnreadNotificationCount(playerId);
        res.json({ unreadCount: count });
    }
    catch (error) {
        console.error('Error getting unread notification count:', error);
        res.status(500).json({
            error: 'Failed to get unread notification count',
            message: error.message,
        });
    }
});
/**
 * Delete old notifications (admin/cleanup endpoint)
 * DELETE /api/notifications/cleanup
 */
router.delete('/cleanup', auth_1.authenticateToken, async (req, res) => {
    try {
        // In a real app, you'd check for admin permissions here
        const daysOld = parseInt(req.query.days) || 30;
        await notificationService_1.NotificationService.cleanupOldNotifications(daysOld);
        res.json({ success: true, message: `Cleaned up notifications older than ${daysOld} days` });
    }
    catch (error) {
        console.error('Error cleaning up notifications:', error);
        res.status(500).json({
            error: 'Failed to cleanup notifications',
            message: error.message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=notifications.js.map