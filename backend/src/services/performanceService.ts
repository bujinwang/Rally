import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PerformanceMetrics {
  queryCount: number;
  queryTime: number;
  cacheHits: number;
  cacheMisses: number;
  memoryUsage: number;
  activeConnections: number;
}

export interface QueryOptimization {
  query: string;
  executionTime: number;
  optimization: string;
  impact: 'high' | 'medium' | 'low';
}

class PerformanceService {
  private metrics: PerformanceMetrics = {
    queryCount: 0,
    queryTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    memoryUsage: 0,
    activeConnections: 0
  };

  private optimizations: QueryOptimization[] = [];

  /**
   * Monitor database query performance
   */
  async monitorQueryPerformance(): Promise<void> {
    try {
      // Enable query logging in development
      if (process.env.NODE_ENV === 'development') {
        // @ts-ignore - Prisma internal API
        prisma.$on('query', (e: any) => {
          this.metrics.queryCount++;
          this.metrics.queryTime += e.duration;

          // Log slow queries
          if (e.duration > 1000) { // Queries taking more than 1 second
            console.warn(`🐌 Slow query detected: ${e.query} (${e.duration}ms)`);
          }
        });
      }
    } catch (error) {
      console.error('Error setting up query monitoring:', error);
    }
  }

  /**
   * Optimize database queries for discovery
   */
  async optimizeDiscoveryQueries(): Promise<QueryOptimization[]> {
    const optimizations: QueryOptimization[] = [];

    try {
      // Analyze current query patterns
      const sessionCount = await prisma.mvpSession.count();
      const playerCount = await prisma.mvpPlayer.count();
      const gameCount = await prisma.mvpGame.count();

      console.log(`📊 Database stats: ${sessionCount} sessions, ${playerCount} players, ${gameCount} games`);

      // Suggest optimizations based on data size
      if (sessionCount > 1000) {
        optimizations.push({
          query: 'Discovery queries with location filtering',
          executionTime: 0,
          optimization: 'Add spatial index on (latitude, longitude) for location-based queries',
          impact: 'high'
        });
      }

      if (playerCount > 5000) {
        optimizations.push({
          query: 'Player count queries in discovery',
          executionTime: 0,
          optimization: 'Add composite index on (sessionId, status) for player aggregation',
          impact: 'medium'
        });
      }

      // Check for N+1 query patterns
      optimizations.push({
        query: 'Session discovery with player counts',
        executionTime: 0,
        optimization: 'Use include with select to avoid N+1 queries',
        impact: 'high'
      });

    } catch (error) {
      console.error('Error analyzing query optimizations:', error);
    }

    this.optimizations = optimizations;
    return optimizations;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      queryCount: 0,
      queryTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: 0,
      activeConnections: 0
    };
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Record query execution time
   */
  recordQueryTime(duration: number): void {
    this.metrics.queryTime += duration;
    this.metrics.queryCount++;
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
  }

  /**
   * Analyze database connection pool
   */
  async analyzeConnectionPool(): Promise<{
    poolSize: number;
    activeConnections: number;
    idleConnections: number;
    waitingClients: number;
  }> {
    try {
      // This would require database-specific queries
      // For PostgreSQL, we could query pg_stat_activity
      const poolStats = {
        poolSize: 10, // Default Prisma pool size
        activeConnections: 0,
        idleConnections: 0,
        waitingClients: 0
      };

      console.log('🔍 Connection pool analysis:', poolStats);
      return poolStats;
    } catch (error) {
      console.error('Error analyzing connection pool:', error);
      throw error;
    }
  }

  /**
   * Optimize memory usage
   */
  optimizeMemoryUsage(): void {
    // Force garbage collection if available (only in development)
    if (global.gc && process.env.NODE_ENV === 'development') {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;

      console.log(`🗑️ Garbage collection: ${(before - after) / 1024 / 1024}MB freed`);
    }

    // Update memory metrics
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed;
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    metrics: PerformanceMetrics;
    cacheHitRate: number;
    optimizations: QueryOptimization[];
    recommendations: string[];
  } {
    const recommendations: string[] = [];

    // Analyze metrics and provide recommendations
    if (this.getCacheHitRate() < 50) {
      recommendations.push('Consider increasing cache TTL or implementing more aggressive caching strategies');
    }

    if (this.metrics.queryTime / this.metrics.queryCount > 100) {
      recommendations.push('Average query time is high - consider query optimization and indexing');
    }

    if (this.metrics.memoryUsage > 256 * 1024 * 1024) { // 256MB
      recommendations.push('Memory usage is high - consider implementing memory-efficient caching or streaming');
    }

    return {
      metrics: this.metrics,
      cacheHitRate: this.getCacheHitRate(),
      optimizations: this.optimizations,
      recommendations
    };
  }

  /**
   * Health check for performance monitoring
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    metrics: PerformanceMetrics;
  }> {
    const cacheHitRate = this.getCacheHitRate();
    const avgQueryTime = this.metrics.queryCount > 0 ? this.metrics.queryTime / this.metrics.queryCount : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let message = 'Performance is optimal';

    if (cacheHitRate < 30 || avgQueryTime > 2000 || this.metrics.memoryUsage > 512 * 1024 * 1024) {
      status = 'critical';
      message = 'Performance issues detected - immediate attention required';
    } else if (cacheHitRate < 50 || avgQueryTime > 1000 || this.metrics.memoryUsage > 256 * 1024 * 1024) {
      status = 'warning';
      message = 'Performance degradation detected - monitoring recommended';
    }

    return {
      status,
      message,
      metrics: this.metrics
    };
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();
export default performanceService;