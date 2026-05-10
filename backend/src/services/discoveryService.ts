import { PrismaClient, MvpSession } from '@prisma/client';
import { cacheService } from './cacheService';
import { PerformanceService } from './performanceService';

const prisma = new PrismaClient();

export interface DiscoveryFilters {
  latitude?: number;
  longitude?: number;
  radius?: number;
  location?: string;
  startTime?: Date;
  endTime?: Date;
  skillLevel?: string;
  sport?: string;
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
  clubAffiliation?: string;
  dropInFee?: number;
  invitationRequired: boolean;
  sport?: string;
  depositRequired: boolean;
  depositAmount?: number;
  relevanceScore: number;
}

export interface DiscoveryResponse {
  sessions: DiscoveryResult[];
  totalCount: number;
  searchRadius?: number;
  filters: DiscoveryFilters;
}

export class DiscoveryService {
  private static readonly EARTH_RADIUS_KM = 6371; // Earth's radius in kilometers

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   */
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.EARTH_RADIUS_KM * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calculate relevance score for a session based on user preferences
   */
  private static calculateRelevanceScore(
    session: MvpSession,
    filters: DiscoveryFilters,
    distance?: number
  ): number {
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
      } else {
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
      } else {
        score -= 10; // Partial penalty for mismatch
      }
    }

    // Availability factor (10% weight)
    const playerCount = (session as any).players?.length || 0;
    const availabilityRatio = playerCount / session.maxPlayers;
    if (availabilityRatio < 0.8) {
      score += 10; // Bonus for sessions with room
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
    * Discover sessions based on filters
    */
  static async discoverSessions(filters: DiscoveryFilters): Promise<DiscoveryResponse> {
    const perfStartTime: number = Date.now();

    try {
      // Check cache first
      const userLocation = filters.latitude && filters.longitude
        ? { latitude: filters.latitude, longitude: filters.longitude }
        : undefined;

      const cachedResult = await cacheService.getDiscoveryResults(filters, userLocation);
      if (cachedResult) {
        console.log('✅ Discovery cache hit');
        // performanceService.recordCacheHit(); // Feature not yet implemented
        return cachedResult;
      }

      console.log('📡 Discovery cache miss, querying database');
      // performanceService.recordCacheMiss(); // Feature not yet implemented

      const {
        latitude,
        longitude,
        radius = 50, // Default 50km radius
        startTime,
        endTime,
        skillLevel,
        minPlayers,
        maxPlayers,
        courtType,
        limit = 20,
        offset = 0
      } = filters;

      // Build where clause
      const where: any = {
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
        if (startTime) where.scheduledAt.gte = startTime;
        if (endTime) where.scheduledAt.lte = endTime;
      }

      // Skill level filtering
      if (skillLevel) {
        where.skillLevel = skillLevel;
      }

      // Court type filtering
      if (courtType) {
        where.courtType = courtType;
      }

      // Location text search — matches venue name, address, or location field
      if (filters.location) {
        const searchTerm = filters.location;
        where.OR = [
          { location: { contains: searchTerm } },
          { venueName: { contains: searchTerm } },
          { venueAddress: { contains: searchTerm } },
        ];
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
      let filteredSessions = sessions.filter((session: any) => {
        const playerCount = (session.players as any[])?.length || 0;

        // Player count filtering
        if (minPlayers && playerCount < minPlayers) return false;
        if (maxPlayers && playerCount > maxPlayers) return false;

        return true;
      });

      // Calculate distances and relevance scores
      const results: DiscoveryResult[] = [];
      for (const session of filteredSessions as any[]) {
        let distance: number | undefined;
        if (latitude && longitude && session.latitude && session.longitude) {
          distance = this.calculateDistance(latitude, longitude, session.latitude, session.longitude);
          // Filter by radius
          if (distance > radius) continue;
        }

        const relevanceScore = this.calculateRelevanceScore(session, filters, distance);

        results.push({
          id: session.id,
          name: session.name,
          location: session.location || 'Location not specified',
          distance,
          scheduledAt: session.scheduledAt,
          currentPlayers: (session as any).players?.length || 0,
          maxPlayers: session.maxPlayers,
          skillLevel: session.skillLevel || undefined,
          courtType: session.courtType || undefined,
          organizerName: session.ownerName,
          visibility: session.visibility || 'public',
          clubAffiliation: (session as any).clubAffiliation || undefined,
          dropInFee: (session as any).dropInFee || undefined,
          invitationRequired: (session as any).invitationRequired || false,
          depositRequired: (session as any).depositRequired || false,
          depositAmount: (session as any).depositAmount || undefined,
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
      await cacheService.setDiscoveryResults(filters, userLocation, response);
      console.log('💾 Discovery result cached');

      // Performance monitoring
      const executionTime = Date.now() - perfStartTime;
      console.log(`⚡ Discovery query completed in ${executionTime}ms, returned ${results.length} sessions`);

      if (executionTime > 1000) {
        console.warn(`🐌 Slow discovery query detected: ${executionTime}ms`);
      }

      return response;
    } catch (error) {
      console.error('Error discovering sessions:', error);
      throw new Error('Failed to discover sessions');
    }
  }

  /**
    * Get session details for discovery view
    */
  static async getSessionForDiscovery(sessionId: string, userLat?: number, userLon?: number): Promise<DiscoveryResult | null> {
    try {
      // Check cache first
      const cachedSession = await cacheService.getSession(sessionId);
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

      let distance: number | undefined;
      if (userLat && userLon && (session as any).latitude && (session as any).longitude) {
        distance = this.calculateDistance(userLat, userLon, (session as any).latitude, (session as any).longitude);
      }

      const result = {
        id: session.id,
        name: session.name,
        location: session.location || 'Location not specified',
        distance,
        scheduledAt: session.scheduledAt,
        currentPlayers: (session as any).players?.length || 0,
        maxPlayers: session.maxPlayers,
        skillLevel: session.skillLevel || undefined,
        courtType: (session as any).courtType || undefined,
        organizerName: session.ownerName,
        visibility: (session as any).visibility || 'public',
        clubAffiliation: (session as any).clubAffiliation || undefined,
        dropInFee: (session as any).dropInFee || undefined,
        invitationRequired: (session as any).invitationRequired || false,
          depositRequired: (session as any).depositRequired || false,
          depositAmount: (session as any).depositAmount || undefined,
        relevanceScore: 100 // Full relevance for direct lookup
      };

      // Cache the result
      await cacheService.setSession(sessionId, result);
      console.log('💾 Session cached for discovery');

      return result;
    } catch (error) {
      console.error('Error getting session for discovery:', error);
      throw new Error('Failed to get session details');
    }
  }

  /**
   * Invalidate discovery cache when sessions change
   */
  static async invalidateDiscoveryCache(): Promise<void> {
    try {
      await cacheService.invalidateDiscoveryCache();
      console.log('🗑️ Discovery cache invalidated');
    } catch (error) {
      console.error('Error invalidating discovery cache:', error);
    }
  }

  /**
   * Invalidate session cache when a specific session changes
   */
  static async invalidateSessionCache(sessionId: string): Promise<void> {
    try {
      await cacheService.invalidateSession(sessionId);
      console.log(`🗑️ Session cache invalidated for ${sessionId}`);
    } catch (error) {
      console.error('Error invalidating session cache:', error);
    }
  }

  /**
   * Get popular sessions with caching
   */
  static async getPopularSessions(limit: number = 10): Promise<DiscoveryResult[]> {
    try {
      // Check cache first
      const cachedPopular = await cacheService.getPopularSessions();
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
        } as any,
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

      const results: DiscoveryResult[] = sessions.map((session: any) => ({
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
          clubAffiliation: (session as any).clubAffiliation || undefined,
          dropInFee: (session as any).dropInFee || undefined,
          invitationRequired: (session as any).invitationRequired || false,
          depositRequired: (session as any).depositRequired || false,
          depositAmount: (session as any).depositAmount || undefined,
        relevanceScore: 90 // High relevance for popular sessions
      }));

      // Cache the result
      await cacheService.setPopularSessions(results);
      console.log('💾 Popular sessions cached');

      return results;
    } catch (error) {
      console.error('Error getting popular sessions:', error);
      throw new Error('Failed to get popular sessions');
    }
  }

  /**
   * Get nearby sessions with caching
   */
  static async getNearbySessions(
    latitude: number,
    longitude: number,
    radius: number = 50,
    limit: number = 20
  ): Promise<DiscoveryResult[]> {
    try {
      // Check cache first
      const cachedNearby = await cacheService.getNearbySessions(latitude, longitude, radius);
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
        } as any,
        include: {
          players: {
            where: { status: 'ACTIVE' },
            select: { id: true }
          }
        },
        take: limit * 2 // Get more to filter by distance
      });

      // Filter by actual distance and sort by proximity
      const results: DiscoveryResult[] = [];
      for (const session of sessions as any[]) {
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
          clubAffiliation: (session as any).clubAffiliation || undefined,
          dropInFee: (session as any).dropInFee || undefined,
          invitationRequired: (session as any).invitationRequired || false,
          depositRequired: (session as any).depositRequired || false,
          depositAmount: (session as any).depositAmount || undefined,
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
      await cacheService.setNearbySessions(latitude, longitude, radius, finalResults);
      console.log('💾 Nearby sessions cached');

      return finalResults;
    } catch (error) {
      console.error('Error getting nearby sessions:', error);
      throw new Error('Failed to get nearby sessions');
    }
  }
  
  /**
   * Search sessions by text query + filters
   */
  static async searchSessions(query: string, filters: DiscoveryFilters): Promise<DiscoveryResponse> {
    try {
      const whereClause: any = {
        status: 'ACTIVE',
        scheduledAt: { gte: new Date() },
      };

      if (query) {
        whereClause.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { location: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }

      if (filters.sport) whereClause.sport = filters.sport;
      if (filters.skillLevel) whereClause.skillLevel = filters.skillLevel;

      const sessions = await prisma.mvpSession.findMany({
        where: whereClause,
        include: {
          players: {
            where: { status: { not: 'LEFT' } },
            select: { id: true, name: true, status: true, skillLevel: true },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: filters.limit || 20,
        skip: filters.offset || 0,
      });

      const totalCount = await prisma.mvpSession.count({ where: whereClause });

      const results = sessions.map(s => ({
        id: s.id,
        name: s.name,
        location: s.location || 'TBD',
        shareCode: s.shareCode,
        scheduledAt: s.scheduledAt,
        currentPlayers: s.players.length,
        maxPlayers: s.maxPlayers,
        skillLevel: s.skillLevel || undefined,
        sport: (s as any).sport || 'badminton',
        organizerName: s.ownerName,
        players: s.players,
        distance: undefined as number | undefined,
        relevanceScore: query ? 85 : 60,
      }));

      return { sessions: results as any, totalCount, filters };
    } catch (error) {
      console.error('Search error:', error);
      throw new Error('Search failed');
    }
  }

  /**
   * Get personalized session recommendations based on player habits
   */
  static async getRecommendedSessions(
    deviceId: string,
    latitude?: number,
    longitude?: number,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const pastPlayers = await prisma.mvpPlayer.findMany({
        where: { deviceId, status: { not: 'LEFT' } },
        include: { session: true },
        orderBy: { joinedAt: 'desc' },
        take: 20,
      });

      const sportCounts = new Map<string, number>();
      const skillCounts = new Map<string, number>();
      const locCounts = new Map<string, number>();

      for (const p of pastPlayers) {
        const sport = (p.session as any).sport || 'badminton';
        sportCounts.set(sport, (sportCounts.get(sport) || 0) + 1);
        if (p.skillLevel) skillCounts.set(p.skillLevel.toString(), (skillCounts.get(p.skillLevel.toString()) || 0) + 1);
        if ((p.session as any).location) locCounts.set((p.session as any).location, (locCounts.get((p.session as any).location) || 0) + 1);
      }

      let topSport = 'badminton', maxS = 0;
      for (const [s, c] of sportCounts) { if (c > maxS) { maxS = c; topSport = s; } }

      let topSkill: string | undefined, maxSk = 0;
      for (const [s, c] of skillCounts) { if (c > maxSk) { maxSk = c; topSkill = s; } }

      const where: any = { status: 'ACTIVE', scheduledAt: { gte: new Date() } };
      if (topSport) where.sport = topSport;
      if (topSkill) where.skillLevel = parseInt(topSkill);

      const sessions = await prisma.mvpSession.findMany({
        where,
        include: { players: { where: { status: { not: 'LEFT' } }, select: { id: true, name: true } } },
        orderBy: { scheduledAt: 'asc' },
        take: limit + 10,
      });

      const scored = sessions.map(s => {
        let score = 50;
        if ((s as any).sport === topSport) score += 20;
        if (s.skillLevel?.toString() === topSkill) score += 15;
        if (locCounts.has(s.location || '')) score += 10;
        const spots = s.maxPlayers - s.players.length;
        if (spots > 0) score += Math.min(spots, 5);

        let distance: number | undefined;
        if (latitude && longitude && (s as any).latitude && (s as any).longitude) {
          distance = DiscoveryService.calculateDistance(latitude, longitude, (s as any).latitude, (s as any).longitude);
          if (distance < 5) score += 20;
          else if (distance < 20) score += 10;
        }

        return {
          id: s.id, name: s.name, location: s.location || 'TBD', shareCode: s.shareCode,
          scheduledAt: s.scheduledAt, currentPlayers: s.players.length, maxPlayers: s.maxPlayers,
          skillLevel: s.skillLevel, sport: (s as any).sport || 'badminton',
          organizerName: s.ownerName, players: s.players, distance,
          relevanceScore: Math.min(100, score),
          matchReason: topSport === (s as any).sport ? 'Matches your ' + topSport + ' habit' : 'Near you',
        };
      });

      scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return scored.slice(0, limit);
    } catch (error) {
      console.error('Recommendations error:', error);
      throw new Error('Failed to get recommendations');
    }
  }
}
