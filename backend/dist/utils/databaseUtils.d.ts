import { PrismaClient, Prisma } from '@prisma/client';
/**
 * Database connection and utility functions
 */
export declare class DatabaseUtils {
    private static instance;
    /**
     * Get Prisma client instance
     */
    static getClient(): PrismaClient;
    /**
     * Test database connection
     */
    static testConnection(): Promise<boolean>;
    /**
     * Execute transaction with proper error handling
     */
    static executeTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
    /**
     * Handle database errors with user-friendly messages
     */
    static handleDatabaseError(error: any): Error;
    /**
     * Safely disconnect from database
     */
    static disconnect(): Promise<void>;
    /**
     * Get database connection info for monitoring
     */
    static getConnectionInfo(): Promise<{
        isConnected: boolean;
        lastQuery?: Date;
    }>;
    /**
     * Execute raw query with logging
     */
    static executeRawQuery(query: string, params?: any[]): Promise<any>;
    /**
     * Get query performance metrics (basic implementation)
     */
    static getQueryMetrics(): Promise<{
        totalQueries: number;
        slowQueries: number;
        averageQueryTime?: number;
    }>;
}
/**
 * Query optimization helpers
 */
export declare class QueryOptimizer {
    /**
     * Optimize session queries with proper indexing hints
     */
    static getOptimizedSessionQuery(includePlayers?: boolean): {
        orderBy: {
            readonly createdAt: "desc";
        };
    } | {
        include: {
            players: {
                select: {
                    id: boolean;
                    name: boolean;
                    status: boolean;
                    joinedAt: boolean;
                    gamesPlayed: boolean;
                    wins: boolean;
                    losses: boolean;
                };
                orderBy: {
                    readonly joinedAt: "asc";
                };
            };
        };
        orderBy: {
            readonly createdAt: "desc";
        };
    };
    /**
     * Optimize player queries for performance
     */
    static getOptimizedPlayerQuery(includeSession?: boolean): {
        orderBy: {
            readonly joinedAt: "asc";
        };
    } | {
        include: {
            session: {
                select: {
                    id: boolean;
                    name: boolean;
                    shareCode: boolean;
                    status: boolean;
                    ownerName: boolean;
                };
            };
        };
        orderBy: {
            readonly joinedAt: "asc";
        };
    };
    /**
     * Batch operations for better performance
     */
    static batchPlayerUpdates(updates: Array<{
        playerId: string;
        data: Record<string, any>;
    }>): Promise<void>;
}
/**
 * Migration helpers
 */
export declare class MigrationUtils {
    /**
     * Check if migration is safe to run
     */
    static isMigrationSafe(migrationName: string): Promise<{
        isSafe: boolean;
        warnings: string[];
    }>;
    /**
     * Create backup before migration (if needed)
     */
    static createBackup(backupName: string): Promise<boolean>;
    /**
     * Validate migration results
     */
    static validateMigration(): Promise<{
        isValid: boolean;
        issues: string[];
    }>;
}
export declare const dbUtils: typeof DatabaseUtils;
export declare const queryOptimizer: typeof QueryOptimizer;
export declare const migrationUtils: typeof MigrationUtils;
//# sourceMappingURL=databaseUtils.d.ts.map