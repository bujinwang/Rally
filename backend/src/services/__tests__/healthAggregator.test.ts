/**
 * Health aggregator tests (Story 6.3, AC 7).
 */

import { getAggregatedHealth, worstStatus } from '../healthAggregator';

describe('worstStatus', () => {
  it('returns healthy when all are healthy', () => {
    expect(worstStatus('healthy', 'healthy')).toBe('healthy');
  });

  it('returns degraded when any is degraded', () => {
    expect(worstStatus('healthy', 'degraded')).toBe('degraded');
    expect(worstStatus('degraded', 'healthy')).toBe('degraded');
  });

  it('returns unhealthy when any is unhealthy', () => {
    expect(worstStatus('healthy', 'unhealthy')).toBe('unhealthy');
    expect(worstStatus('degraded', 'unhealthy')).toBe('unhealthy');
  });
});

describe('getAggregatedHealth', () => {
  it('returns a health snapshot with all subsystems', async () => {
    const health = await getAggregatedHealth();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('version');
    expect(health).toHaveProperty('uptime');
    expect(health.subsystems).toHaveProperty('database');
    expect(health.subsystems).toHaveProperty('redis');
    expect(health.subsystems).toHaveProperty('cache');
    expect(health.subsystems).toHaveProperty('process');

    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.subsystems.database.status);
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.subsystems.process.status);
  });

  it('includes process metrics', async () => {
    const health = await getAggregatedHealth();
    const processHealth = health.subsystems.process;

    expect(processHealth.details).toHaveProperty('memoryUsageMB');
    expect(processHealth.details).toHaveProperty('cpuUsagePercent');
    expect(processHealth.details).toHaveProperty('uptime');
    expect(typeof processHealth.details.memoryUsageMB).toBe('number');
    expect(typeof processHealth.details.cpuUsagePercent).toBe('number');
  });
});
