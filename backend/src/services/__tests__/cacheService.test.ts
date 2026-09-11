// Interface-parity tests for CacheService after the store abstraction
// (Story 6.2, AC 5). Redis-free.
import { cacheService } from '../cacheService';

describe('CacheService', () => {
  beforeEach(async () => {
    await cacheService.clear();
    cacheService.resetStats();
  });

  describe('generic get / set / delete / exists / clear', () => {
    it('stores and retrieves values', async () => {
      await cacheService.set('k1', { hello: 'world' });
      expect(await cacheService.get('k1')).toEqual({ hello: 'world' });
    });

    it('returns null for missing keys', async () => {
      expect(await cacheService.get('nope')).toBeNull();
    });

    it('overwrites an existing key', async () => {
      await cacheService.set('k3', 'old');
      await cacheService.set('k3', 'new');
      expect(await cacheService.get('k3')).toBe('new');
    });

    it('delete removes a key', async () => {
      await cacheService.set('k4', 'value');
      await cacheService.delete('k4');
      expect(await cacheService.get('k4')).toBeNull();
    });

    it('delete no-ops on a missing key', async () => {
      await expect(cacheService.delete('no-such-key')).resolves.toBeUndefined();
    });

    it('exists reflects presence', async () => {
      await cacheService.set('k5', 'val', 3600);
      expect(await cacheService.exists('k5')).toBe(true);
      expect(await cacheService.exists('missing')).toBe(false);
    });

    it('clear removes all keys', async () => {
      await cacheService.set('a', 1);
      await cacheService.set('b', 2);
      await cacheService.clear();
      expect(await cacheService.get('a')).toBeNull();
      expect(await cacheService.get('b')).toBeNull();
    });

    it('clear with a pattern removes only matching keys', async () => {
      await cacheService.set('discovery:xyz', 1);
      await cacheService.set('session:abc', 2);
      await cacheService.clear('discovery:*');
      expect(await cacheService.get('discovery:xyz')).toBeNull();
      expect(await cacheService.get('session:abc')).toBe(2);
    });
  });

  describe('TTL expiry', () => {
    it('expires entries after their TTL', async () => {
      jest.useFakeTimers();
      try {
        await cacheService.set('exp', 'v', 1);
        expect(await cacheService.get('exp')).toBe('v');
        jest.advanceTimersByTime(1500);
        expect(await cacheService.get('exp')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('domain caches', () => {
    it('session get / set / invalidate', async () => {
      await cacheService.setSession('s1', { name: 'Test' });
      expect(await cacheService.getSession('s1')).toEqual({ name: 'Test' });
      await cacheService.invalidateSession('s1');
      expect(await cacheService.getSession('s1')).toBeNull();
    });

    it('discovery get / set / invalidate', async () => {
      await cacheService.setDiscoveryResults({ sport: 'tennis' }, undefined, [{ id: 'd1' }]);
      expect(await cacheService.getDiscoveryResults({ sport: 'tennis' }, undefined)).toEqual([{ id: 'd1' }]);
      await cacheService.invalidateDiscoveryCache();
      expect(await cacheService.getDiscoveryResults({ sport: 'tennis' }, undefined)).toBeNull();
    });

    it('popular sessions get / set', async () => {
      await cacheService.setPopularSessions([{ id: 'p1' }]);
      expect(await cacheService.getPopularSessions()).toEqual([{ id: 'p1' }]);
    });

    it('nearby sessions get / set', async () => {
      await cacheService.setNearbySessions(40.78, -73.96, 10, [{ id: 'n1' }]);
      expect(await cacheService.getNearbySessions(40.78, -73.96, 10)).toEqual([{ id: 'n1' }]);
    });

    it('stats domain get / set', async () => {
      await cacheService.setStats({ totalSessions: 100 });
      expect(await cacheService.getStats()).toEqual({ totalSessions: 100 });
    });
  });

  describe('generation invalidation', () => {
    it('bumps the generation counter', async () => {
      const before = await cacheService.getGeneration('session');
      await cacheService.invalidateDomain('session');
      const after = await cacheService.getGeneration('session');
      expect(after).toBe(before + 1);
    });
  });

  describe('metrics', () => {
    it('tracks hits and misses', async () => {
      await cacheService.set('m1', 'v');
      await cacheService.get('m1'); // hit
      await cacheService.get('m2'); // miss

      const stats = cacheService.getCacheStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.driver).toBe('memory');
    });

    it('getMetrics is an alias for getCacheStats', async () => {
      expect(cacheService.getMetrics()).toEqual(cacheService.getCacheStats());
    });
  });

  describe('healthCheck / disconnect', () => {
    it('returns healthy status with entry details', async () => {
      await cacheService.set('h1', 1);
      const health = await cacheService.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.details.entries).toBeGreaterThanOrEqual(1);
    });

    it('disconnect clears all cache entries', async () => {
      await cacheService.set('x', 1);
      await cacheService.disconnect();
      expect(await cacheService.get('x')).toBeNull();
    });
  });
});
