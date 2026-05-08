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
