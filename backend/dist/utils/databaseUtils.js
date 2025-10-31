"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationUtils = exports.queryOptimizer = exports.dbUtils = exports.MigrationUtils = exports.QueryOptimizer = exports.DatabaseUtils = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});
/**
 * Database connection and utility functions
 */
class DatabaseUtils {
    /**
     * Get Prisma client instance
     */
    static getClient() {
        return this.instance;
    }
    /**
     * Test database connection
     */
    static async testConnection() {
        try {
            await this.instance.$queryRaw `SELECT 1`;
            return true;
        }
        catch (error) {
            console.error('Database connection test failed:', error);
            return false;
        }
    }
    /**
     * Execute transaction with proper error handling
     */
    static async executeTransaction(operation) {
        try {
            return await this.instance.$transaction(operation);
        }
        catch (error) {
            console.error('Transaction failed:', error);
            throw this.handleDatabaseError(error);
        }
    }
    /**
     * Handle database errors with user-friendly messages
     */
    static handleDatabaseError(error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
        if (error instanceof client_1.Prisma.PrismaClientValidationError) {
            return new Error('Invalid data provided for database operation');
        }
        if (error instanceof client_1.Prisma.PrismaClientInitializationError) {
            return new Error('Database connection failed to initialize');
        }
        if (error instanceof client_1.Prisma.PrismaClientRustPanicError) {
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
    static async disconnect() {
        try {
            await this.instance.$disconnect();
            console.log('Database disconnected successfully');
        }
        catch (error) {
            console.error('Error disconnecting from database:', error);
        }
    }
    /**
     * Get database connection info for monitoring
     */
    static async getConnectionInfo() {
        try {
            // Test connection
            await this.instance.$queryRaw `SELECT 1`;
            return {
                isConnected: true,
                lastQuery: new Date()
            };
        }
        catch (error) {
            return {
                isConnected: false
            };
        }
    }
    /**
     * Execute raw query with logging
     */
    static async executeRawQuery(query, params = []) {
        try {
            console.log('Executing raw query:', query, params);
            const result = await this.instance.$queryRawUnsafe(query, ...params);
            console.log('Raw query result:', result);
            return result;
        }
        catch (error) {
            console.error('Raw query failed:', error);
            throw this.handleDatabaseError(error);
        }
    }
    /**
     * Get query performance metrics (basic implementation)
     */
    static async getQueryMetrics() {
        try {
            // Basic metrics - in production, you might use a monitoring tool
            return {
                totalQueries: 0, // Would need external monitoring
                slowQueries: 0,
                averageQueryTime: undefined
            };
        }
        catch (error) {
            console.error('Failed to get query metrics:', error);
            return {
                totalQueries: 0,
                slowQueries: 0
            };
        }
    }
}
exports.DatabaseUtils = DatabaseUtils;
DatabaseUtils.instance = prisma;
/**
 * Query optimization helpers
 */
class QueryOptimizer {
    /**
     * Optimize session queries with proper indexing hints
     */
    static getOptimizedSessionQuery(includePlayers = false) {
        const baseQuery = {
            orderBy: { createdAt: 'desc' },
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
                        orderBy: { joinedAt: 'asc' }
                    }
                }
            };
        }
        return baseQuery;
    }
    /**
     * Optimize player queries for performance
     */
    static getOptimizedPlayerQuery(includeSession = false) {
        const baseQuery = {
            orderBy: { joinedAt: 'asc' },
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
    static async batchPlayerUpdates(updates) {
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
        }
        catch (error) {
            console.error('Batch player updates failed:', error);
            throw DatabaseUtils.handleDatabaseError(error);
        }
    }
}
exports.QueryOptimizer = QueryOptimizer;
/**
 * Migration helpers
 */
class MigrationUtils {
    /**
     * Check if migration is safe to run
     */
    static async isMigrationSafe(migrationName) {
        const prisma = DatabaseUtils.getClient();
        try {
            // Check for existing data that might be affected
            const sessionCount = await prisma.mvpSession.count();
            const playerCount = await prisma.mvpPlayer.count();
            const warnings = [];
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
        }
        catch (error) {
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
    static async createBackup(backupName) {
        try {
            // This would typically use pg_dump or similar
            // For now, just log the intent
            console.log(`Creating backup: ${backupName}`);
            return true;
        }
        catch (error) {
            console.error('Backup creation failed:', error);
            return false;
        }
    }
    /**
     * Validate migration results
     */
    static async validateMigration() {
        const prisma = DatabaseUtils.getClient();
        try {
            const issues = [];
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
        }
        catch (error) {
            console.error('Migration validation failed:', error);
            return {
                isValid: false,
                issues: ['Unable to validate migration results']
            };
        }
    }
}
exports.MigrationUtils = MigrationUtils;
// Export singleton instance
exports.dbUtils = DatabaseUtils;
exports.queryOptimizer = QueryOptimizer;
exports.migrationUtils = MigrationUtils;
//# sourceMappingURL=databaseUtils.js.map