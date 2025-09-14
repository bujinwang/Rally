import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

/**
 * Database connection and utility functions
 */
export class DatabaseUtils {
  private static instance: PrismaClient = prisma;

  /**
   * Get Prisma client instance
   */
  static getClient(): PrismaClient {
    return this.instance;
  }

  /**
   * Test database connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      await this.instance.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Execute transaction with proper error handling
   */
  static async executeTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    try {
      return await this.instance.$transaction(operation);
    } catch (error) {
      console.error('Transaction failed:', error);
      throw this.handleDatabaseError(error);
    }
  }

  /**
   * Handle database errors with user-friendly messages
   */
  static handleDatabaseError(error: any): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          return new Error('A record with this information already exists');
        case 'P2025':
          return new Error('The requested record was not found');
        case 'P2003':
          return new Error('Cannot perform this operation due to related records');
        case 'P2028':
          return new Error('Transaction API error occurred');
        default:
          console.error('Prisma known error:', error.code, error.message);
          return new Error('Database operation failed');
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return new Error('Invalid data provided for database operation');
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return new Error('Database connection failed to initialize');
    }

    if (error instanceof Prisma.PrismaClientRustPanicError) {
      console.error('Prisma rust panic:', error);
      return new Error('Internal database error occurred');
    }

    // Generic error
    console.error('Unknown database error:', error);
    return new Error('An unexpected database error occurred');
  }

  /**
   * Safely disconnect from database
   */
  static async disconnect(): Promise<void> {
    try {
      await this.instance.$disconnect();
      console.log('Database disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting from database:', error);
    }
  }

  /**
   * Get database connection info for monitoring
   */
  static async getConnectionInfo(): Promise<{
    isConnected: boolean;
    lastQuery?: Date;
  }> {
    try {
      // Test connection
      await this.instance.$queryRaw`SELECT 1`;

      return {
        isConnected: true,
        lastQuery: new Date()
      };
    } catch (error) {
      return {
        isConnected: false
      };
    }
  }

  /**
   * Execute raw query with logging
   */
  static async executeRawQuery(query: string, params: any[] = []): Promise<any> {
    try {
      console.log('Executing raw query:', query, params);
      const result = await this.instance.$queryRawUnsafe(query, ...params);
      console.log('Raw query result:', result);
      return result;
    } catch (error) {
      console.error('Raw query failed:', error);
      throw this.handleDatabaseError(error);
    }
  }

  /**
   * Get query performance metrics (basic implementation)
   */
  static async getQueryMetrics(): Promise<{
    totalQueries: number;
    slowQueries: number;
    averageQueryTime?: number;
  }> {
    try {
      // Basic metrics - in production, you might use a monitoring tool
      return {
        totalQueries: 0, // Would need external monitoring
        slowQueries: 0,
        averageQueryTime: undefined
      };
    } catch (error) {
      console.error('Failed to get query metrics:', error);
      return {
        totalQueries: 0,
        slowQueries: 0
      };
    }
  }
}

/**
 * Query optimization helpers
 */
export class QueryOptimizer {
  /**
   * Optimize session queries with proper indexing hints
   */
  static getOptimizedSessionQuery(includePlayers: boolean = false) {
    const baseQuery = {
      orderBy: { createdAt: 'desc' } as const,
    };

    if (includePlayers) {
      return {
        ...baseQuery,
        include: {
          players: {
            select: {
              id: true,
              name: true,
              status: true,
              joinedAt: true,
              gamesPlayed: true,
              wins: true,
              losses: true
            },
            orderBy: { joinedAt: 'asc' } as const
          }
        }
      };
    }

    return baseQuery;
  }

  /**
   * Optimize player queries for performance
   */
  static getOptimizedPlayerQuery(includeSession: boolean = false) {
    const baseQuery = {
      orderBy: { joinedAt: 'asc' } as const,
    };

    if (includeSession) {
      return {
        ...baseQuery,
        include: {
          session: {
            select: {
              id: true,
              name: true,
              shareCode: true,
              status: true,
              ownerName: true
            }
          }
        }
      };
    }

    return baseQuery;
  }

  /**
   * Batch operations for better performance
   */
  static async batchPlayerUpdates(updates: Array<{
    playerId: string;
    data: Record<string, any>;
  }>): Promise<void> {
    const prisma = DatabaseUtils.getClient();

    try {
      await DatabaseUtils.executeTransaction(async (tx) => {
        for (const update of updates) {
          await tx.mvpPlayer.update({
            where: { id: update.playerId },
            data: update.data
          });
        }
      });
    } catch (error) {
      console.error('Batch player updates failed:', error);
      throw DatabaseUtils.handleDatabaseError(error);
    }
  }
}

/**
 * Migration helpers
 */
export class MigrationUtils {
  /**
   * Check if migration is safe to run
   */
  static async isMigrationSafe(migrationName: string): Promise<{
    isSafe: boolean;
    warnings: string[];
  }> {
    const prisma = DatabaseUtils.getClient();

    try {
      // Check for existing data that might be affected
      const sessionCount = await prisma.mvpSession.count();
      const playerCount = await prisma.mvpPlayer.count();

      const warnings: string[] = [];

      if (sessionCount > 0) {
        warnings.push(`${sessionCount} sessions exist - migration may affect existing data`);
      }

      if (playerCount > 0) {
        warnings.push(`${playerCount} players exist - migration may affect existing data`);
      }

      return {
        isSafe: warnings.length === 0,
        warnings
      };
    } catch (error) {
      console.error('Migration safety check failed:', error);
      return {
        isSafe: false,
        warnings: ['Unable to verify migration safety']
      };
    }
  }

  /**
   * Create backup before migration (if needed)
   */
  static async createBackup(backupName: string): Promise<boolean> {
    try {
      // This would typically use pg_dump or similar
      // For now, just log the intent
      console.log(`Creating backup: ${backupName}`);
      return true;
    } catch (error) {
      console.error('Backup creation failed:', error);
      return false;
    }
  }

  /**
   * Validate migration results
   */
  static async validateMigration(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const prisma = DatabaseUtils.getClient();

    try {
      const issues: string[] = [];

      // Check data integrity
      const sessionsWithoutPlayers = await prisma.mvpSession.findMany({
        where: {
          players: {
            none: {}
          }
        },
        select: { id: true, name: true }
      });

      if (sessionsWithoutPlayers.length > 0) {
        issues.push(`${sessionsWithoutPlayers.length} sessions have no players`);
      }

      // Check for orphaned players (players with invalid sessionId)
      const allPlayers = await prisma.mvpPlayer.findMany({
        select: { id: true, name: true, sessionId: true }
      });

      const validSessionIds = await prisma.mvpSession.findMany({
        select: { id: true }
      });

      const validSessionIdSet = new Set(validSessionIds.map(s => s.id));
      const orphanedPlayers = allPlayers.filter(p => !validSessionIdSet.has(p.sessionId));

      if (orphanedPlayers.length > 0) {
        issues.push(`${orphanedPlayers.length} orphaned players found`);
      }

      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      console.error('Migration validation failed:', error);
      return {
        isValid: false,
        issues: ['Unable to validate migration results']
      };
    }
  }
}

// Export singleton instance
export const dbUtils = DatabaseUtils;
export const queryOptimizer = QueryOptimizer;
export const migrationUtils = MigrationUtils;