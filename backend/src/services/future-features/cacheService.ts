// Cache configuration
interface CacheConfig {
  ttl: {
    discovery: number;        // 5 minutes for discovery results
    session: number;          // 10 minutes for individual sessions
    popular: number;          // 15 minutes for popular sessions
    location: number;         // 30 minutes for location data
    stats: number;            // 60 minutes for statistics
  };
  maxMemory: number;          // Maximum memory usage in MB
}

interface CacheItem {
  value: any;
  expires: number;
  accessCount: number;
  lastAccessed: number;
}

class CacheService {
  private memoryCache = new Map<string, CacheItem>();
  private config: CacheConfig;
  private totalMemoryUsage = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ttl: {
        discovery: 300,    // 5 minutes
        session: 600,      // 10 minutes
        popular: 900,      // 15 minutes
        location: 1800,    // 30 minutes
        stats: 3600,       // 60 minutes
      },
      maxMemory: 256,     // 256 MB
      ...config,
    };

    console.log('✅ In-memory cache service initialized');
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

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

  private evictLRU(): void {
    // Evict least recently used items when memory pressure is high
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let evictedCount = 0;
    let memoryFreed = 0;

    for (const [key, item] of entries) {
      if (this.totalMemoryUsage <= this.config.maxMemory * 1024 * 1024 * 0.8) break;

      this.memoryCache.delete(key);
      memoryFreed += this.estimateSize(item.value);
      this.totalMemoryUsage -= this.estimateSize(item.value);
      evictedCount++;
    }

    if (evictedCount > 0) {
      console.log(`🗑️ Memory pressure: evicted ${evictedCount} items, freed ${Math.round(memoryFreed / 1024 / 1024)}MB`);
    }
  }

  private estimateSize(obj: any): number {
    // Rough estimation of object size in bytes
    const str = JSON.stringify(obj);
    return str ? str.length * 2 : 1000; // Rough estimate
  }

  // Generic cache methods
  async get<T>(key: string): Promise<T | null> {
    const item = this.memoryCache.get(key);
    if (!item) return null;

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

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const now = Date.now();
    const expires = ttl ? now + (ttl * 1000) : now + (300 * 1000); // Default 5 minutes

    const item: CacheItem = {
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

  async delete(key: string): Promise<void> {
    const item = this.memoryCache.get(key);
    if (item) {
      this.totalMemoryUsage -= this.estimateSize(item.value);
      this.memoryCache.delete(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    const item = this.memoryCache.get(key);
    if (!item) return false;

    if (Date.now() > item.expires) {
      this.memoryCache.delete(key);
      this.totalMemoryUsage -= this.estimateSize(item.value);
      return false;
    }

    return true;
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.memoryCache.clear();
      this.totalMemoryUsage = 0;
      return;
    }

    // Simple pattern matching
    const keysToDelete: string[] = [];
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
  async getDiscoveryResults(
    filters: Record<string, any>,
    userLocation?: { latitude: number; longitude: number }
  ): Promise<any> {
    const cacheKey = this.generateDiscoveryCacheKey(filters, userLocation);
    return this.get(cacheKey);
  }

  async setDiscoveryResults(
    filters: Record<string, any>,
    userLocation: { latitude: number; longitude: number } | undefined,
    results: any
  ): Promise<void> {
    const cacheKey = this.generateDiscoveryCacheKey(filters, userLocation);
    await this.set(cacheKey, results, this.config.ttl.discovery);
  }

  async invalidateDiscoveryCache(): Promise<void> {
    await this.clear('discovery:*');
  }

  // Session-specific cache methods
  async getSession(sessionId: string): Promise<any> {
    const cacheKey = `session:${sessionId}`;
    return this.get(cacheKey);
  }

  async setSession(sessionId: string, sessionData: any): Promise<void> {
    const cacheKey = `session:${sessionId}`;
    await this.set(cacheKey, sessionData, this.config.ttl.session);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const cacheKey = `session:${sessionId}`;
    await this.delete(cacheKey);
  }

  // Popular sessions cache
  async getPopularSessions(): Promise<any> {
    const cacheKey = 'popular:sessions';
    return this.get(cacheKey);
  }

  async setPopularSessions(sessions: any): Promise<void> {
    const cacheKey = 'popular:sessions';
    await this.set(cacheKey, sessions, this.config.ttl.popular);
  }

  // Location-based cache
  async getNearbySessions(latitude: number, longitude: number, radius: number): Promise<any> {
    const cacheKey = `location:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radius}`;
    return this.get(cacheKey);
  }

  async setNearbySessions(
    latitude: number,
    longitude: number,
    radius: number,
    sessions: any
  ): Promise<void> {
    const cacheKey = `location:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radius}`;
    await this.set(cacheKey, sessions, this.config.ttl.location);
  }

  // Statistics cache
  async getStats(): Promise<any> {
    const cacheKey = 'stats:general';
    return this.get(cacheKey);
  }

  async setStats(stats: any): Promise<void> {
    const cacheKey = 'stats:general';
    await this.set(cacheKey, stats, this.config.ttl.stats);
  }

  // Cache key generation
  private generateDiscoveryCacheKey(
    filters: Record<string, any>,
    userLocation?: { latitude: number; longitude: number }
  ): string {
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
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
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
  async disconnect(): Promise<void> {
    this.memoryCache.clear();
    this.totalMemoryUsage = 0;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;