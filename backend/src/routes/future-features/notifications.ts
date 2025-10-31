import express from 'express';
import { NotificationService } from '../services/notificationService';
import { NotificationCategory } from '../types/notifications';
import { authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const registerTokenSchema = Joi.object({
  token: Joi.string().required(),
  platform: Joi.string().valid('ios', 'android').required(),
  deviceId: Joi.string().optional(),
});

const updatePreferencesSchema = Joi.object({
  matchResults: Joi.boolean().optional(),
  achievements: Joi.boolean().optional(),
  friendRequests: Joi.boolean().optional(),
  challenges: Joi.boolean().optional(),
  tournamentUpdates: Joi.boolean().optional(),
  socialMessages: Joi.boolean().optional(),
  sessionReminders: Joi.boolean().optional(),
  pushEnabled: Joi.boolean().optional(),
  emailEnabled: Joi.boolean().optional(),
  quietHoursStart: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  quietHoursEnd: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
});

const getNotificationsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional(),
  offset: Joi.number().integer().min(0).optional(),
  unreadOnly: Joi.boolean().optional(),
  category: Joi.string().valid(...Object.values(NotificationCategory)).optional(),
});

/**
 * Register push notification token
 * POST /api/notifications/token
 */
router.post('/token', authenticateToken, async (req, res) => {
  try {
    const { error, value } = registerTokenSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message,
      });
    }

    const playerId = (req as any).user.id;
    await NotificationService.registerPushToken(playerId, value);

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error: any) {
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
router.delete('/token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    await NotificationService.unregisterPushToken(token);

    res.json({ success: true, message: 'Push token unregistered successfully' });
  } catch (error: any) {
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
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;
    const preferences = await NotificationService.getNotificationPreferences(playerId);

    res.json({ preferences });
  } catch (error: any) {
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
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { error, value } = updatePreferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message,
      });
    }

    const playerId = (req as any).user.id;
    await NotificationService.updateNotificationPreferences(playerId, value);

    res.json({ success: true, message: 'Notification preferences updated successfully' });
  } catch (error: any) {
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
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { error, value } = getNotificationsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message,
      });
    }

    const playerId = (req as any).user.id;
    const notifications = await NotificationService.getNotifications(playerId, value);

    res.json({ notifications });
  } catch (error: any) {
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
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const playerId = (req as any).user.id;

    await NotificationService.markNotificationAsRead(id, playerId);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error: any) {
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
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;

    await NotificationService.markAllNotificationsAsRead(playerId);

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
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
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;
    const count = await NotificationService.getUnreadNotificationCount(playerId);

    res.json({ unreadCount: count });
  } catch (error: any) {
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
router.delete('/cleanup', authenticateToken, async (req, res) => {
  try {
    // In a real app, you'd check for admin permissions here
    const daysOld = parseInt(req.query.days as string) || 30;

    await NotificationService.cleanupOldNotifications(daysOld);

    res.json({ success: true, message: `Cleaned up notifications older than ${daysOld} days` });
  } catch (error: any) {
    console.error('Error cleaning up notifications:', error);
    res.status(500).json({
      error: 'Failed to cleanup notifications',
      message: error.message,
    });
  }
});

export default router;