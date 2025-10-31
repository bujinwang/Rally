import { Request, Response } from 'express';
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
declare class MonitoringService {
    private metrics;
    private errors;
    private businessMetrics;
    private startTime;
    private maxMetricsHistory;
    constructor();
    private startPeriodicCleanup;
    private cleanupOldMetrics;
    recordApiMetrics(req: AuthRequest, res: Response, responseTime: number): void;
    recordError(error: Error, req?: AuthRequest, statusCode?: number): void;
    updateBusinessMetrics(metrics: Partial<BusinessMetrics>): void;
    getSystemHealth(): Promise<SystemHealth>;
    getPerformanceMetrics(startTime: number, endTime?: number): PerformanceMetrics[];
    getErrorMetrics(startTime: number, endTime?: number): ErrorMetrics[];
    getAggregatedStats(timeRange?: number): {
        totalRequests: number;
        avgResponseTime: number;
        errorCount: number;
        errorRate: number;
        topEndpoints: Array<{
            endpoint: string;
            count: number;
            avgTime: number;
        }>;
        statusCodes: Record<number, number>;
    };
    getBusinessMetrics(): BusinessMetrics;
    exportMetrics(): Promise<{
        performance: PerformanceMetrics[];
        errors: ErrorMetrics[];
        business: BusinessMetrics;
        system: SystemHealth;
    }>;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: any;
    }>;
    private getRecentMetrics;
    private getRecentErrors;
    private getMemoryUsage;
    private getCpuUsage;
    private getDatabaseConnections;
    private getCacheHitRate;
}
export declare const monitoringService: MonitoringService;
export default monitoringService;
export declare const monitoringMiddleware: () => (req: AuthRequest, res: Response, next: any) => void;
export declare const errorMonitoringMiddleware: () => (error: Error, req: AuthRequest, res: Response, next: any) => void;
//# sourceMappingURL=monitoringService.d.ts.map