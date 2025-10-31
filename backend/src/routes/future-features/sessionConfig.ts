import express, { Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { SessionConfigService } from '../services/sessionConfigService';
import { SessionConfiguration, DEFAULT_SESSION_CONFIG } from '../types/sessionConfig';
import { requireRole } from '../middleware/auth';

interface AuthRequest extends express.Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

const router = express.Router();

// Validation middleware
const validateConfiguration = [
  body('scoringSystem').optional().isIn(['21_POINT', '15_POINT', '11_POINT']),
  body('bestOfGames').optional().isIn([1, 3, 5, 7]),
  body('restPeriod').optional().isInt({ min: 0, max: 10 }),
  body('gameTimeLimit').optional().isInt({ min: 5, max: 120 }),
  body('setTimeLimit').optional().isInt({ min: 10, max: 180 }),
  body('minAge').optional().isInt({ min: 5, max: 100 }),
  body('maxAge').optional().isInt({ min: 5, max: 100 }),
  body('skillLevelMin').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('skillLevelMax').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('genderPreference').optional().isIn(['male', 'female', 'mixed']),
  body('setupTime').optional().isInt({ min: 0, max: 120 }),
  body('bufferTime').optional().isInt({ min: 0, max: 120 }),
  body('baseCost').optional().isFloat({ min: 0 }),
  body('costPerPlayer').optional().isFloat({ min: 0 }),
  body('costPerCourt').optional().isFloat({ min: 0 }),
  body('updateFrequency').optional().isIn(['real_time', 'hourly', 'daily']),
  body('substitutions').optional().isIn(['allowed', 'limited', 'not_allowed']),
];

const validateSessionId = [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
];

/**
 * GET /sessions/:sessionId/config
 * Get session configuration
 */
router.get(
  '/sessions/:sessionId/config',
  validateSessionId,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const config = await SessionConfigService.getConfigurationWithDefaults(sessionId);

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('Error fetching session configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch session configuration',
      });
    }
  }
);

/**
 * PUT /sessions/:sessionId/config
 * Update session configuration
 */
router.put(
  '/sessions/:sessionId/config',
  requireRole(['OWNER', 'ORGANIZER']),
  validateSessionId,
  validateConfiguration,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const configUpdate: Partial<SessionConfiguration> = req.body;

      const updatedConfig = await SessionConfigService.upsertConfiguration(sessionId, configUpdate);

      res.json({
        success: true,
        data: updatedConfig,
        message: 'Session configuration updated successfully',
      });
    } catch (error) {
      console.error('Error updating session configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update session configuration',
      });
    }
  }
);

/**
 * DELETE /sessions/:sessionId/config
 * Reset session configuration to defaults
 */
router.delete(
  '/sessions/:sessionId/config',
  requireRole(['OWNER', 'ORGANIZER']),
  validateSessionId,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { sessionId } = req.params;
      await SessionConfigService.deleteConfiguration(sessionId);

      res.json({
        success: true,
        data: DEFAULT_SESSION_CONFIG,
        message: 'Session configuration reset to defaults',
      });
    } catch (error) {
      console.error('Error resetting session configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset session configuration',
      });
    }
  }
);

/**
 * POST /sessions/:sessionId/config/validate
 * Validate configuration without saving
 */
router.post(
  '/sessions/:sessionId/config/validate',
  validateSessionId,
  validateConfiguration,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const configToValidate: SessionConfiguration = { ...DEFAULT_SESSION_CONFIG, ...req.body };
      const validation = await SessionConfigService.validateConfiguration(configToValidate);

      res.json({
        success: true,
        data: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    } catch (error) {
      console.error('Error validating session configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate session configuration',
      });
    }
  }
);

/**
 * GET /config/presets
 * Get available configuration presets
 */
router.get('/config/presets', async (req: AuthRequest, res: Response) => {
  try {
    const presets = SessionConfigService.getConfigurationPresets();

    res.json({
      success: true,
      data: presets,
    });
  } catch (error) {
    console.error('Error fetching configuration presets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration presets',
    });
  }
});

/**
 * POST /sessions/:sessionId/config/preset/:presetName
 * Apply a configuration preset
 */
router.post(
  '/sessions/:sessionId/config/preset/:presetName',
  requireRole(['OWNER', 'ORGANIZER']),
  validateSessionId,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { sessionId, presetName } = req.params;
      const presets = SessionConfigService.getConfigurationPresets();

      if (!presets[presetName]) {
        return res.status(400).json({
          success: false,
          error: `Preset '${presetName}' not found. Available presets: ${Object.keys(presets).join(', ')}`,
        });
      }

      const presetConfig = presets[presetName];
      const updatedConfig = await SessionConfigService.upsertConfiguration(sessionId, presetConfig);

      res.json({
        success: true,
        data: updatedConfig,
        message: `Configuration preset '${presetName}' applied successfully`,
      });
    } catch (error) {
      console.error('Error applying configuration preset:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to apply configuration preset',
      });
    }
  }
);

export default router;