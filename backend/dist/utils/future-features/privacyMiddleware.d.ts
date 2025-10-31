import { Request, Response, NextFunction } from 'express';
export interface PrivacyCheckOptions {
    contentType: 'session' | 'match' | 'achievement';
    entityId: string;
    sharerId: string;
}
/**
 * Middleware to check privacy settings before allowing sharing
 */
export declare const checkPrivacyMiddleware: (options: PrivacyCheckOptions) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Middleware to validate share permissions based on content ownership
 */
export declare const validateShareOwnership: (contentType: string) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to generate social preview metadata
 */
export declare const generatePreviewMiddleware: () => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=privacyMiddleware.d.ts.map