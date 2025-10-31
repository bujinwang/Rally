export interface DiscoveryFilters {
    latitude?: number;
    longitude?: number;
    radius?: number;
    startTime?: Date;
    endTime?: Date;
    skillLevel?: string;
    minPlayers?: number;
    maxPlayers?: number;
    courtType?: string;
    limit?: number;
    offset?: number;
}
export interface DiscoveryResult {
    id: string;
    name: string;
    location: string;
    distance?: number;
    scheduledAt: Date;
    currentPlayers: number;
    maxPlayers: number;
    skillLevel?: string;
    courtType?: string;
    organizerName: string;
    visibility: string;
    relevanceScore: number;
}
export interface DiscoveryResponse {
    sessions: DiscoveryResult[];
    totalCount: number;
    searchRadius?: number;
    filters: DiscoveryFilters;
}
export declare class DiscoveryService {
    private static readonly EARTH_RADIUS_KM;
    /**
     * Calculate distance between two GPS coordinates using Haversine formula
     */
    private static calculateDistance;
    private static toRadians;
    /**
     * Calculate relevance score for a session based on user preferences
     */
    private static calculateRelevanceScore;
    /**
      * Discover sessions based on filters
      */
    static discoverSessions(filters: DiscoveryFilters): Promise<DiscoveryResponse>;
    /**
      * Get session details for discovery view
      */
    static getSessionForDiscovery(sessionId: string, userLat?: number, userLon?: number): Promise<DiscoveryResult | null>;
    /**
     * Invalidate discovery cache when sessions change
     */
    static invalidateDiscoveryCache(): Promise<void>;
    /**
     * Invalidate session cache when a specific session changes
     */
    static invalidateSessionCache(sessionId: string): Promise<void>;
    /**
     * Get popular sessions with caching
     */
    static getPopularSessions(limit?: number): Promise<DiscoveryResult[]>;
    /**
     * Get nearby sessions with caching
     */
    static getNearbySessions(latitude: number, longitude: number, radius?: number, limit?: number): Promise<DiscoveryResult[]>;
}
//# sourceMappingURL=discoveryService.d.ts.map