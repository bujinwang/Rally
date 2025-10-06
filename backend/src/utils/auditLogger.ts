import { prisma } from '../config/database';

export interface AuditLogEntry {
  action: string;
  actorId: string;
  actorName: string;
  targetId?: string;
  targetType?: 'session' | 'player' | 'game' | 'match';
  sessionId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  /**
   * Log an organizer action for audit purposes
   */
  static async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      const logEntry = {
        action: entry.action,
        actorId: entry.actorId,
        actorName: entry.actorName,
        targetId: entry.targetId,
        targetType: entry.targetType,
        sessionId: entry.sessionId,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        timestamp: new Date()
      };

      // Log to console for now (in production, this would go to a dedicated audit table)
      console.log('🔒 AUDIT LOG:', JSON.stringify(logEntry, null, 2));

      // TODO: When audit table is added to schema, uncomment:
      // await prisma.auditLog.create({
      //   data: logEntry
      // });
    } catch (error) {
      console.error('Failed to log audit entry:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Log session update action
   */
  static async logSessionUpdate(
    actorId: string,
    actorName: string,
    sessionId: string,
    changes: Record<string, any>,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'SESSION_UPDATED',
      actorId,
      actorName,
      targetId: sessionId,
      targetType: 'session',
      sessionId,
      metadata: { changes },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log session deletion/termination
   */
  static async logSessionTermination(
    actorId: string,
    actorName: string,
    sessionId: string,
    reason?: string,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'SESSION_TERMINATED',
      actorId,
      actorName,
      targetId: sessionId,
      targetType: 'session',
      sessionId,
      metadata: { reason },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log player removal
   */
  static async logPlayerRemoval(
    actorId: string,
    actorName: string,
    playerId: string,
    playerName: string,
    sessionId: string,
    reason?: string,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'PLAYER_REMOVED',
      actorId,
      actorName,
      targetId: playerId,
      targetType: 'player',
      sessionId,
      metadata: { playerName, reason },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log player addition
   */
  static async logPlayerAddition(
    actorId: string,
    actorName: string,
    playerId: string,
    playerName: string,
    sessionId: string,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'PLAYER_ADDED',
      actorId,
      actorName,
      targetId: playerId,
      targetType: 'player',
      sessionId,
      metadata: { playerName },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log player status change
   */
  static async logPlayerStatusChange(
    actorId: string,
    actorName: string,
    playerId: string,
    playerName: string,
    sessionId: string,
    oldStatus: string,
    newStatus: string,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'PLAYER_STATUS_CHANGED',
      actorId,
      actorName,
      targetId: playerId,
      targetType: 'player',
      sessionId,
      metadata: { playerName, oldStatus, newStatus },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log organizer claim
   */
  static async logOrganizerClaim(
    actorId: string,
    actorName: string,
    sessionId: string,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'ORGANIZER_CLAIMED',
      actorId,
      actorName,
      targetId: sessionId,
      targetType: 'session',
      sessionId,
      metadata: { actorName },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Log pairing generation
   */
  static async logPairingGeneration(
    actorId: string,
    actorName: string,
    sessionId: string,
    algorithm: string,
    playerCount: number,
    req?: any
  ): Promise<void> {
    await this.logAction({
      action: 'PAIRING_GENERATED',
      actorId,
      actorName,
      targetId: sessionId,
      targetType: 'session',
      sessionId,
      metadata: { algorithm, playerCount },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent')
    });
  }

  /**
   * Get audit logs for a session (for future use)
   */
  static async getSessionLogs(sessionId: string, limit: number = 50): Promise<any[]> {
    // TODO: When audit table is added, implement:
    // return await prisma.auditLog.findMany({
    //   where: { sessionId },
    //   orderBy: { timestamp: 'desc' },
    //   take: limit
    // });
    
    return []; // Placeholder
  }

  /**
   * Get audit logs for a specific player (for future use)
   */
  static async getPlayerLogs(playerId: string, limit: number = 50): Promise<any[]> {
    // TODO: When audit table is added, implement:
    // return await prisma.auditLog.findMany({
    //   where: { targetId: playerId, targetType: 'player' },
    //   orderBy: { timestamp: 'desc' },
    //   take: limit
    // });
    
    return []; // Placeholder
  }
}
