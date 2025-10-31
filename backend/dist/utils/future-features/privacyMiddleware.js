"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePreviewMiddleware = exports.validateShareOwnership = exports.checkPrivacyMiddleware = void 0;
const sharingService_1 = require("../services/sharingService");
/**
 * Middleware to check privacy settings before allowing sharing
 */
const checkPrivacyMiddleware = (options) => {
    return async (req, res, next) => {
        try {
            const { contentType, entityId, sharerId } = options;
            // Get sharer's privacy settings
            const privacySettings = await sharingService_1.sharingService.getPrivacySettings(sharerId);
            // Check if sharing is allowed for this content type
            const privacyKey = `${contentType}_share`;
            const privacySetting = privacySettings[privacyKey] || 'public';
            if (privacySetting === 'private') {
                return res.status(403).json({
                    success: false,
                    message: 'Sharing is disabled for this content type due to privacy settings'
                });
            }
            // Add privacy info to request for further processing
            req.privacySetting = privacySetting;
            req.privacySettings = privacySettings;
            next();
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to check privacy settings'
            });
        }
    };
};
exports.checkPrivacyMiddleware = checkPrivacyMiddleware;
/**
 * Middleware to validate share permissions based on content ownership
 */
const validateShareOwnership = (contentType) => {
    return async (req, res, next) => {
        try {
            const { entityId } = req.body;
            const userId = 'player-123'; // Mock user ID for MVP
            // For MVP, we'll allow sharing of any content
            // In production, this would check ownership/permissions
            req.sharerId = userId;
            next();
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to validate share ownership'
            });
        }
    };
};
exports.validateShareOwnership = validateShareOwnership;
/**
 * Middleware to generate social preview metadata
 */
const generatePreviewMiddleware = () => {
    return async (req, res, next) => {
        try {
            const { type, entityId } = req.body;
            if (type && entityId) {
                // Generate preview data
                const service = sharingService_1.sharingService; // Type workaround
                const preview = await service.generateSocialPreview(type, entityId);
                req.socialPreview = preview;
            }
            next();
        }
        catch (error) {
            // Don't fail the request if preview generation fails
            console.warn('Failed to generate social preview:', error);
            next();
        }
    };
};
exports.generatePreviewMiddleware = generatePreviewMiddleware;
//# sourceMappingURL=privacyMiddleware.js.map