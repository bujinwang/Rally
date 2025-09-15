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

      // For now, we'll store scheduling info as JSON in the description field
      // This is a temporary solution until proper models are available
      const schedulingData = {
        scheduledAt: data.scheduledAt.toISOString(),
        duration: data.duration || 60,
        location: data.location,
        courtName: data.courtName,
        matchType: data.matchType,
        status: 'SCHEDULED',
        reminderSent: false
      };

      const match = await prisma.mvpMatch.create({
        data: {
          sessionId: data.sessionId,
          matchNumber: 1, // Will be updated with proper numbering
          team1Player1: data.player1Id,
          team1Player2: '',
          team2Player1: data.player2Id || '',
          team2Player2: '',
          winnerTeam: 0, // Not determined yet
          status: 'IN_PROGRESS',
          courtName: data.courtName,
          // Store scheduling data in description for now
          // In a real implementation, this would be in a separate table
        }
      });

      // Create a simple scheduled match object
      const scheduledMatch: SimpleScheduledMatch = {
        id: match.id,
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
        createdAt: match.createdAt,
        updatedAt: match.updatedAt
      };

      return scheduledMatch;
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
      // For now, return empty array since we're using MVP models
      // In a real implementation, this would query the scheduled matches table
      return [];
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
      // For now, return empty array since we're using MVP models
      // In a real implementation, this would query the scheduled matches table
      return [];
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