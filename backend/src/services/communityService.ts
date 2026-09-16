import { prisma } from '../config/database';

export interface CommunityLeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number;
}

export interface TrendingSession {
  id: string;
  name: string;
  location: string;
  playerCount: number;
  maxPlayers: number;
  scheduledAt: Date;
  ownerName: string;
  shareCode: string;
}

export interface NearbyPlayer {
  id: string;
  name: string;
  gamesPlayed: number;
  winRate: number;
}

export interface VenueDirectoryEntry {
  name: string;
  address: string;
  sessionCount: number;
  upcomingSessions: number;
  latitude?: number;
  longitude?: number;
}

/**
 * Story 6.8 (D4) — Net Promoter Score input.
 *
 * `score` is the NPS 0–10 scale (promoters 9–10, passives 7–8, detractors 0–6).
 * This is a **different instrument** from CSAT (`TournamentFeedback.rating`,
 * 1–5) and must never be stored in `TournamentFeedback.rating`.
 */
export interface NpsResponseInput {
  score: number; // 0-10
  comment?: string;
}

/** Identity of the NPS respondent (platform-level, device or account). */
export interface NpsIdentity {
  userId?: string;
  deviceId?: string;
}

/** The created NPS row, projected to what the route returns. */
export interface NpsCreated {
  id: string;
  score: number;
}

/** Story 6.8 (D4) — aggregated NPS. */
export interface NpsSummary {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number;
}

export class CommunityService {
  /**
   * Get global community leaderboard across all sessions
   */
  static async getCommunityLeaderboard(
    sortBy: 'winRate' | 'matchWinRate' | 'wins' | 'gamesPlayed' = 'winRate',
    limit: number = 50,
    offset: number = 0
  ): Promise<CommunityLeaderboardEntry[]> {
    // Aggregate player stats across all MvpPlayers
    const players = await prisma.mvpPlayer.findMany({
      where: {
        OR: [
          { player1Matches: { some: {} } },
          { player2Matches: { some: {} } }
        ]
      },
      select: {
        id: true,
        name: true,
        gamesPlayed: true,
        wins: true,
        losses: true,
        matchesPlayed: true,
        matchWins: true,
        matchLosses: true,
        winRate: true,
        matchWinRate: true
      },
      orderBy: this.getSortOrder(sortBy),
      take: limit || 50,
      skip: offset || 0
    });

    return players.map((player, index) => ({
      rank: (offset || 0) + index + 1,
      playerId: player.id,
      playerName: player.name,
      gamesPlayed: player.gamesPlayed || 0,
      wins: player.wins || 0,
      losses: player.losses || 0,
      winRate: player.winRate || 0,
      matchesPlayed: player.matchesPlayed || 0,
      matchWins: player.matchWins || 0,
      matchLosses: player.matchLosses || 0,
      matchWinRate: player.matchWinRate || 0,
    }));
  }

  /**
   * Get total number of ranked community players
   */
  static async getCommunityLeaderboardCount(): Promise<number> {
    return prisma.mvpPlayer.count({
      where: {
        OR: [
          { player1Matches: { some: {} } },
          { player2Matches: { some: {} } }
        ]
      }
    });
  }

  /**
   * Get trending sessions (upcoming sessions with most players)
   */
  static async getTrendingSessions(limit: number = 10): Promise<TrendingSession[]> {
    const sessions = await prisma.mvpSession.findMany({
      where: {
        status: 'ACTIVE',
        scheduledAt: { gte: new Date() }
      },
      include: {
        players: {
          where: { status: 'ACTIVE' },
          select: { id: true }
        }
      },
      orderBy: [
        { players: { _count: 'desc' } },
        { scheduledAt: 'asc' }
      ],
      take: limit
    });

    return sessions.map(session => ({
      id: session.id,
      name: session.name,
      location: session.location || 'TBD',
      playerCount: session.players.length,
      maxPlayers: session.maxPlayers,
      scheduledAt: session.scheduledAt,
      ownerName: session.ownerName,
      shareCode: session.shareCode
    }));
  }

  /**
   * Get nearby active players (players in active sessions)
   */
  static async getNearbyPlayers(limit: number = 30): Promise<NearbyPlayer[]> {
    // Get players who are currently in ACTIVE sessions
    const players = await prisma.mvpPlayer.findMany({
      where: {
        sessionId: {
          in: (await prisma.mvpSession.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true }
          })).map(s => s.id)
        }
      },
      select: {
        id: true,
        name: true,
        gamesPlayed: true,
        winRate: true
      },
      orderBy: {
        gamesPlayed: 'desc'
      },
      take: limit
    });

    return players.map(p => ({
      id: p.id,
      name: p.name,
      gamesPlayed: p.gamesPlayed || 0,
      winRate: p.winRate || 0
    }));
  }

  /**
   * Get venue directory (unique venue locations from sessions)
   */
  static async getVenueDirectory(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ venues: VenueDirectoryEntry[]; totalCount: number }> {
    // Get all active/future sessions with locations
    const sessions = await prisma.mvpSession.findMany({
      where: {
        status: 'ACTIVE',
        scheduledAt: { gte: new Date() },
        NOT: { location: null }
      },
      select: {
        location: true,
        latitude: true,
        longitude: true,
        id: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    // Group by location name and count sessions per venue
    const venueMap = new Map<string, VenueDirectoryEntry>();

    for (const s of sessions) {
      const location = s.location || 'Unknown';
      const key = location.toLowerCase().trim();

      if (!venueMap.has(key)) {
        venueMap.set(key, {
          name: location,
          address: location,
          sessionCount: 0,
          upcomingSessions: 0,
          latitude: s.latitude || undefined,
          longitude: s.longitude || undefined
        });
      }

      const entry = venueMap.get(key)!;
      entry.sessionCount++;
      entry.upcomingSessions++;
    }

    const venues = Array.from(venueMap.values())
      .sort((a, b) => b.upcomingSessions - a.upcomingSessions)
      .slice(offset, offset + (limit || 50));

    return {
      venues,
      totalCount: venueMap.size
    };
  }

  /**
   * Story 6.8 (D4) — record a platform-level NPS response.
   *
   * Enforces the 0–10 NPS range defensively (the route also validates it) so the
   * invariant holds regardless of caller. Returns only `{ id, score }`.
   *
   * @throws RangeError when `score` is not an integer in `[0, 10]`.
   */
  static async createNpsResponse(
    input: NpsResponseInput,
    identity: NpsIdentity = {}
  ): Promise<NpsCreated> {
    const { score, comment } = input;
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new RangeError('NPS score must be an integer between 0 and 10');
    }

    return prisma.npsResponse.create({
      data: {
        score,
        comment: comment ?? null,
        userId: identity.userId ?? null,
        deviceId: identity.deviceId ?? null,
      },
      select: { id: true, score: true },
    });
  }

  /**
   * Story 6.8 (D4) — aggregate NPS.
   *
   * Promoters `score >= 9`, detractors `score <= 6`, passives are the remainder
   * (`7–8`). `nps = (promoters − detractors) / responses × 100`, and is `0` when
   * there are no responses (never `NaN`).
   */
  static async getNpsSummary(): Promise<NpsSummary> {
    const [responses, promoters, detractors] = await Promise.all([
      prisma.npsResponse.count(),
      prisma.npsResponse.count({ where: { score: { gte: 9 } } }),
      prisma.npsResponse.count({ where: { score: { lte: 6 } } }),
    ]);

    const passives = responses - promoters - detractors;
    const nps = responses > 0 ? ((promoters - detractors) / responses) * 100 : 0;

    return { responses, promoters, passives, detractors, nps };
  }

  private static getSortOrder(sortBy: string): any {
    switch (sortBy) {
      case 'wins':
        return { wins: 'desc' };
      case 'gamesPlayed':
        return { gamesPlayed: 'desc' };
      case 'matchWinRate':
        return { matchWinRate: 'desc' };
      case 'winRate':
      default:
        return { winRate: 'desc' };
    }
  }
}

export const communityService = CommunityService;
