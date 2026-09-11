/**
 * Health aggregator (Story 6.3, AC 7).
 *
 * Combines health snapshots from all subsystems — database, Redis/cache,
 * and process — into a single aggregated response. The overall status is
 * the worst of all subsystems (healthy < degraded < unhealthy).
 */

import { prisma } from '../config/database';
import { cacheService } from './cacheService';

export interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: Record<string, unknown>;
}

export interface AggregatedHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  subsystems: {
    database: SubsystemHealth;
    redis: SubsystemHealth;
    cache: SubsystemHealth;
    process: SubsystemHealth;
  };
}

// Cache DB connection count for 5s to avoid per-request query cost
let cachedDbConnections: number | null = null;
let cachedDbConnectionsAt = 0;
const DB_CACHE_TTL_MS = 5000;

async function getDbConnections(): Promise<number> {
  const now = Date.now();
  if (cachedDbConnections !== null && now - cachedDbConnectionsAt < DB_CACHE_TTL_MS) {
    return cachedDbConnections;
  }
  try {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
    `;
    cachedDbConnections = Number(result[0]?.count ?? 0);
    cachedDbConnectionsAt = now;
    return cachedDbConnections;
  } catch {
    return 0;
  }
}

async function checkDatabase(): Promise<SubsystemHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const connections = await getDbConnections();
    return {
      status: 'healthy',
      details: { connections, message: 'Database reachable' },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        message: 'Database unreachable',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function checkRedis(): Promise<SubsystemHealth> {
  try {
    const cacheHealth = await cacheService.healthCheck();
    return {
      status: cacheHealth.status,
      details: cacheHealth.details,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        message: 'Cache health check failed',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function checkCache(): Promise<SubsystemHealth> {
  // Cache health is the same as Redis health for this backend
  return checkRedis();
}

// Cache CPU usage, sampled every 5s
let lastCpuUsage: NodeJS.CpuUsage | null = null;
let lastCpuUsageAt = 0;
let cachedCpuPercent = 0;
const CPU_CACHE_TTL_MS = 5000;

function getCpuPercent(): number {
  const now = Date.now();
  if (lastCpuUsage && now - lastCpuUsageAt < CPU_CACHE_TTL_MS) {
    return cachedCpuPercent;
  }
  const current = process.cpuUsage(lastCpuUsage ?? undefined);
  const elapsedMs = lastCpuUsage ? now - lastCpuUsageAt : 1000;
  const totalMicros = current.user + current.system;
  // Convert to percentage of elapsed wall time
  cachedCpuPercent = Math.min(100, Math.round((totalMicros / 1000 / elapsedMs) * 100));
  lastCpuUsage = process.cpuUsage();
  lastCpuUsageAt = now;
  return cachedCpuPercent;
}

function checkProcess(): SubsystemHealth {
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);
  const cpuPercent = getCpuPercent();

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (memMB > 512 || cpuPercent > 90) {
    status = 'degraded';
  }

  return {
    status,
    details: {
      memoryUsageMB: memMB,
      cpuUsagePercent: cpuPercent,
      uptime: process.uptime(),
    },
  };
}

export function worstStatus(
  ...statuses: Array<'healthy' | 'degraded' | 'unhealthy'>
): 'healthy' | 'degraded' | 'unhealthy' {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
}

export async function getAggregatedHealth(): Promise<AggregatedHealth> {
  const [database, redis, cache, processHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkCache(),
    checkProcess(),
  ]);

  return {
    status: worstStatus(database.status, redis.status, cache.status, processHealth.status),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
    uptime: process.uptime(),
    subsystems: {
      database,
      redis,
      cache,
      process: processHealth,
    },
  };
}
