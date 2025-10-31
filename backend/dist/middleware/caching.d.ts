import { Request, Response, NextFunction } from 'express';
interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string | null;
        role: string;
    };
}
interface CacheOptions {
    ttl?: number;
    keyGenerator?: (req: AuthRequest) => string;
    skipCache?: (req: AuthRequest) => boolean;
}
export declare const cachingMiddleware: (options?: CacheOptions) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const cacheInvalidationMiddleware: (patterns: string[]) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const cacheWarmingMiddleware: (endpoints: Array<{
    path: string;
    method: string;
    warmOnStart?: boolean;
}>) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const cacheHealthCheck: () => Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    details: any;
}>;
export {};
//# sourceMappingURL=caching.d.ts.map