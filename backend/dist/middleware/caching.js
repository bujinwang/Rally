"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheHealthCheck = exports.cacheWarmingMiddleware = exports.cacheInvalidationMiddleware = exports.cachingMiddleware = void 0;
const cacheService_1 = require("../services/cacheService");
const cachingMiddleware = (options = {}) => {
    return async (req, res, next) => {
        try {
            // Skip caching for non-GET requests
            if (req.method !== 'GET') {
                return next();
            }
            // Check if caching should be skipped for this request
            if (options.skipCache && options.skipCache(req)) {
                return next();
            }
            // Generate cache key
            const cacheKey = options.keyGenerator
                ? options.keyGenerator(req)
                : generateDefaultCacheKey(req);
            // Try to get cached response
            const cachedResponse = await cacheService_1.cacheService.get(cacheKey);
            if (cachedResponse) {
                // Return cached response
                res.set(cachedResponse.headers);
                res.status(cachedResponse.statusCode).json(cachedResponse.body);
                return;
            }
            // Store original response methods
            const originalJson = res.json;
            const originalStatus = res.status;
            const originalSet = res.set;
            const originalSend = res.send;
            let responseData = null;
            let statusCode = 200;
            const headers = {};
            // Override response methods to capture the response
            res.json = function (data) {
                responseData = data;
                return originalJson.call(this, data);
            };
            res.status = function (code) {
                statusCode = code;
                return originalStatus.call(this, code);
            };
            res.set = function (field, value) {
                if (typeof field === 'string' && value) {
                    headers[field] = value;
                }
                else if (typeof field === 'object') {
                    Object.assign(headers, field);
                }
                return originalSet.call(this, field, value);
            };
            res.send = function (data) {
                if (typeof data === 'object') {
                    responseData = data;
                }
                return originalSend.call(this, data);
            };
            // Override end method to cache the response
            const originalEnd = res.end;
            res.end = function (chunk, encoding) {
                // Cache successful responses only
                if (statusCode >= 200 && statusCode < 300 && responseData) {
                    const cacheData = {
                        body: responseData,
                        statusCode,
                        headers,
                        timestamp: Date.now()
                    };
                    // Cache asynchronously (don't wait for it)
                    cacheService_1.cacheService.set(cacheKey, cacheData, options.ttl || 300)
                        .catch(error => console.error('Cache write error:', error));
                }
                return originalEnd.call(this, chunk, encoding);
            };
            next();
        }
        catch (error) {
            console.error('Caching middleware error:', error);
            // Continue without caching on error
            next();
        }
    };
};
exports.cachingMiddleware = cachingMiddleware;
// Default cache key generator
function generateDefaultCacheKey(req) {
    const { method, originalUrl, user } = req;
    const userId = user?.id || 'anonymous';
    const queryString = Object.keys(req.query).length > 0
        ? `?${new URLSearchParams(req.query).toString()}`
        : '';
    return `http:${method}:${originalUrl}${queryString}:user:${userId}`;
}
// Cache invalidation middleware
const cacheInvalidationMiddleware = (patterns) => {
    return async (req, res, next) => {
        // Store original response methods
        const originalJson = res.json;
        const originalStatus = res.status;
        const originalSend = res.send;
        res.json = function (data) {
            // Invalidate cache patterns on successful mutations
            if (res.statusCode >= 200 && res.statusCode < 300) {
                patterns.forEach(pattern => {
                    cacheService_1.cacheService.clear(pattern).catch(error => console.error('Cache invalidation error:', error));
                });
            }
            return originalJson.call(this, data);
        };
        res.status = function (code) {
            // Store status for later use
            res._statusCode = code;
            return originalStatus.call(this, code);
        };
        res.send = function (data) {
            // Invalidate cache patterns on successful mutations
            const statusCode = res._statusCode || 200;
            if (statusCode >= 200 && statusCode < 300) {
                patterns.forEach(pattern => {
                    cacheService_1.cacheService.clear(pattern).catch(error => console.error('Cache invalidation error:', error));
                });
            }
            return originalSend.call(this, data);
        };
        next();
    };
};
exports.cacheInvalidationMiddleware = cacheInvalidationMiddleware;
// Cache warming middleware for frequently accessed endpoints
const cacheWarmingMiddleware = (endpoints) => {
    return async (req, res, next) => {
        // This middleware can be extended to warm caches based on usage patterns
        // For now, it just passes through
        next();
    };
};
exports.cacheWarmingMiddleware = cacheWarmingMiddleware;
// Health check for cache middleware
const cacheHealthCheck = async () => {
    try {
        const cacheHealth = await cacheService_1.cacheService.healthCheck();
        return {
            status: cacheHealth.status,
            details: {
                ...cacheHealth.details,
                middleware: 'operational'
            }
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            details: {
                middleware: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
};
exports.cacheHealthCheck = cacheHealthCheck;
//# sourceMappingURL=caching.js.map