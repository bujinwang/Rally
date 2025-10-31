"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
class CacheService {
    constructor(config) {
        this.memoryCache = new Map();
        this.totalMemoryUsage = 0;
        this.config = {
            ttl: {
                discovery: 300, // 5 minutes
                session: 600, // 10 minutes
                popular: 900, // 15 minutes
                location: 1800, // 30 minutes
                stats: 3600, // 60 minutes
            },
            maxMemory: 256, // 256 MB
            ...config,
        };
        console.log('✅ In-memory cache service initialized');
        this.startCleanupInterval();
    }
    startCleanupInterval() {
        // Clean up expired entries every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }
    cleanup() {
        const now = Date.now();
        const keysToDelete = [];
        for (const [key, item] of this.memoryCache.entries()) {
            if (now > item.expires) {
                keysToDelete.push(key);
                this.totalMemoryUsage -= this.estimateSize(item.value);
            }
        }
        keysToDelete.forEach(key => this.memoryCache.delete(key));
        if (keysToDelete.length > 0) {
            console.log(`🧹 Cache cleanup: removed ${keysToDelete.length} expired entries`);
        }
        // Memory pressure management
        if (this.totalMemoryUsage > this.config.maxMemory * 1024 * 1024) {
            this.evictLRU();
        }
    }
    evictLRU() {
        // Evict least recently used items when memory pressure is high
        const entries = Array.from(this.memoryCache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        let evictedCount = 0;
        let memoryFreed = 0;
        for (const [key, item] of entries) {
            if (this.totalMemoryUsage <= this.config.maxMemory * 1024 * 1024 * 0.8)
                break;
            this.memoryCache.delete(key);
            memoryFreed += this.estimateSize(item.value);
            this.totalMemoryUsage -= this.estimateSize(item.value);
            evictedCount++;
        }
        if (evictedCount > 0) {
            console.log(`🗑️ Memory pressure: evicted ${evictedCount} items, freed ${Math.round(memoryFreed / 1024 / 1024)}MB`);
        }
    }
    estimateSize(obj) {
        // Rough estimation of object size in bytes
        const str = JSON.stringify(obj);
        return str ? str.length * 2 : 1000; // Rough estimate
    }
    // Generic cache methods
    async get(key) {
        const item = this.memoryCache.get(key);
        if (!item)
            return null;
        const now = Date.now();
        if (now > item.expires) {
            this.memoryCache.delete(key);
            this.totalMemoryUsage -= this.estimateSize(item.value);
            return null;
        }
        // Update access statistics
        item.accessCount++;
        item.lastAccessed = now;
        return item.value;
    }
    async set(key, value, ttl) {
        const now = Date.now();
        const expires = ttl ? now + (ttl * 1000) : now + (300 * 1000); // Default 5 minutes
        const item = {
            value,
            expires,
            accessCount: 0,
            lastAccessed: now,
        };
        // Remove old item if it exists
        const oldItem = this.memoryCache.get(key);
        if (oldItem) {
            this.totalMemoryUsage -= this.estimateSize(oldItem.value);
        }
        this.memoryCache.set(key, item);
        this.totalMemoryUsage += this.estimateSize(value);
        // Check memory pressure
        if (this.totalMemoryUsage > this.config.maxMemory * 1024 * 1024) {
            this.evictLRU();
        }
    }
    async delete(key) {
        const item = this.memoryCache.get(key);
        if (item) {
            this.totalMemoryUsage -= this.estimateSize(item.value);
            this.memoryCache.delete(key);
        }
    }
    async exists(key) {
        const item = this.memoryCache.get(key);
        if (!item)
            return false;
        if (Date.now() > item.expires) {
            this.memoryCache.delete(key);
            this.totalMemoryUsage -= this.estimateSize(item.value);
            return false;
        }
        return true;
    }
    async clear(pattern) {
        if (!pattern) {
            this.memoryCache.clear();
            this.totalMemoryUsage = 0;
            return;
        }
        // Simple pattern matching
        const keysToDelete = [];
        for (const key of this.memoryCache.keys()) {
            if (key.includes(pattern.replace('*', ''))) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => {
            const item = this.memoryCache.get(key);
            if (item) {
                this.totalMemoryUsage -= this.estimateSize(item.value);
                this.memoryCache.delete(key);
            }
        });
    }
    // Discovery-specific cache methods
    async getDiscoveryResults(filters, userLocation) {
        const cacheKey = this.generateDiscoveryCacheKey(filters, userLocation);
        return this.get(cacheKey);
    }
    async setDiscoveryResults(filters, userLocation, results) {
        const cacheKey = this.generateDiscoveryCacheKey(filters, userLocation);
        await this.set(cacheKey, results, this.config.ttl.discovery);
    }
    async invalidateDiscoveryCache() {
        await this.clear('discovery:*');
    }
    // Session-specific cache methods
    async getSession(sessionId) {
        const cacheKey = `session:${sessionId}`;
        return this.get(cacheKey);
    }
    async setSession(sessionId, sessionData) {
        const cacheKey = `session:${sessionId}`;
        await this.set(cacheKey, sessionData, this.config.ttl.session);
    }
    async invalidateSession(sessionId) {
        const cacheKey = `session:${sessionId}`;
        await this.delete(cacheKey);
    }
    // Popular sessions cache
    async getPopularSessions() {
        const cacheKey = 'popular:sessions';
        return this.get(cacheKey);
    }
    async setPopularSessions(sessions) {
        const cacheKey = 'popular:sessions';
        await this.set(cacheKey, sessions, this.config.ttl.popular);
    }
    // Location-based cache
    async getNearbySessions(latitude, longitude, radius) {
        const cacheKey = `location:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radius}`;
        return this.get(cacheKey);
    }
    async setNearbySessions(latitude, longitude, radius, sessions) {
        const cacheKey = `location:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radius}`;
        await this.set(cacheKey, sessions, this.config.ttl.location);
    }
    // Statistics cache
    async getStats() {
        const cacheKey = 'stats:general';
        return this.get(cacheKey);
    }
    async setStats(stats) {
        const cacheKey = 'stats:general';
        await this.set(cacheKey, stats, this.config.ttl.stats);
    }
    // Cache key generation
    generateDiscoveryCacheKey(filters, userLocation) {
        const filterParts = Object.entries(filters)
            .filter(([_, value]) => value !== undefined && value !== null)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
        const locationPart = userLocation
            ? `loc:${userLocation.latitude.toFixed(2)}:${userLocation.longitude.toFixed(2)}`
            : 'loc:none';
        return `discovery:${locationPart}:${filterParts}`;
    }
    // Health check
    async healthCheck() {
        return {
            status: 'healthy',
            details: {
                message: 'In-memory cache operational',
                entries: this.memoryCache.size,
                memoryUsage: `${Math.round(this.totalMemoryUsage / 1024 / 1024)}MB`,
                maxMemory: `${this.config.maxMemory}MB`
            }
        };
    }
    // Cleanup
    async disconnect() {
        this.memoryCache.clear();
        this.totalMemoryUsage = 0;
    }
}
// Export singleton instance
exports.cacheService = new CacheService();
exports.default = exports.cacheService;
//# sourceMappingURL=cacheService.js.map