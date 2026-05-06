import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, param, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Validation schemas
const registerTokenValidation = [
  body('pushToken').isString().notEmpty().withMessage('Push token is required'),
  body('deviceId').isString().notEmpty().withMessage('Device ID is required'),
  body('platform').isIn(['ios', 'android', 'web']).withMessage('Invalid platform'),
  body('playerName').optional().isString(),
];

const sendNotificationValidation = [
  body('title').isString().notEmpty().withMessage('Title is required'),
  body('body').isString().notEmpty().withMessage('Body is required'),
  body('type').isString().notEmpty().withMessage('Type is required'),
  body('recipients').isArray().withMessage('Recipients must be an array'),
  body('data').optional().isObject(),
];

const preferencesValidation = [
  body('enablePush').optional().isBoolean(),
  body('enableInApp').optional().isBoolean(),
  body('enableSound').optional().isBoolean(),
  body('enableVibration').optional().isBoolean(),
  body('quietHoursStart').optional().isString(),
  body('quietHoursEnd').optional().isString(),
  body('notificationTypes').optional().isObject(),
];

/**
 * Register device push token
 * POST /notifications/register
 */
router.post('/register', registerTokenValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
        },
        timestamp: new Date().toISOString(),
      });
    }

    const { pushToken, deviceId, platform, playerName } = req.body;

    // Check if token already exists
    const existingToken = await prisma.pushToken.findFirst({
      where: { deviceId },
    });

    let tokenRecord;

    if (existingToken) {
      // Update existing token
      tokenRecord = await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: {
          pushToken,
          platform,
          playerName,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new token record
      tokenRecord = await prisma.pushToken.create({
        data: {
          pushToken,
          deviceId,
          platform,
          playerName,
          isActive: true,
        },
      });
    }

    res.json({
      success: true,
      data: {
        tokenId: tokenRecord.id,
        deviceId: tokenRecord.deviceId,
      },
      message: 'Push token registered successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Register token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register push token',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Unregister device push token
 * DELETE /notifications/register/:deviceId
 */
router.delete('/register/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    await prisma.pushToken.updateMany({
      where: { deviceId },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: 'Push token unregistered successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Unregister token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to unregister push token',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Subscribe to session notifications
 * POST /notifications/:shareCode/subscribe
 */
router.post('/:shareCode/subscribe', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { deviceId, playerName } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Device ID is required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Find session
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Create subscription
    const subscription = await prisma.sessionSubscription.upsert({
      where: {
        sessionId_deviceId: {
          sessionId: session.id,
          deviceId,
        },
      },
      update: {
        playerName,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        sessionId: session.id,
        deviceId,
        playerName,
        isActive: true,
      },
    });

    res.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        sessionId: session.id,
      },
      message: 'Subscribed to session notifications',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to subscribe to notifications',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Unsubscribe from session notifications
 * DELETE /notifications/:shareCode/unsubscribe
 */
router.delete('/:shareCode/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Device ID is required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
        timestamp: new Date().toISOString(),
      });
    }

    await prisma.sessionSubscription.updateMany({
      where: {
        sessionId: session.id,
        deviceId,
      },
      data: {
        isActive: false,
      },
    });

    res.json({
      success: true,
      message: 'Unsubscribed from session notifications',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to unsubscribe from notifications',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get notification preferences
 * GET /notifications/preferences/:deviceId
 */
router.get('/preferences/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    let preferences = await prisma.notificationPreferences.findUnique({
      where: { deviceId },
    });

    // Return default preferences if none exist
    if (!preferences) {
      preferences = {
        id: '',
        deviceId,
        enablePush: true,
        enableInApp: true,
        enableSound: true,
        enableVibration: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        notificationTypes: {
          GAME_READY: true,
          REST_APPROVED: true,
          REST_DENIED: true,
          SCORE_RECORDED: true,
          NEXT_UP: true,
          SESSION_STARTING: true,
          SESSION_UPDATED: true,
          PLAYER_JOINED: true,
          PAIRING_GENERATED: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    }

    res.json({
      success: true,
      data: { preferences },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification preferences',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Update notification preferences
 * PUT /notifications/preferences/:deviceId
 */
router.put(
  '/preferences/:deviceId',
  preferencesValidation,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
          timestamp: new Date().toISOString(),
        });
      }

      const { deviceId } = req.params;
      const {
        enablePush,
        enableInApp,
        enableSound,
        enableVibration,
        quietHoursStart,
        quietHoursEnd,
        notificationTypes,
      } = req.body;

      const preferences = await prisma.notificationPreferences.upsert({
        where: { deviceId },
        update: {
          enablePush,
          enableInApp,
          enableSound,
          enableVibration,
          quietHoursStart,
          quietHoursEnd,
          notificationTypes,
          updatedAt: new Date(),
        },
        create: {
          deviceId,
          enablePush: enablePush ?? true,
          enableInApp: enableInApp ?? true,
          enableSound: enableSound ?? true,
          enableVibration: enableVibration ?? true,
          quietHoursStart,
          quietHoursEnd,
          notificationTypes: notificationTypes ?? {},
        },
      });

      res.json({
        success: true,
        data: { preferences },
        message: 'Notification preferences updated',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Update preferences error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update notification preferences',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Send notification to specific devices (internal use)
 * POST /notifications/send
 */
router.post('/send', sendNotificationValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
        },
        timestamp: new Date().toISOString(),
      });
    }

    const { title, body, type, recipients, data } = req.body;

    // Get push tokens for recipients
    const tokens = await prisma.pushToken.findMany({
      where: {
        deviceId: { in: recipients },
        isActive: true,
      },
    });

    if (tokens.length === 0) {
      return res.json({
        success: true,
        data: { sent: 0 },
        message: 'No active push tokens found for recipients',
        timestamp: new Date().toISOString(),
      });
    }

    // In production, send to Expo push notification service
    // For now, just log
    console.log(`📱 Would send push notification to ${tokens.length} devices:`, {
      title,
      body,
      type,
      tokens: tokens.map((t) => t.pushToken),
    });

    // TODO: Implement actual Expo push notification sending
    // const pushMessages = tokens.map(token => ({
    //   to: token.pushToken,
    //   sound: 'default',
    //   title,
    //   body,
    //   data: { ...data, type },
    // }));
    // await expo.sendPushNotificationsAsync(pushMessages);

    res.json({
      success: true,
      data: {
        sent: tokens.length,
        recipients: tokens.map((t) => t.deviceId),
      },
      message: `Notification sent to ${tokens.length} device(s)`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send notification',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get session subscribers (for sending session-wide notifications)
 * GET /notifications/:shareCode/subscribers
 */
router.get('/:shareCode/subscribers', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const subscribers = await prisma.sessionSubscription.findMany({
      where: {
        sessionId: session.id,
        isActive: true,
      },
      include: {
        pushToken: {
          where: { isActive: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        subscribers: subscribers.map((sub) => ({
          deviceId: sub.deviceId,
          playerName: sub.playerName,
          hasPushToken: sub.pushToken.length > 0,
        })),
        total: subscribers.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get subscribers error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get subscribers',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
