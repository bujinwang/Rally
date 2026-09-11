// Degradation / fallback tests (Story 6.2, AC 14). Redis is MOCKED — no socket.
jest.mock('redis', () => ({ createClient: jest.fn() }));

import { createClient } from 'redis';
import { CacheService } from '../../cacheService';

const createClientMock = createClient as unknown as jest.Mock;

/** Minimal fake redis client. */
function baseClient(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    isOpen: true,
    connect: jest.fn(async () => undefined),
    on: jest.fn(),
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => 0),
    incr: jest.fn(async () => 1),
    scan: jest.fn(async () => ({ cursor: '0', keys: [] })),
    ping: jest.fn(async () => 'PONG'),
    quit: jest.fn(async () => 'OK'),
    ...overrides,
  };
}

describe('CacheService graceful degradation (AC 14)', () => {
  const ORIGINAL_URL = process.env.REDIS_URL;

  afterEach(() => {
    if (ORIGINAL_URL === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = ORIGINAL_URL;
    }
    createClientMock.mockReset();
  });

  it('falls back to the memory store when connect() rejects', async () => {
    createClientMock.mockReturnValue(
      baseClient({ connect: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await svc.set('k', 'v', 60);
    expect(await svc.get('k')).toBe('v');

    const health = await svc.healthCheck();
    expect(health.status).toBe('degraded');
    expect(health.details.driver).toBe('memory');

    await svc.disconnect();
  });

  it('treats a read error as a cache miss and never throws', async () => {
    createClientMock.mockReturnValue(
      baseClient({ get: jest.fn(async () => { throw new Error('read down'); }) })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await expect(svc.get('k')).resolves.toBeNull();

    await svc.disconnect();
  });

  it('swallows a write error and still serves from the memory fallback', async () => {
    createClientMock.mockReturnValue(
      baseClient({
        get: jest.fn(async () => { throw new Error('down'); }),
        set: jest.fn(async () => { throw new Error('down'); }),
      })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await expect(svc.set('k', 'v', 60)).resolves.toBeUndefined();
    expect(await svc.get('k')).toBe('v');

    await svc.disconnect();
  });

  it('never throws when the store is entirely unavailable', async () => {
    createClientMock.mockReturnValue(
      baseClient({
        get: jest.fn(async () => { throw new Error('down'); }),
        set: jest.fn(async () => { throw new Error('down'); }),
        incr: jest.fn(async () => { throw new Error('down'); }),
      })
    );
    process.env.REDIS_URL = 'redis://localhost:6379';

    const svc = new CacheService({ redisEnabledOverride: true });
    await svc.init();

    await expect(svc.invalidateDomain('session')).resolves.toBeUndefined();
    await expect(svc.healthCheck()).resolves.toBeDefined();

    await svc.disconnect();
  });
});
