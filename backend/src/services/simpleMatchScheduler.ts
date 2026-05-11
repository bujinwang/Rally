import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface SimpleScheduledMatch {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  duration: number;
  location?: string;
  courtName?: string;
  player1Id: string;
  player2Id?: string;
  matchType: 'SINGLES' | 'DOUBLES';
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSimpleMatchData {
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  duration?: number;
  location?: string;
  courtName?: string;
  player1Id: string;
  player2Id?: string;
  matchType: 'SINGLES' | 'DOUBLES';
  createdBy: string;
}

export class SimpleMatchScheduler {
  /**
   * Create a simple scheduled match using existing MVP models
   */
  static async createScheduledMatch(data: CreateSimpleMatchData): Promise<SimpleScheduledMatch> {
    try {
      // Validate session exists and is active
      const session = await prisma.mvpSession.findUnique({
        where: { id: data.sessionId },
        include: { players: true }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Cannot schedule matches for inactive sessions');
      }

      // Validate players are in the session
      const playerIds = [data.player1Id, data.player2Id].filter(Boolean);
      for (const playerId of playerIds) {
        const playerInSession = session.players.find(p => p.id === playerId);
        if (!playerInSession) {
          throw new Error(`Player ${playerId} is not a participant in this session`);
        }
      }

      const match = await prisma.scheduledMatch.create({
        data: {
          sessionId: data.sessionId,
          title: data.title,
          description: data.description,
          scheduledAt: data.scheduledAt,
          duration: data.duration || 60,
          location: data.location,
          courtName: data.courtName,
          player1Id: data.player1Id,
          player2Id: data.player2Id,
          matchType: data.matchType,
          status: 'SCHEDULED',
          createdBy: data.createdBy,
        },
      });

      return {
        id: match.id,
        sessionId: match.sessionId,
        title: match.title,
        description: match.description || undefined,
        scheduledAt: match.scheduledAt,
        duration: match.duration,
        location: match.location || undefined,
        courtName: match.courtName || undefined,
        player1Id: match.player1Id,
        player2Id: match.player2Id || undefined,
        matchType: match.matchType as 'SINGLES' | 'DOUBLES',
        status: 'SCHEDULED' as const,
        createdBy: match.createdBy,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
      };
    } catch (error) {
      console.error('Error creating scheduled match:', error);
      throw error;
    }
  }

  /**
   * Get scheduled matches for a session
   */
  static async getScheduledMatchesForSession(sessionId: string): Promise<SimpleScheduledMatch[]> {
    try {
      const matches = await prisma.scheduledMatch.findMany({
        where: { sessionId, status: { not: 'CANCELLED' } },
        orderBy: { scheduledAt: 'asc' },
      });
      return matches.map(m => ({
        id: m.id,
        sessionId: m.sessionId,
        title: m.title,
        description: m.description || undefined,
        scheduledAt: m.scheduledAt,
        duration: m.duration,
        location: m.location || undefined,
        courtName: m.courtName || undefined,
        player1Id: m.player1Id,
        player2Id: m.player2Id || undefined,
        matchType: m.matchType as 'SINGLES' | 'DOUBLES',
        status: m.status as SimpleScheduledMatch['status'],
        createdBy: m.createdBy,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
    } catch (error) {
      console.error('Error fetching scheduled matches:', error);
      throw new Error('Failed to fetch scheduled matches');
    }
  }

  /**
   * Get scheduled matches for a specific player
   */
  static async getScheduledMatchesForPlayer(playerId: string): Promise<SimpleScheduledMatch[]> {
    try {
      const matches = await prisma.scheduledMatch.findMany({
        where: {
          OR: [
            { player1Id: playerId },
            { player2Id: playerId },
            { player3Id: playerId },
            { player4Id: playerId },
          ],
          status: { not: 'CANCELLED' },
        },
        orderBy: { scheduledAt: 'asc' },
      });
      return matches.map(m => ({
        id: m.id,
        sessionId: m.sessionId,
        title: m.title,
        description: m.description || undefined,
        scheduledAt: m.scheduledAt,
        duration: m.duration,
        location: m.location || undefined,
        courtName: m.courtName || undefined,
        player1Id: m.player1Id,
        player2Id: m.player2Id || undefined,
        matchType: m.matchType as 'SINGLES' | 'DOUBLES',
        status: m.status as SimpleScheduledMatch['status'],
        createdBy: m.createdBy,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
    } catch (error) {
      console.error('Error fetching player matches:', error);
      throw new Error('Failed to fetch player matches');
    }
  }

  /**
   * Cancel a scheduled match
   */
  static async cancelScheduledMatch(matchId: string, cancelledBy: string): Promise<SimpleScheduledMatch> {
    try {
      const match = await prisma.mvpMatch.findUnique({
        where: { id: matchId }
      });

      if (!match) {
        throw new Error('Match not found');
      }

      // Update the match status to cancelled
      const updatedMatch = await prisma.mvpMatch.update({
        where: { id: matchId },
        data: {
          status: 'CANCELLED'
        }
      });

      // Return a simple scheduled match object
      const scheduledMatch: SimpleScheduledMatch = {
        id: updatedMatch.id,
        sessionId: updatedMatch.sessionId,
        title: `Match ${updatedMatch.matchNumber}`,
        scheduledAt: updatedMatch.createdAt, // Placeholder
        duration: 60, // Default
        player1Id: updatedMatch.team1Player1,
        player2Id: updatedMatch.team2Player1 || undefined,
        matchType: 'SINGLES',
        status: 'CANCELLED',
        createdBy: cancelledBy,
        createdAt: updatedMatch.createdAt,
        updatedAt: updatedMatch.updatedAt
      };

      return scheduledMatch;
    } catch (error) {
      console.error('Error cancelling scheduled match:', error);
      throw error;
    }
  }

  /**
   * Check for basic scheduling conflicts
   */
  static async checkBasicConflicts(
    sessionId: string,
    scheduledAt: Date,
    courtName?: string,
    playerIds: string[] = []
  ): Promise<boolean> {
    try {
      // Basic conflict checking - check if court is already booked
      if (courtName) {
        const courtConflicts = await prisma.mvpMatch.findMany({
          where: {
            sessionId,
            courtName,
            status: { in: ['IN_PROGRESS', 'COMPLETED'] }
          }
        });

        if (courtConflicts.length > 0) {
          return true; // Conflict found
        }
      }

      // Check if players are already in active matches
      for (const playerId of playerIds) {
        const playerMatches = await prisma.mvpMatch.findMany({
          where: {
            sessionId,
            OR: [
              { team1Player1: playerId },
              { team1Player2: playerId },
              { team2Player1: playerId },
              { team2Player2: playerId }
            ],
            status: 'IN_PROGRESS'
          }
        });

        if (playerMatches.length > 0) {
          return true; // Player already in active match
        }
      }

      return false; // No conflicts
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return true; // Assume conflict on error
    }
  }
}