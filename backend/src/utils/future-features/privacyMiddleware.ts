import { Request, Response, NextFunction } from 'express';
import { sharingService } from '../services/sharingService';

export interface PrivacyCheckOptions {
  contentType: 'session' | 'match' | 'achievement';
  entityId: string;
  sharerId: string;
}

/**
 * Middleware to check privacy settings before allowing sharing
 */
export const checkPrivacyMiddleware = (options: PrivacyCheckOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contentType, entityId, sharerId } = options;

      // Get sharer's privacy settings
      const privacySettings = await sharingService.getPrivacySettings(sharerId);

      // Check if sharing is allowed for this content type
      const privacyKey = `${contentType}_share` as keyof typeof privacySettings;
      const privacySetting = privacySettings[privacyKey] || 'public';

      if (privacySetting === 'private') {
        return res.status(403).json({
          success: false,
          message: 'Sharing is disabled for this content type due to privacy settings'
        });
      }

      // Add privacy info to request for further processing
      (req as any).privacySetting = privacySetting;
      (req as any).privacySettings = privacySettings;

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to check privacy settings'
      });
    }
  };
};

/**
 * Middleware to validate share permissions based on content ownership
 */
export const validateShareOwnership = (contentType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityId } = req.body;
      const userId = 'player-123'; // Mock user ID for MVP

      // For MVP, we'll allow sharing of any content
      // In production, this would check ownership/permissions
      (req as any).sharerId = userId;

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to validate share ownership'
      });
    }
  };
};

/**
 * Middleware to generate social preview metadata
 */
export const generatePreviewMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, entityId } = req.body;

      if (type && entityId) {
        // Generate preview data
        const service = sharingService as any; // Type workaround
        const preview = await service.generateSocialPreview(type, entityId);
        (req as any).socialPreview = preview;
      }

      next();
    } catch (error) {
      // Don't fail the request if preview generation fails
      console.warn('Failed to generate social preview:', error);
      next();
    }
  };
};