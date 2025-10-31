import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ChallengeData {
  challengerId: string;
  challengedId: string;
  challengeType?: string;
  message?: string;
  sessionId?: string;
  matchFormat?: string;
  scoringSystem?: string;
  bestOfGames?: number;
  scheduledAt?: Date;
}

export interface ChallengeResponse {
  challengeId: string;
  challengerId: string;
  challengedId: string;
  status: string;
  message?: string;
}

export class ChallengesService {
  /**
   * Create a new challenge
   */
  async createChallenge(data: ChallengeData) {
    // Check if there's already a pending challenge between these users
    const existingChallenge = await prisma.$queryRaw`
      SELECT * FROM challenges
      WHERE ((challenger_id = ${data.challengerId} AND challenged_id = ${data.challengedId})
         OR (challenger_id = ${data.challengedId} AND challenged_id = ${data.challengerId}))
        AND status = 'PENDING'
    ` as any[];

    if (existingChallenge.length > 0) {
      throw new Error('There is already a pending challenge between these users');
    }

    // Create the challenge
    const challengeId = crypto.randomUUID();
    await prisma.$queryRaw`
      INSERT INTO challenges (
        id, challenger_id, challenged_id, challenge_type, message, session_id,
        match_format, scoring_system, best_of_games, status, sent_at, scheduled_at
      ) VALUES (
        ${challengeId}, ${data.challengerId}, ${data.challengedId},
        ${data.challengeType || 'MATCH'}, ${data.message || null}, ${data.sessionId || null},
        ${data.matchFormat || 'SINGLES'}, ${data.scoringSystem || '21_POINT'},
        ${data.bestOfGames || 3}, 'PENDING', NOW(), ${data.scheduledAt || null}
      )
    `;

    // Get the created challenge with user details
    const challenge = await prisma.$queryRaw`
      SELECT c.*, ch.name as challenger_name, cd.name as challenged_name
      FROM challenges c
      JOIN mvp_players ch ON c.challenger_id = ch.id
      JOIN mvp_players cd ON c.challenged_id = cd.id
      WHERE c.id = ${challengeId}
    ` as any[];

    return challenge[0] ? {
      id: challenge[0].id,
      challengerId: challenge[0].challenger_id,
      challengedId: challenge[0].challenged_id,
      challengeType: challenge[0].challenge_type,
      message: challenge[0].message,
      sessionId: challenge[0].session_id,
      matchFormat: challenge[0].match_format,
      scoringSystem: challenge[0].scoring_system,
      bestOfGames: challenge[0].best_of_games,
      status: challenge[0].status,
      sentAt: new Date(challenge[0].sent_at),
      scheduledAt: challenge[0].scheduled_at ? new Date(challenge[0].scheduled_at) : null,
      challenger: { id: challenge[0].challenger_id, name: challenge[0].challenger_name },
      challenged: { id: challenge[0].challenged_id, name: challenge[0].challenged_name }
    } : null;
  }

  /**
   * Respond to a challenge
   */
  async respondToChallenge(challengeId: string, userId: string, accept: boolean) {
    const challengeResult = await prisma.$queryRaw`
      SELECT * FROM challenges
      WHERE id = ${challengeId} AND challenged_id = ${userId} AND status = 'PENDING'
    ` as any[];

    if (challengeResult.length === 0) {
      throw new Error('Challenge not found or already responded to');
    }

    const newStatus = accept ? 'ACCEPTED' : 'DECLINED';

    // Update the challenge
    await prisma.$queryRaw`
      UPDATE challenges
      SET status = ${newStatus}, responded_at = NOW()
      WHERE id = ${challengeId}
    `;

    // Get updated challenge with user details
    const updatedChallenge = await prisma.$queryRaw`
      SELECT c.*, ch.name as challenger_name, cd.name as challenged_name
      FROM challenges c
      JOIN mvp_players ch ON c.challenger_id = ch.id
      JOIN mvp_players cd ON c.challenged_id = cd.id
      WHERE c.id = ${challengeId}
    ` as any[];

    return updatedChallenge[0] ? {
      id: updatedChallenge[0].id,
      challengerId: updatedChallenge[0].challenger_id,
      challengedId: updatedChallenge[0].challenged_id,
      challengeType: updatedChallenge[0].challenge_type,
      message: updatedChallenge[0].message,
      sessionId: updatedChallenge[0].session_id,
      matchFormat: updatedChallenge[0].match_format,
      scoringSystem: updatedChallenge[0].scoring_system,
      bestOfGames: updatedChallenge[0].best_of_games,
      status: updatedChallenge[0].status,
      sentAt: new Date(updatedChallenge[0].sent_at),
      respondedAt: updatedChallenge[0].responded_at ? new Date(updatedChallenge[0].responded_at) : null,
      scheduledAt: updatedChallenge[0].scheduled_at ? new Date(updatedChallenge[0].scheduled_at) : null,
      challenger: { id: updatedChallenge[0].challenger_id, name: updatedChallenge[0].challenger_name },
      challenged: { id: updatedChallenge[0].challenged_id, name: updatedChallenge[0].challenged_name }
    } : null;
  }

  /**
   * Get challenges for a user
   */
  async getUserChallenges(userId: string, type: 'sent' | 'received' | 'all' = 'all') {
    let whereClause = '';

    switch (type) {
      case 'sent':
        whereClause = `c.challenger_id = '${userId}'`;
        break;
      case 'received':
        whereClause = `c.challenged_id = '${userId}'`;
        break;
      case 'all':
        whereClause = `(c.challenger_id = '${userId}' OR c.challenged_id = '${userId}')`;
        break;
    }

    const challenges = await prisma.$queryRaw`
      SELECT c.*, ch.name as challenger_name, cd.name as challenged_name
      FROM challenges c
      JOIN mvp_players ch ON c.challenger_id = ch.id
      JOIN mvp_players cd ON c.challenged_id = cd.id
      WHERE ${whereClause}
      ORDER BY c.sent_at DESC
    ` as any[];

    return challenges.map(row => ({
      id: row.id,
      challengerId: row.challenger_id,
      challengedId: row.challenged_id,
      challengeType: row.challenge_type,
      message: row.message,
      sessionId: row.session_id,
      matchFormat: row.match_format,
      scoringSystem: row.scoring_system,
      bestOfGames: row.best_of_games,
      status: row.status,
      sentAt: new Date(row.sent_at),
      respondedAt: row.responded_at ? new Date(row.responded_at) : null,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      challenger: { id: row.challenger_id, name: row.challenger_name },
      challenged: { id: row.challenged_id, name: row.challenged_name }
    }));
  }

  /**
   * Cancel a challenge
   */
  async cancelChallenge(challengeId: string, userId: string) {
    const challengeResult = await prisma.$queryRaw`
      SELECT * FROM challenges
      WHERE id = ${challengeId} AND challenger_id = ${userId} AND status = 'PENDING'
    ` as any[];

    if (challengeResult.length === 0) {
      throw new Error('Challenge not found or cannot be cancelled');
    }

    await prisma.$queryRaw`
      UPDATE challenges
      SET status = 'CANCELLED'
      WHERE id = ${challengeId}
    `;

    return { success: true, message: 'Challenge cancelled successfully' };
  }

  /**
   * Mark challenge as completed
   */
  async completeChallenge(challengeId: string) {
    const challengeResult = await prisma.$queryRaw`
      SELECT * FROM challenges
      WHERE id = ${challengeId} AND status = 'ACCEPTED'
    ` as any[];

    if (challengeResult.length === 0) {
      throw new Error('Challenge not found or not in accepted state');
    }

    await prisma.$queryRaw`
      UPDATE challenges
      SET status = 'COMPLETED'
      WHERE id = ${challengeId}
    `;

    return { success: true, message: 'Challenge marked as completed' };
  }

  /**
   * Get challenge statistics
   */
  async getChallengeStats(userId: string) {
    const [sentCount, receivedCount, acceptedCount, completedCount] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) as count FROM challenges WHERE challenger_id = ${userId}`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM challenges WHERE challenged_id = ${userId}`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM challenges WHERE (challenger_id = ${userId} OR challenged_id = ${userId}) AND status = 'ACCEPTED'`,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM challenges WHERE (challenger_id = ${userId} OR challenged_id = ${userId}) AND status = 'COMPLETED'`
    ]);

    return {
      sentCount: Array.isArray(sentCount) ? parseInt((sentCount[0] as any).count) || 0 : 0,
      receivedCount: Array.isArray(receivedCount) ? parseInt((receivedCount[0] as any).count) || 0 : 0,
      acceptedCount: Array.isArray(acceptedCount) ? parseInt((acceptedCount[0] as any).count) || 0 : 0,
      completedCount: Array.isArray(completedCount) ? parseInt((completedCount[0] as any).count) || 0 : 0
    };
  }

  /**
   * Get pending challenges count for a user
   */
  async getPendingChallengesCount(userId: string): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM challenges
      WHERE challenged_id = ${userId} AND status = 'PENDING'
    ` as any[];

    return Array.isArray(result) ? parseInt((result[0] as any).count) || 0 : 0;
  }

  /**
   * Get active challenges (pending or accepted)
   */
  async getActiveChallenges(userId: string) {
    const challenges = await prisma.$queryRaw`
      SELECT c.*, ch.name as challenger_name, cd.name as challenged_name
      FROM challenges c
      JOIN mvp_players ch ON c.challenger_id = ch.id
      JOIN mvp_players cd ON c.challenged_id = cd.id
      WHERE (c.challenger_id = ${userId} OR c.challenged_id = ${userId})
        AND c.status IN ('PENDING', 'ACCEPTED')
      ORDER BY c.sent_at DESC
    ` as any[];

    return challenges.map(row => ({
      id: row.id,
      challengerId: row.challenger_id,
      challengedId: row.challenged_id,
      challengeType: row.challenge_type,
      message: row.message,
      sessionId: row.session_id,
      matchFormat: row.match_format,
      scoringSystem: row.scoring_system,
      bestOfGames: row.best_of_games,
      status: row.status,
      sentAt: new Date(row.sent_at),
      respondedAt: row.responded_at ? new Date(row.responded_at) : null,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      challenger: { id: row.challenger_id, name: row.challenger_name },
      challenged: { id: row.challenged_id, name: row.challenged_name }
    }));
  }
}

export const challengesService = new ChallengesService();