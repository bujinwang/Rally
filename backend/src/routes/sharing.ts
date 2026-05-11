import { Router, Request } from 'express';
import { sharingService } from '../services/sharingService';
import { validate } from '../utils/validation';
import { checkPrivacyMiddleware, validateShareOwnership, generatePreviewMiddleware } from '../utils/privacyMiddleware';
import Joi from 'joi';

const router = Router();

/** Extract deviceId from request body, query, or X-Device-ID header */
function getDeviceId(req: Request): string {
  return req.body.deviceId || req.query.deviceId || req.headers['x-device-id'] as string || '';
}

// Validation schemas
const shareEntitySchema = Joi.object({
  type: Joi.string().valid('session', 'match', 'achievement').required(),
  entityId: Joi.string().required(),
  platform: Joi.string().valid('twitter', 'facebook', 'whatsapp', 'copy_link').required(),
  deviceId: Joi.string().optional(),
  message: Joi.string().max(500).optional(),
});

const connectSocialSchema = Joi.object({
  provider: Joi.string().valid('google', 'facebook', 'twitter').required(),
  providerId: Joi.string().required(),
  deviceId: Joi.string().optional(),
  providerData: Joi.object().optional(),
});

const updatePrivacySchema = Joi.object({
  deviceId: Joi.string().optional(),
  session_share: Joi.string().valid('public', 'friends', 'private').optional(),
  stats_share: Joi.string().valid('public', 'friends', 'private').optional(),
  achievements_share: Joi.string().valid('public', 'friends', 'private').optional(),
});

/**
 * @route POST /api/sharing/share
 * @desc Share an entity (session, match, achievement)
 * @access Private
 */
router.post('/share',
  validate(shareEntitySchema),
  validateShareOwnership('entity'),
  generatePreviewMiddleware(),
  async (req, res) => {
  try {
    const { type, entityId, platform, message } = req.body;
    const sharerId = getDeviceId(req) || 'anonymous';

    const result = await sharingService.shareEntity(sharerId, {
      type,
      entityId,
      platform,
      message,
    });

    const response = {
      ...result,
      preview: (req as any).socialPreview,
    };

    res.status(201).json({
      success: true,
      data: response,
      message: 'Content shared successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to share content',
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
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.query.userId as string;

    const feed = await sharingService.getCommunityFeed(userId, limit, offset);

    res.json({
      success: true,
      data: feed,
      message: 'Community feed retrieved successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve community feed' });
  }
});

/**
 * @route POST /api/sharing/connect
 * @desc Connect a social media account
 * @access Private
 */
router.post('/connect', validate(connectSocialSchema), async (req, res) => {
  try {
    const { provider, providerId, providerData } = req.body;
    const playerId = getDeviceId(req);

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Device ID is required' });
    }

    const connection = await sharingService.connectSocialAccount(playerId, {
      provider,
      providerId,
      providerData,
    });

    res.status(201).json({
      success: true,
      data: connection,
      message: 'Social account connected successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect social account',
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
    const playerId = getDeviceId(req);

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Device ID is required' });
    }

    const connections = await sharingService.getSocialConnections(playerId);

    res.json({
      success: true,
      data: connections,
      count: connections.length,
      message: 'Social connections retrieved successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve social connections' });
  }
});

/**
 * @route PUT /api/sharing/privacy
 * @desc Update privacy settings
 * @access Private
 */
router.put('/privacy', validate(updatePrivacySchema), async (req, res) => {
  try {
    const settings = req.body;
    const playerId = getDeviceId(req);

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Device ID is required' });
    }

    const updatedSettings = await sharingService.updatePrivacySettings(playerId, settings);

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Privacy settings updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update privacy settings',
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
    const playerId = getDeviceId(req);

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Device ID is required' });
    }

    const settings = await sharingService.getPrivacySettings(playerId);

    res.json({
      success: true,
      data: settings,
      message: 'Privacy settings retrieved successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve privacy settings' });
  }
});

/**
 * @route GET /api/sharing/stats
 * @desc Get sharing statistics for user
 * @access Private
 */
router.get('/stats', async (req, res) => {
  try {
    const playerId = getDeviceId(req);

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Device ID is required' });
    }

    const stats = await sharingService.getShareStats(playerId);

    res.json({
      success: true,
      data: stats,
      message: 'Sharing statistics retrieved successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve sharing statistics' });
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

    const preview = await (sharingService as any).generateSocialPreview(type, entityId);

    res.json({
      success: true,
      data: preview,
      message: 'Social preview generated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate social preview',
    });
  }
});

export default router;
