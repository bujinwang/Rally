import { Request, Response } from 'express';
import { cacheService } from './cacheService';
import {
  businessActiveUsers,
  businessTotalSessions,
  systemMemoryUsage,
  systemCpuUsage,
  dbConnectionsActive,
  cacheHitRate,
  errorsTotal,
} from './metricsRegistry';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
}

interface PerformanceMetrics {
  responseTime: number;
  statusCode: number;
  endpoint: string;
  method: string;
  userId?: string;
  timestamp: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

interface ErrorMetrics {
  error: Error;
  endpoint: string;
  method: string;
  userId?: string;
  statusCode?: number;
  timestamp: number;
  stackTrace?: string;
}

interface BusinessMetrics {
  activeUsers: number;
  totalSessions: number;
  averageSessionDuration: number;
  popularFeatures: Record<string, number>;
  userRetention: number;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  databaseConnections: number;
  cacheHitRate: number;
  responseTimeAvg: number;
  errorRate: number;
}

class MonitoringService {
  private metrics: PerformanceMetrics[] = [];
  private errors: ErrorMetrics[] = [];
  private businessMetrics: BusinessMetrics;
  private startTime: number;
  private maxMetricsHistory = 10000; // Keep last 10k metrics

  constructor() {
    this.startTime = Date.now();
    this.businessMetrics = {
      activeUsers: 0,
      totalSessions: 0,
      averageSessionDuration: 0,
      popularFeatures: {},
      userRetention: 0
    };

    console.log('✅ Monitoring service initialized');
    this.startPeriodicCleanup();
  }

  private startPeriodicCleanup(): void {
    // Clean up old metrics every hour. `unref()` so it never keeps the
    // Node process (or a Jest worker) alive on its own.
    const timer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000);
    if (timer && typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  }

  private cleanupOldMetrics(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Remove metrics older than 24 hours
    this.metrics = this.metrics.filter(metric => metric.timestamp > oneDayAgo);
    this.errors = this.errors.filter(error => error.timestamp > oneDayAgo);

    console.log(`🧹 Monitoring cleanup: ${this.metrics.length} metrics, ${this.errors.length} errors retained`);
  }

  // Record API performance metrics
  recordApiMetrics(
    req: AuthRequest,
    res: Response,
    responseTime: number
  ): void {
    const metrics: PerformanceMetrics = {
      responseTime,
      statusCode: res.statusCode,
      endpoint: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
      timestamp: Date.now(),
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCpuUsage()
    };

    this.metrics.push(metrics);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    // Log slow requests
    if (responseTime > 1000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.originalUrl} took ${responseTime}ms`);
    }

    // Log errors
    if (res.statusCode >= 400) {
      console.error(`❌ API Error: ${req.method} ${req.originalUrl} returned ${res.statusCode}`);
    }
  }

  // Record application errors
  recordError(
    error: Error,
    req?: AuthRequest,
    statusCode?: number
  ): void {
    const errorMetrics: ErrorMetrics = {
      error,
      endpoint: req?.originalUrl || 'unknown',
      method: req?.method || 'unknown',
      userId: req?.user?.id,
      statusCode,
      timestamp: Date.now(),
      stackTrace: error.stack
    };

    this.errors.push(errorMetrics);

    // Keep only recent errors
    if (this.errors.length > 1000) {
      this.errors.shift();
    }

    // Update Prometheus error counter (best-effort, never throw)
    try {
      const endpoint = req?.originalUrl || 'unknown';
      const type = statusCode && statusCode >= 500 ? 'server' : 'client';
      errorsTotal.inc({ type, endpoint });
    } catch {
      /* best-effort */
    }

    console.error(`💥 Error recorded: ${error.message} at ${errorMetrics.endpoint}`);
  }

  // Update business metrics
  updateBusinessMetrics(metrics: Partial<BusinessMetrics>): void {
    Object.assign(this.businessMetrics, metrics);
  }

  // Get comprehensive system health
  async getSystemHealth(): Promise<SystemHealth> {
    const uptime = Date.now() - this.startTime;
    const recentMetrics = this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes
    const recentErrors = this.getRecentErrors(5 * 60 * 1000);

    // Calculate health status
    const avgResponseTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
      : 0;

    const errorRate = recentMetrics.length > 0
      ? (recentErrors.length / recentMetrics.length) * 100
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (errorRate > 5 || avgResponseTime > 2000) {
      status = 'unhealthy';
    } else if (errorRate > 1 || avgResponseTime > 1000) {
      status = 'degraded';
    }

    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCpuUsage();
    const databaseConnections = await this.getDatabaseConnections();
    const hitRate = await this.getCacheHitRate();

    // Update Prometheus gauges (best-effort, never throw)
    try {
      systemMemoryUsage.set(memoryUsage);
      systemCpuUsage.set(cpuUsage);
      dbConnectionsActive.set(databaseConnections);
      cacheHitRate.set(hitRate);
      businessActiveUsers.set(this.businessMetrics.activeUsers);
      businessTotalSessions.set(this.businessMetrics.totalSessions);
    } catch {
      /* best-effort */
    }

    return {
      status,
      uptime,
      memoryUsage,
      cpuUsage,
      databaseConnections,
      cacheHitRate: hitRate,
      responseTimeAvg: avgResponseTime,
      errorRate
    };
  }

  // Get performance metrics for a time range
  getPerformanceMetrics(
    startTime: number,
    endTime: number = Date.now()
  ): PerformanceMetrics[] {
    return this.metrics.filter(metric =>
      metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  // Get error metrics for a time range
  getErrorMetrics(
    startTime: number,
    endTime: number = Date.now()
  ): ErrorMetrics[] {
    return this.errors.filter(error =>
      error.timestamp >= startTime && error.timestamp <= endTime
    );
  }

  // Get aggregated statistics
  getAggregatedStats(timeRange: number = 60 * 60 * 1000): {
    totalRequests: number;
    avgResponseTime: number;
    errorCount: number;
    errorRate: number;
    topEndpoints: Array<{ endpoint: string; count: number; avgTime: number }>;
    statusCodes: Record<number, number>;
  } {
    const recentMetrics = this.getRecentMetrics(timeRange);
    const recentErrors = this.getRecentErrors(timeRange);

    const endpointStats = new Map<string, { count: number; totalTime: number }>();

    recentMetrics.forEach(metric => {
      const key = `${metric.method} ${metric.endpoint}`;
      const existing = endpointStats.get(key) || { count: 0, totalTime: 0 };
      endpointStats.set(key, {
        count: existing.count + 1,
        totalTime: existing.totalTime + metric.responseTime
      });
    });

    const topEndpoints = Array.from(endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: stats.totalTime / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const statusCodes: Record<number, number> = {};
    recentMetrics.forEach(metric => {
      statusCodes[metric.statusCode] = (statusCodes[metric.statusCode] || 0) + 1;
    });

    return {
      totalRequests: recentMetrics.length,
      avgResponseTime: recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
        : 0,
      errorCount: recentErrors.length,
      errorRate: recentMetrics.length > 0
        ? (recentErrors.length / recentMetrics.length) * 100
        : 0,
      topEndpoints,
      statusCodes
    };
  }

  // Get business metrics
  getBusinessMetrics(): BusinessMetrics {
    return { ...this.businessMetrics };
  }

  // Export metrics for external monitoring systems
  async exportMetrics(): Promise<{
    performance: PerformanceMetrics[];
    errors: ErrorMetrics[];
    business: BusinessMetrics;
    system: SystemHealth;
  }> {
    return {
      performance: this.metrics.slice(-1000), // Last 1000 metrics
      errors: this.errors.slice(-100), // Last 100 errors
      business: this.businessMetrics,
      system: await this.getSystemHealth()
    };
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const systemHealth = await this.getSystemHealth();
      const stats = this.getAggregatedStats(5 * 60 * 1000); // Last 5 minutes

      return {
        status: systemHealth.status,
        details: {
          uptime: systemHealth.uptime,
          metricsCollected: this.metrics.length,
          errorsRecorded: this.errors.length,
          recentStats: stats,
          memoryUsage: systemHealth.memoryUsage,
          cpuUsage: systemHealth.cpuUsage
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private getRecentMetrics(timeRange: number): PerformanceMetrics[] {
    const cutoff = Date.now() - timeRange;
    return this.metrics.filter(metric => metric.timestamp > cutoff);
  }

  private getRecentErrors(timeRange: number): ErrorMetrics[] {
    const cutoff = Date.now() - timeRange;
    return this.errors.filter(error => error.timestamp > cutoff);
  }

  private getMemoryUsage(): number {
    // Get memory usage in MB
    const memUsage = process.memoryUsage();
    return Math.round(memUsage.heapUsed / 1024 / 1024);
  }

  private getCpuUsage(): number {
    // Simplified CPU usage (would need more complex implementation for accurate measurement)
    return 0; // Placeholder - would need to track process CPU usage over time
  }

  private async getDatabaseConnections(): Promise<number> {
    // Placeholder - would need to integrate with database connection pool
    return 0;
  }

  private async getCacheHitRate(): Promise<number> {
    // Story 6.2: wired to the real cache hit/miss counters. Never throws —
    // a cache error must not break the monitoring health snapshot.
    try {
      return cacheService.getCacheStats().hitRate;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();
export default monitoringService;

// Middleware for automatic metrics collection
export const monitoringMiddleware = () => {
  return (req: AuthRequest, res: Response, next: any) => {
    const startTime = Date.now();

    // Override response methods to capture metrics
    const originalJson = res.json;
    const originalStatus = res.status;
    const originalSend = res.send;

    let statusCode = 200;

    res.status = function(code: number) {
      statusCode = code;
      return originalStatus.call(this, code);
    };

    res.json = function(data: any) {
      const responseTime = Date.now() - startTime;
      monitoringService.recordApiMetrics(req, res, responseTime);
      return originalJson.call(this, data);
    };

    res.send = function(data: any) {
      const responseTime = Date.now() - startTime;
      monitoringService.recordApiMetrics(req, res, responseTime);
      return originalSend.call(this, data);
    };

    next();
  };
};

// Error handling middleware
export const errorMonitoringMiddleware = () => {
  return (error: Error, req: AuthRequest, res: Response, next: any) => {
    monitoringService.recordError(error, req, res.statusCode);
    next(error);
  };
};