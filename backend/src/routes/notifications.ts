import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, validationResult } from 'express-validator';

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
           token: pushToken,
           platform,
           updatedAt: new Date(),
         },
       });
     } else {
       // Create new token record
       tokenRecord = await prisma.pushToken.create({
         data: {
           token: pushToken,
           playerId: deviceId,
           deviceId,
           platform,
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
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const session = await prisma.mvpSession.findUnique({ where: { shareCode } });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        timestamp: new Date().toISOString(),
      });
    }

    await prisma.sessionSubscription.upsert({
      where: {
        sessionId_deviceId: {
          sessionId: session.id,
          deviceId,
        },
      },
      create: {
        sessionId: session.id,
        deviceId,
        isActive: true,
      },
      update: {
        isActive: true,
      },
    });

    res.json({
      success: true,
      message: 'Subscribed to session notifications',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to subscribe' },
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
        error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const session = await prisma.mvpSession.findUnique({ where: { shareCode } });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        timestamp: new Date().toISOString(),
      });
    }

    await prisma.sessionSubscription.updateMany({
      where: {
        sessionId: session.id,
        deviceId,
      },
      data: { isActive: false },
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
      error: { code: 'INTERNAL_ERROR', message: 'Failed to unsubscribe' },
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

    const session = await prisma.mvpSession.findUnique({ where: { shareCode } });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        timestamp: new Date().toISOString(),
      });
    }

    const subscriptions = await prisma.sessionSubscription.findMany({
      where: {
        sessionId: session.id,
        isActive: true,
      },
      select: {
        deviceId: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        count: subscriptions.length,
        subscribers: subscriptions,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get subscribers error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get subscribers' },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
