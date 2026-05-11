// @ts-nocheck

// Mock setInterval before the module loads
(globalThis as any).setInterval = jest.fn(() => ({ unref: jest.fn() }));
(global as any).setInterval = (globalThis as any).setInterval;

import { cacheService } from '../cacheService';

describe('CacheService', () => {
  beforeEach(() => {
    (cacheService as any).memoryCache.clear();
    (cacheService as any).totalMemoryUsage = 0;
  });

  describe('get / set', () => {
    it('stores and retrieves values', async () => {
      await cacheService.set('k1', { hello: 'world' });
      const val = await cacheService.get('k1');
      expect(val).toEqual({ hello: 'world' });
    });

    it('returns null for missing keys', async () => {
      expect(await cacheService.get('nope')).toBeNull();
    });

    it('expires after expiry time', async () => {
      await cacheService.set('k2', 'data');
      // Manually expire it
      const item = (cacheService as any).memoryCache.get('k2');
      item.expires = 1; // expired in 1970
      expect(await cacheService.get('k2')).toBeNull();
    });

    it('removes old item when overwriting', async () => {
      await cacheService.set('k3', 'old');
      await cacheService.set('k3', 'new');
      expect(await cacheService.get('k3')).toBe('new');
    });
  });

  describe('delete', () => {
    it('removes a key', async () => {
      await cacheService.set('k4', 'value');
      await cacheService.delete('k4');
      expect(await cacheService.get('k4')).toBeNull();
    });

    it('no-ops on missing key', async () => {
      await expect(cacheService.delete('no-such-key')).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('returns true for existing unexpired key', async () => {
      await cacheService.set('k5', 'val', 3600);
      expect(await cacheService.exists('k5')).toBe(true);
    });

    it('returns false for missing key', async () => {
      expect(await cacheService.exists('missing')).toBe(false);
    });

    it('returns false for expired key', async () => {
      await cacheService.set('k6', 'val');
      // Manually expire it
      const item = (cacheService as any).memoryCache.get('k6');
      item.expires = Date.now() - 1000;
      expect(await cacheService.exists('k6')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all keys', async () => {
      await cacheService.set('a', 1);
      await cacheService.set('b', 2);
      await cacheService.clear();
      expect(await cacheService.get('a')).toBeNull();
      expect(await cacheService.get('b')).toBeNull();
    });

    it('clears by pattern', async () => {
      await cacheService.set('discovery:xyz', 1);
      await cacheService.set('session:abc', 2);
      await cacheService.clear('discovery:*');
      expect(await cacheService.get('discovery:xyz')).toBeNull();
      expect(await cacheService.get('session:abc')).toBe(2);
    });
  });

  describe('session cache', () => {
    it('getSession / setSession / invalidateSession', async () => {
      await cacheService.setSession('s1', { name: 'Test' });
      expect(await cacheService.getSession('s1')).toEqual({ name: 'Test' });
      await cacheService.invalidateSession('s1');
      expect(await cacheService.getSession('s1')).toBeNull();
    });
  });

  describe('popular sessions cache', () => {
    it('getPopularSessions / setPopularSessions', async () => {
      await cacheService.setPopularSessions([{ id: 'p1' }]);
      expect(await cacheService.getPopularSessions()).toEqual([{ id: 'p1' }]);
    });
  });

  describe('nearby sessions cache', () => {
    it('getNearbySessions / setNearbySessions', async () => {
      await cacheService.setNearbySessions(40.78, -73.96, 10, [{ id: 'n1' }]);
      expect(await cacheService.getNearbySessions(40.78, -73.96, 10)).toEqual([{ id: 'n1' }]);
    });
  });

  describe('stats cache', () => {
    it('getStats / setStats', async () => {
      await cacheService.setStats({ totalSessions: 100 });
      expect(await cacheService.getStats()).toEqual({ totalSessions: 100 });
    });
  });

  describe('healthCheck', () => {
    it('returns healthy status', async () => {
      const health = await cacheService.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.details.entries).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('clears all cache entries', async () => {
      await cacheService.set('x', 1);
      await cacheService.disconnect();
      expect(await cacheService.get('x')).toBeNull();
    });
  });

  describe('access tracking', () => {
    it('increments accessCount on get', async () => {
      await cacheService.set('k7', 'val');
      await cacheService.get('k7');
      await cacheService.get('k7');
      const item = (cacheService as any).memoryCache.get('k7');
      expect(item.accessCount).toBe(2);
    });
  });
});
