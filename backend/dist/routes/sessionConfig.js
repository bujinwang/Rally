"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const sessionConfigService_1 = require("../services/sessionConfigService");
const sessionConfig_1 = require("../types/sessionConfig");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Validation middleware
const validateConfiguration = [
    (0, express_validator_1.body)('scoringSystem').optional().isIn(['21_POINT', '15_POINT', '11_POINT']),
    (0, express_validator_1.body)('bestOfGames').optional().isIn([1, 3, 5, 7]),
    (0, express_validator_1.body)('restPeriod').optional().isInt({ min: 0, max: 10 }),
    (0, express_validator_1.body)('gameTimeLimit').optional().isInt({ min: 5, max: 120 }),
    (0, express_validator_1.body)('setTimeLimit').optional().isInt({ min: 10, max: 180 }),
    (0, express_validator_1.body)('minAge').optional().isInt({ min: 5, max: 100 }),
    (0, express_validator_1.body)('maxAge').optional().isInt({ min: 5, max: 100 }),
    (0, express_validator_1.body)('skillLevelMin').optional().isIn(['beginner', 'intermediate', 'advanced']),
    (0, express_validator_1.body)('skillLevelMax').optional().isIn(['beginner', 'intermediate', 'advanced']),
    (0, express_validator_1.body)('genderPreference').optional().isIn(['male', 'female', 'mixed']),
    (0, express_validator_1.body)('setupTime').optional().isInt({ min: 0, max: 120 }),
    (0, express_validator_1.body)('bufferTime').optional().isInt({ min: 0, max: 120 }),
    (0, express_validator_1.body)('baseCost').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('costPerPlayer').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('costPerCourt').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('updateFrequency').optional().isIn(['real_time', 'hourly', 'daily']),
    (0, express_validator_1.body)('substitutions').optional().isIn(['allowed', 'limited', 'not_allowed']),
];
const validateSessionId = [
    (0, express_validator_1.param)('sessionId').isUUID().withMessage('Invalid session ID format'),
];
/**
 * GET /sessions/:sessionId/config
 * Get session configuration
 */
router.get('/sessions/:sessionId/config', validateSessionId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        const { sessionId } = req.params;
        const config = await sessionConfigService_1.SessionConfigService.getConfigurationWithDefaults(sessionId);
        res.json({
            success: true,
            data: config,
        });
    }
    catch (error) {
        console.error('Error fetching session configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session configuration',
        });
    }
});
/**
 * PUT /sessions/:sessionId/config
 * Update session configuration
 */
router.put('/sessions/:sessionId/config', (0, auth_1.requireRole)(['OWNER', 'ORGANIZER']), validateSessionId, validateConfiguration, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        const { sessionId } = req.params;
        const configUpdate = req.body;
        const updatedConfig = await sessionConfigService_1.SessionConfigService.upsertConfiguration(sessionId, configUpdate);
        res.json({
            success: true,
            data: updatedConfig,
            message: 'Session configuration updated successfully',
        });
    }
    catch (error) {
        console.error('Error updating session configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update session configuration',
        });
    }
});
/**
 * DELETE /sessions/:sessionId/config
 * Reset session configuration to defaults
 */
router.delete('/sessions/:sessionId/config', (0, auth_1.requireRole)(['OWNER', 'ORGANIZER']), validateSessionId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        const { sessionId } = req.params;
        await sessionConfigService_1.SessionConfigService.deleteConfiguration(sessionId);
        res.json({
            success: true,
            data: sessionConfig_1.DEFAULT_SESSION_CONFIG,
            message: 'Session configuration reset to defaults',
        });
    }
    catch (error) {
        console.error('Error resetting session configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset session configuration',
        });
    }
});
/**
 * POST /sessions/:sessionId/config/validate
 * Validate configuration without saving
 */
router.post('/sessions/:sessionId/config/validate', validateSessionId, validateConfiguration, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        const configToValidate = { ...sessionConfig_1.DEFAULT_SESSION_CONFIG, ...req.body };
        const validation = await sessionConfigService_1.SessionConfigService.validateConfiguration(configToValidate);
        res.json({
            success: true,
            data: {
                isValid: validation.isValid,
                errors: validation.errors,
                warnings: validation.warnings,
            },
        });
    }
    catch (error) {
        console.error('Error validating session configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate session configuration',
        });
    }
});
/**
 * GET /config/presets
 * Get available configuration presets
 */
router.get('/config/presets', async (req, res) => {
    try {
        const presets = sessionConfigService_1.SessionConfigService.getConfigurationPresets();
        res.json({
            success: true,
            data: presets,
        });
    }
    catch (error) {
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
router.post('/sessions/:sessionId/config/preset/:presetName', (0, auth_1.requireRole)(['OWNER', 'ORGANIZER']), validateSessionId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }
        const { sessionId, presetName } = req.params;
        const presets = sessionConfigService_1.SessionConfigService.getConfigurationPresets();
        if (!presets[presetName]) {
            return res.status(400).json({
                success: false,
                error: `Preset '${presetName}' not found. Available presets: ${Object.keys(presets).join(', ')}`,
            });
        }
        const presetConfig = presets[presetName];
        const updatedConfig = await sessionConfigService_1.SessionConfigService.upsertConfiguration(sessionId, presetConfig);
        res.json({
            success: true,
            data: updatedConfig,
            message: `Configuration preset '${presetName}' applied successfully`,
        });
    }
    catch (error) {
        console.error('Error applying configuration preset:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply configuration preset',
        });
    }
});
exports.default = router;
//# sourceMappingURL=sessionConfig.js.map