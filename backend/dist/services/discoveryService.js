"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryService = void 0;
const client_1 = require("@prisma/client");
const cacheService_1 = require("./cacheService");
const performanceService_1 = require("./performanceService");
const prisma = new client_1.PrismaClient();
class DiscoveryService {
    /**
     * Calculate distance between two GPS coordinates using Haversine formula
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.EARTH_RADIUS_KM * c;
    }
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    /**
     * Calculate relevance score for a session based on user preferences
     */
    static calculateRelevanceScore(session, filters, distance) {
        let score = 100; // Base score
        // Distance factor (40% weight)
        if (distance !== undefined && filters.latitude && filters.longitude) {
            const maxDistance = filters.radius || 50; // Default 50km
            const distanceScore = Math.max(0, (maxDistance - distance) / maxDistance);
            score -= (40 * (1 - distanceScore));
        }
        // Time factor (30% weight)
        if (filters.startTime || filters.endTime) {
            const sessionTime = new Date(session.scheduledAt);
            const now = new Date();
            if (sessionTime < now) {
                score -= 30; // Past sessions get penalty
            }
            else {
                const hoursUntilSession = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                if (hoursUntilSession <= 24) {
                    // Sessions within 24 hours get bonus
                    score += 10;
                }
            }
        }
        // Skill level match (20% weight)
        if (filters.skillLevel && session.skillLevel) {
            if (filters.skillLevel === session.skillLevel) {
                score += 20;
            }
            else {
                score -= 10; // Partial penalty for mismatch
            }
        }
        // Availability factor (10% weight)
        const playerCount = session.players?.length || 0;
        const availabilityRatio = playerCount / session.maxPlayers;
        if (availabilityRatio < 0.8) {
            score += 10; // Bonus for sessions with room
        }
        return Math.max(0, Math.min(100, score));
    }
    /**
      * Discover sessions based on filters
      */
    static async discoverSessions(filters) {
        const startTime = Date.now();
        try {
            // Check cache first
            const userLocation = filters.latitude && filters.longitude
                ? { latitude: filters.latitude, longitude: filters.longitude }
                : undefined;
            const cachedResult = await cacheService_1.cacheService.getDiscoveryResults(filters, userLocation);
            if (cachedResult) {
                console.log('✅ Discovery cache hit');
                performanceService_1.performanceService.recordCacheHit();
                return cachedResult;
            }
            console.log('📡 Discovery cache miss, querying database');
            performanceService_1.performanceService.recordCacheMiss();
            const { latitude, longitude, radius = 50, // Default 50km radius
            startTime, endTime, skillLevel, minPlayers, maxPlayers, courtType, limit = 20, offset = 0 } = filters;
            // Build where clause
            const where = {
                status: 'ACTIVE',
                visibility: 'public' // Only show public sessions by default
            };
            // Location-based filtering
            if (latitude && longitude) {
                // Note: This is a simplified approach. In production, you'd use PostGIS or similar
                // For now, we'll filter sessions that have coordinates and calculate distance later
                where.latitude = { not: null };
                where.longitude = { not: null };
            }
            // Time filtering
            if (startTime || endTime) {
                where.scheduledAt = {};
                if (startTime)
                    where.scheduledAt.gte = startTime;
                if (endTime)
                    where.scheduledAt.lte = endTime;
            }
            // Skill level filtering
            if (skillLevel) {
                where.skillLevel = skillLevel;
            }
            // Court type filtering
            if (courtType) {
                where.courtType = courtType;
            }
            // Get sessions with player count
            const sessions = await prisma.mvpSession.findMany({
                where,
                include: {
                    players: {
                        where: { status: 'ACTIVE' },
                        select: { id: true }
                    }
                },
                orderBy: { scheduledAt: 'asc' },
                take: limit,
                skip: offset
            });
            // Filter by player count and calculate distances/relevance
            let filteredSessions = sessions.filter((session) => {
                const playerCount = session.players?.length || 0;
                // Player count filtering
                if (minPlayers && playerCount < minPlayers)
                    return false;
                if (maxPlayers && playerCount > maxPlayers)
                    return false;
                return true;
            });
            // Calculate distances and relevance scores
            const results = [];
            for (const session of filteredSessions) {
                let distance;
                if (latitude && longitude && session.latitude && session.longitude) {
                    distance = this.calculateDistance(latitude, longitude, session.latitude, session.longitude);
                    // Filter by radius
                    if (distance > radius)
                        continue;
                }
                const relevanceScore = this.calculateRelevanceScore(session, filters, distance);
                results.push({
                    id: session.id,
                    name: session.name,
                    location: session.location || 'Location not specified',
                    distance,
                    scheduledAt: session.scheduledAt,
                    currentPlayers: session.players?.length || 0,
                    maxPlayers: session.maxPlayers,
                    skillLevel: session.skillLevel || undefined,
                    courtType: session.courtType || undefined,
                    organizerName: session.ownerName,
                    visibility: session.visibility || 'public',
                    relevanceScore
                });
            }
            // Sort by relevance score (descending)
            results.sort((a, b) => b.relevanceScore - a.relevanceScore);
            // Get total count for pagination
            const totalCount = await prisma.mvpSession.count({ where });
            const response = {
                sessions: results,
                totalCount,
                searchRadius: latitude && longitude ? radius : undefined,
                filters
            };
            // Cache the result
            await cacheService_1.cacheService.setDiscoveryResults(filters, userLocation, response);
            console.log('💾 Discovery result cached');
            // Performance monitoring
            const executionTime = Date.now() - startTime;
            console.log(`⚡ Discovery query completed in ${executionTime}ms, returned ${results.length} sessions`);
            if (executionTime > 1000) {
                console.warn(`🐌 Slow discovery query detected: ${executionTime}ms`);
            }
            return response;
        }
        catch (error) {
            console.error('Error discovering sessions:', error);
            throw new Error('Failed to discover sessions');
        }
    }
    /**
      * Get session details for discovery view
      */
    static async getSessionForDiscovery(sessionId, userLat, userLon) {
        try {
            // Check cache first
            const cachedSession = await cacheService_1.cacheService.getSession(sessionId);
            if (cachedSession) {
                console.log('✅ Session cache hit for discovery');
                return cachedSession;
            }
            console.log('📡 Session cache miss, querying database');
            const session = await prisma.mvpSession.findUnique({
                where: { id: sessionId },
                include: {
                    players: {
                        where: { status: 'ACTIVE' },
                        select: { id: true }
                    }
                }
            });
            if (!session || session.status !== 'ACTIVE') {
                return null;
            }
            let distance;
            if (userLat && userLon && session.latitude && session.longitude) {
                distance = this.calculateDistance(userLat, userLon, session.latitude, session.longitude);
            }
            const result = {
                id: session.id,
                name: session.name,
                location: session.location || 'Location not specified',
                distance,
                scheduledAt: session.scheduledAt,
                currentPlayers: session.players?.length || 0,
                maxPlayers: session.maxPlayers,
                skillLevel: session.skillLevel || undefined,
                courtType: session.courtType || undefined,
                organizerName: session.ownerName,
                visibility: session.visibility || 'public',
                relevanceScore: 100 // Full relevance for direct lookup
            };
            // Cache the result
            await cacheService_1.cacheService.setSession(sessionId, result);
            console.log('💾 Session cached for discovery');
            return result;
        }
        catch (error) {
            console.error('Error getting session for discovery:', error);
            throw new Error('Failed to get session details');
        }
    }
    /**
     * Invalidate discovery cache when sessions change
     */
    static async invalidateDiscoveryCache() {
        try {
            await cacheService_1.cacheService.invalidateDiscoveryCache();
            console.log('🗑️ Discovery cache invalidated');
        }
        catch (error) {
            console.error('Error invalidating discovery cache:', error);
        }
    }
    /**
     * Invalidate session cache when a specific session changes
     */
    static async invalidateSessionCache(sessionId) {
        try {
            await cacheService_1.cacheService.invalidateSession(sessionId);
            console.log(`🗑️ Session cache invalidated for ${sessionId}`);
        }
        catch (error) {
            console.error('Error invalidating session cache:', error);
        }
    }
    /**
     * Get popular sessions with caching
     */
    static async getPopularSessions(limit = 10) {
        try {
            // Check cache first
            const cachedPopular = await cacheService_1.cacheService.getPopularSessions();
            if (cachedPopular) {
                console.log('✅ Popular sessions cache hit');
                return cachedPopular;
            }
            console.log('📡 Popular sessions cache miss, querying database');
            // Get sessions with most players, ordered by player count and recency
            const sessions = await prisma.mvpSession.findMany({
                where: {
                    status: 'ACTIVE',
                    scheduledAt: {
                        gte: new Date() // Only future sessions
                    }
                },
                include: {
                    players: {
                        where: { status: 'ACTIVE' },
                        select: { id: true }
                    }
                },
                orderBy: [
                    { players: { _count: 'desc' } }, // Most players first
                    { scheduledAt: 'asc' } // Soonest first
                ],
                take: limit
            });
            const results = sessions.map((session) => ({
                id: session.id,
                name: session.name,
                location: session.location || 'Location not specified',
                scheduledAt: session.scheduledAt,
                currentPlayers: session.players?.length || 0,
                maxPlayers: session.maxPlayers,
                skillLevel: session.skillLevel || undefined,
                courtType: session.courtType || undefined,
                organizerName: session.ownerName,
                visibility: session.visibility || 'public',
                relevanceScore: 90 // High relevance for popular sessions
            }));
            // Cache the result
            await cacheService_1.cacheService.setPopularSessions(results);
            console.log('💾 Popular sessions cached');
            return results;
        }
        catch (error) {
            console.error('Error getting popular sessions:', error);
            throw new Error('Failed to get popular sessions');
        }
    }
    /**
     * Get nearby sessions with caching
     */
    static async getNearbySessions(latitude, longitude, radius = 50, limit = 20) {
        try {
            // Check cache first
            const cachedNearby = await cacheService_1.cacheService.getNearbySessions(latitude, longitude, radius);
            if (cachedNearby) {
                console.log('✅ Nearby sessions cache hit');
                return cachedNearby;
            }
            console.log('📡 Nearby sessions cache miss, querying database');
            // Get sessions within radius
            const sessions = await prisma.mvpSession.findMany({
                where: {
                    status: 'ACTIVE',
                    latitude: { not: null },
                    longitude: { not: null },
                    scheduledAt: {
                        gte: new Date() // Only future sessions
                    }
                },
                include: {
                    players: {
                        where: { status: 'ACTIVE' },
                        select: { id: true }
                    }
                },
                take: limit * 2 // Get more to filter by distance
            });
            // Filter by actual distance and sort by proximity
            const results = [];
            for (const session of sessions) {
                if (session.latitude && session.longitude) {
                    const distance = this.calculateDistance(latitude, longitude, session.latitude, session.longitude);
                    if (distance <= radius) {
                        results.push({
                            id: session.id,
                            name: session.name,
                            location: session.location || 'Location not specified',
                            distance,
                            scheduledAt: session.scheduledAt,
                            currentPlayers: session.players?.length || 0,
                            maxPlayers: session.maxPlayers,
                            skillLevel: session.skillLevel || undefined,
                            courtType: session.courtType || undefined,
                            organizerName: session.ownerName,
                            visibility: session.visibility || 'public',
                            relevanceScore: Math.max(0, 100 - (distance / radius) * 50) // Distance-based relevance
                        });
                    }
                }
            }
            // Sort by distance
            results.sort((a, b) => (a.distance || 0) - (b.distance || 0));
            // Limit results
            const finalResults = results.slice(0, limit);
            // Cache the result
            await cacheService_1.cacheService.setNearbySessions(latitude, longitude, radius, finalResults);
            console.log('💾 Nearby sessions cached');
            return finalResults;
        }
        catch (error) {
            console.error('Error getting nearby sessions:', error);
            throw new Error('Failed to get nearby sessions');
        }
    }
}
exports.DiscoveryService = DiscoveryService;
DiscoveryService.EARTH_RADIUS_KM = 6371; // Earth's radius in kilometers
//# sourceMappingURL=discoveryService.js.map