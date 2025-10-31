interface CacheConfig {
    ttl: {
        discovery: number;
        session: number;
        popular: number;
        location: number;
        stats: number;
    };
    maxMemory: number;
}
declare class CacheService {
    private memoryCache;
    private config;
    private totalMemoryUsage;
    constructor(config?: Partial<CacheConfig>);
    private startCleanupInterval;
    private cleanup;
    private evictLRU;
    private estimateSize;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(pattern?: string): Promise<void>;
    getDiscoveryResults(filters: Record<string, any>, userLocation?: {
        latitude: number;
        longitude: number;
    }): Promise<any>;
    setDiscoveryResults(filters: Record<string, any>, userLocation: {
        latitude: number;
        longitude: number;
    } | undefined, results: any): Promise<void>;
    invalidateDiscoveryCache(): Promise<void>;
    getSession(sessionId: string): Promise<any>;
    setSession(sessionId: string, sessionData: any): Promise<void>;
    invalidateSession(sessionId: string): Promise<void>;
    getPopularSessions(): Promise<any>;
    setPopularSessions(sessions: any): Promise<void>;
    getNearbySessions(latitude: number, longitude: number, radius: number): Promise<any>;
    setNearbySessions(latitude: number, longitude: number, radius: number, sessions: any): Promise<void>;
    getStats(): Promise<any>;
    setStats(stats: any): Promise<void>;
    private generateDiscoveryCacheKey;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: any;
    }>;
    disconnect(): Promise<void>;
}
export declare const cacheService: CacheService;
export default cacheService;
//# sourceMappingURL=cacheService.d.ts.map