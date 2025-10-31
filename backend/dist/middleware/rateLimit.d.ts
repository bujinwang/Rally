import { Request, Response, NextFunction } from 'express';
interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string | null;
        role: string;
    };
}
interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (req: AuthRequest) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    message?: string;
    statusCode?: number;
    headers?: boolean;
}
export declare const rateLimit: (options: RateLimitOptions) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createRateLimiters: () => {
    auth: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    api: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    public: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    sensitive: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    custom: (options: Partial<RateLimitOptions>) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
export declare const getRateLimitStatus: (req: AuthRequest) => Promise<{
    limit: number;
    remaining: number;
    resetTime: number;
    isLimited: boolean;
} | null>;
export declare const rateLimitHealthCheck: () => Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    details: any;
}>;
export {};
//# sourceMappingURL=rateLimit.d.ts.map