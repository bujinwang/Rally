// Unit tests for MemoryStore (Story 6.2, AC 15). Redis-free.
import { MemoryStore } from '../memoryStore';

describe('MemoryStore', () => {
  it('stores and retrieves values', async () => {
    const store = new MemoryStore();
    await store.set('k', { a: 1 }, 60);
    expect(await store.get('k')).toEqual({ a: 1 });
  });

  it('returns null for missing keys', async () => {
    const store = new MemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('overwrites an existing key', async () => {
    const store = new MemoryStore();
    await store.set('k', 'old', 60);
    await store.set('k', 'new', 60);
    expect(await store.get('k')).toBe('new');
  });

  it('expires entries after their TTL', async () => {
    jest.useFakeTimers();
    try {
      const store = new MemoryStore();
      await store.set('k', 'v', 1);
      expect(await store.get('k')).toBe('v');
      jest.advanceTimersByTime(1500);
      expect(await store.get('k')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('evicts least-recently-used entries under memory pressure', async () => {
    // ~1 KB cap forces eviction after the second ~600-byte entry.
    const store = new MemoryStore({ maxMemoryMB: 0.001 });
    await store.set('a', 'x'.repeat(600), 60);
    await store.get('a'); // touch 'a' so it is the most-recently used at first
    await store.set('b', 'y'.repeat(600), 60);

    expect(await store.get('b')).not.toBeNull();
    expect(await store.get('a')).toBeNull();
  });

  it('skips entries larger than maxEntryBytes', async () => {
    const store = new MemoryStore({ maxEntryBytes: 50 });
    await store.set('big', 'z'.repeat(500), 60);
    expect(await store.get('big')).toBeNull();

    await store.set('small', 'ok', 60);
    expect(await store.get('small')).toBe('ok');
  });

  it('incr increments a persistent counter', async () => {
    const store = new MemoryStore();
    expect(await store.incr('gen:session')).toBe(1);
    expect(await store.incr('gen:session')).toBe(2);
    expect(await store.get('gen:session')).toBe(2);
  });

  it('delete / exists / clear', async () => {
    const store = new MemoryStore();
    await store.set('a', 1, 60);
    await store.set('b', 2, 60);

    expect(await store.exists('a')).toBe(true);
    await store.delete('a');
    expect(await store.exists('a')).toBe(false);

    await store.clear();
    expect(await store.get('b')).toBeNull();
  });

  it('clear with a pattern removes only matching keys', async () => {
    const store = new MemoryStore();
    await store.set('discovery:xyz', 1, 60);
    await store.set('session:abc', 2, 60);

    await store.clear('discovery:*');
    expect(await store.get('discovery:xyz')).toBeNull();
    expect(await store.get('session:abc')).toBe(2);
  });

  it('reports healthy with entry count', async () => {
    const store = new MemoryStore();
    await store.set('a', 1, 60);
    const health = await store.health();
    expect(health.status).toBe('healthy');
    expect(health.driver).toBe('memory');
    expect(health.details.entries).toBe(1);
  });
});
