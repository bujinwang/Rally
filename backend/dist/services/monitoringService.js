"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMonitoringMiddleware = exports.monitoringMiddleware = exports.monitoringService = void 0;
class MonitoringService {
    constructor() {
        this.metrics = [];
        this.errors = [];
        this.maxMetricsHistory = 10000; // Keep last 10k metrics
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
    startPeriodicCleanup() {
        // Clean up old metrics every hour
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 60 * 60 * 1000);
    }
    cleanupOldMetrics() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        // Remove metrics older than 24 hours
        this.metrics = this.metrics.filter(metric => metric.timestamp > oneDayAgo);
        this.errors = this.errors.filter(error => error.timestamp > oneDayAgo);
        console.log(`🧹 Monitoring cleanup: ${this.metrics.length} metrics, ${this.errors.length} errors retained`);
    }
    // Record API performance metrics
    recordApiMetrics(req, res, responseTime) {
        const metrics = {
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
    recordError(error, req, statusCode) {
        const errorMetrics = {
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
        console.error(`💥 Error recorded: ${error.message} at ${errorMetrics.endpoint}`);
    }
    // Update business metrics
    updateBusinessMetrics(metrics) {
        Object.assign(this.businessMetrics, metrics);
    }
    // Get comprehensive system health
    async getSystemHealth() {
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
        let status = 'healthy';
        if (errorRate > 5 || avgResponseTime > 2000) {
            status = 'unhealthy';
        }
        else if (errorRate > 1 || avgResponseTime > 1000) {
            status = 'degraded';
        }
        return {
            status,
            uptime,
            memoryUsage: this.getMemoryUsage(),
            cpuUsage: this.getCpuUsage(),
            databaseConnections: await this.getDatabaseConnections(),
            cacheHitRate: await this.getCacheHitRate(),
            responseTimeAvg: avgResponseTime,
            errorRate
        };
    }
    // Get performance metrics for a time range
    getPerformanceMetrics(startTime, endTime = Date.now()) {
        return this.metrics.filter(metric => metric.timestamp >= startTime && metric.timestamp <= endTime);
    }
    // Get error metrics for a time range
    getErrorMetrics(startTime, endTime = Date.now()) {
        return this.errors.filter(error => error.timestamp >= startTime && error.timestamp <= endTime);
    }
    // Get aggregated statistics
    getAggregatedStats(timeRange = 60 * 60 * 1000) {
        const recentMetrics = this.getRecentMetrics(timeRange);
        const recentErrors = this.getRecentErrors(timeRange);
        const endpointStats = new Map();
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
        const statusCodes = {};
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
    getBusinessMetrics() {
        return { ...this.businessMetrics };
    }
    // Export metrics for external monitoring systems
    async exportMetrics() {
        return {
            performance: this.metrics.slice(-1000), // Last 1000 metrics
            errors: this.errors.slice(-100), // Last 100 errors
            business: this.businessMetrics,
            system: await this.getSystemHealth()
        };
    }
    // Health check
    async healthCheck() {
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
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
    getRecentMetrics(timeRange) {
        const cutoff = Date.now() - timeRange;
        return this.metrics.filter(metric => metric.timestamp > cutoff);
    }
    getRecentErrors(timeRange) {
        const cutoff = Date.now() - timeRange;
        return this.errors.filter(error => error.timestamp > cutoff);
    }
    getMemoryUsage() {
        // Get memory usage in MB
        const memUsage = process.memoryUsage();
        return Math.round(memUsage.heapUsed / 1024 / 1024);
    }
    getCpuUsage() {
        // Simplified CPU usage (would need more complex implementation for accurate measurement)
        return 0; // Placeholder - would need to track process CPU usage over time
    }
    async getDatabaseConnections() {
        // Placeholder - would need to integrate with database connection pool
        return 0;
    }
    async getCacheHitRate() {
        // Placeholder - would need to integrate with cache service to get hit/miss stats
        return 0;
    }
}
// Export singleton instance
exports.monitoringService = new MonitoringService();
exports.default = exports.monitoringService;
// Middleware for automatic metrics collection
const monitoringMiddleware = () => {
    return (req, res, next) => {
        const startTime = Date.now();
        // Override response methods to capture metrics
        const originalJson = res.json;
        const originalStatus = res.status;
        const originalSend = res.send;
        let statusCode = 200;
        res.status = function (code) {
            statusCode = code;
            return originalStatus.call(this, code);
        };
        res.json = function (data) {
            const responseTime = Date.now() - startTime;
            exports.monitoringService.recordApiMetrics(req, res, responseTime);
            return originalJson.call(this, data);
        };
        res.send = function (data) {
            const responseTime = Date.now() - startTime;
            exports.monitoringService.recordApiMetrics(req, res, responseTime);
            return originalSend.call(this, data);
        };
        next();
    };
};
exports.monitoringMiddleware = monitoringMiddleware;
// Error handling middleware
const errorMonitoringMiddleware = () => {
    return (error, req, res, next) => {
        exports.monitoringService.recordError(error, req, res.statusCode);
        next(error);
    };
};
exports.errorMonitoringMiddleware = errorMonitoringMiddleware;
//# sourceMappingURL=monitoringService.js.map