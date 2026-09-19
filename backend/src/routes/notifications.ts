import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, validationResult } from 'express-validator';
import { resolveIdentity, ResolvedIdentity } from '../middleware/permissions';
import { optionalAuth } from '../middleware/auth';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  toNotificationPreferences,
} from '../services/notificationPreferences';
import type { NotificationPreferences } from '../types/notifications';

const router = Router();

// The preference columns a client may set through PUT /notifications/preferences.
const PREFERENCE_BOOLEAN_FIELDS = [
  'pushEnabled',
  'matchResults',
  'achievements',
  'friendRequests',
  'challenges',
  'tournamentUpdates',
  'socialMessages',
  'sessionReminders',
  'emailEnabled',
] as const;

const PREFERENCE_TIME_FIELDS = ['quietHoursStart', 'quietHoursEnd'] as const;

// Validation schemas
const registerTokenValidation = [
  body('pushToken').isString().notEmpty().withMessage('Push token is required'),
  // Story 6.9 (F1, Option C): `deviceId` is no longer required at the validator —
  // an account (JWT) caller may register with no device id. The handler still
  // requires at least one identity (userId or deviceId) and returns 400 otherwise.
  body('deviceId').optional().isString().notEmpty().withMessage('Device ID must be a non-empty string'),
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

// Story 6.9 (AC 3): the columns a client may update via PUT /notifications/preferences.
// Only the live schema columns are accepted — unknown fields are ignored by the
// handler, never persisted.
const preferencesUpdateValidation = [
  body('pushEnabled').optional().isBoolean(),
  body('matchResults').optional().isBoolean(),
  body('achievements').optional().isBoolean(),
  body('friendRequests').optional().isBoolean(),
  body('challenges').optional().isBoolean(),
  body('tournamentUpdates').optional().isBoolean(),
  body('socialMessages').optional().isBoolean(),
  body('sessionReminders').optional().isBoolean(),
  body('emailEnabled').optional().isBoolean(),
  body('quietHoursStart').optional().isString(),
  body('quietHoursEnd').optional().isString(),
];

/** The identity a preferences row is keyed by (account first, then device). */
type PreferenceIdentity = Pick<ResolvedIdentity, 'userId' | 'deviceId'>;

/**
 * Load the caller's effective preferences: an account-keyed row, else a
 * device-keyed row, else the schema defaults. Always returns a full object so
 * the client never has to merge defaults itself.
 */
async function loadEffectivePreferences(
  identity: PreferenceIdentity,
): Promise<NotificationPreferences> {
  let row = null;

  if (identity.userId) {
    row = await prisma.notificationPreferences.findUnique({ where: { userId: identity.userId } });
  }
  if (!row && identity.deviceId) {
    row = await prisma.notificationPreferences.findUnique({ where: { deviceId: identity.deviceId } });
  }

  return row ? toNotificationPreferences(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

/**
 * Extract only the known preference columns from a request body. Unknown keys are
 * dropped (never persisted), and an empty-string quiet-hour bound clears it.
 */
function pickPreferenceFields(raw: Record<string, unknown>): Record<string, boolean | string | null> {
  const update: Record<string, boolean | string | null> = {};

  for (const field of PREFERENCE_BOOLEAN_FIELDS) {
    if (typeof raw[field] === 'boolean') update[field] = raw[field] as boolean;
  }

  for (const field of PREFERENCE_TIME_FIELDS) {
    if (typeof raw[field] === 'string') {
      const value = (raw[field] as string).trim();
      update[field] = value === '' ? null : value;
    }
  }

  return update;
}

/**
 * Register device push token
 * POST /notifications/register
 */
// `optionalAuth` populates `req.user` for a valid Bearer token so
// `resolveIdentity` can see an account identity; a present-but-invalid token 401s
// (never a silent downgrade to anonymous). Device-only callers are unaffected.
router.post('/register', optionalAuth, registerTokenValidation, async (req: Request, res: Response) => {
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

    const { pushToken, platform } = req.body;

    // Story 6.9 (F1, Option C): resolve identity from a JWT (account) or a device
    // id via the only sanctioned resolver. Never read `req.user.name` (it does not
    // exist). At least one identity is required — the DB CHECK would otherwise
    // surface as a 500, which is the wrong contract, so reject with 400 here.
    const identity = resolveIdentity(req);
    if (!identity.userId && !identity.deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A user or device identity is required to register a push token',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Edge case: `where: { deviceId: null }` matches EVERY null-deviceId row, so an
    // account-only caller must look up by `userId` — never by a null deviceId — or
    // it could grab and overwrite an unrelated row.
    const existingToken = identity.deviceId
      ? await prisma.pushToken.findFirst({ where: { deviceId: identity.deviceId } })
      : await prisma.pushToken.findFirst({ where: { userId: identity.userId as string } });

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
      // Create new token record. `playerId` is legacy and intentionally NOT written
      // (that was F1); identity is bound to the resolved userId/deviceId.
      tokenRecord = await prisma.pushToken.create({
        data: {
          token: pushToken,
          userId: identity.userId ?? null,
          deviceId: identity.deviceId ?? null,
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
 * Get the caller's notification preferences (AC 3).
 * GET /notifications/preferences
 *
 * Registered BEFORE the `/:shareCode/...` routes: `/preferences` is a static
 * segment and must never be captured by a parameterised path.
 */
router.get('/preferences', optionalAuth, async (req: Request, res: Response) => {
  try {
    const identity = resolveIdentity(req);
    if (!identity.userId && !identity.deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A user or device identity is required to read preferences',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const preferences = await loadEffectivePreferences(identity);

    res.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get notification preferences' },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Update the caller's notification preferences (AC 3).
 * PUT /notifications/preferences
 *
 * Upserts by the caller's identity (account-keyed row when authenticated, else a
 * device-keyed row) and returns the saved, effective preferences.
 */
router.put('/preferences', optionalAuth, preferencesUpdateValidation, async (req: Request, res: Response) => {
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

    const identity = resolveIdentity(req);
    if (!identity.userId && !identity.deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A user or device identity is required to update preferences',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const update = pickPreferenceFields(req.body as Record<string, unknown>);

    // Account identity wins: key the row on `userId` when authenticated, else on
    // `deviceId`. Both columns are unique, so `upsert` is race-safe.
    const saved = identity.userId
      ? await prisma.notificationPreferences.upsert({
          where: { userId: identity.userId },
          create: { userId: identity.userId, ...update },
          update,
        })
      : await prisma.notificationPreferences.upsert({
          where: { deviceId: identity.deviceId as string },
          create: { deviceId: identity.deviceId as string, ...update },
          update,
        });

    res.json({
      success: true,
      data: toNotificationPreferences(saved),
      message: 'Notification preferences updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update notification preferences' },
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
