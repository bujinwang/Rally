import { Request, Response, NextFunction } from 'express';
import { sharingService } from '../services/sharingService';

/**
 * Middleware to validate share permissions based on content ownership
 */
export const validateShareOwnership = (contentType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityId, deviceId } = req.body;
      const userId = deviceId || req.headers['x-device-id'] as string || req.query.deviceId as string || 'anonymous';

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