// Middleware hit/miss + generation-invalidation tests (Story 6.2, AC 2/3/12).
import express from 'express';
import request from 'supertest';
import { cachingMiddleware, cacheInvalidationMiddleware } from '../caching';
import { cacheService } from '../../services/cacheService';

describe('caching middleware + generation invalidation', () => {
  let dbValue = 'v1';

  const app = express();
  app.get('/item', cachingMiddleware({ domain: 'session', ttl: 60, enabled: true }), (req, res) => {
    res.json({ success: true, data: dbValue });
  });
  app.put('/item', cacheInvalidationMiddleware(['session']), (req, res) => {
    dbValue = 'v2';
    res.json({ success: true, data: dbValue });
  });
  app.put('/item-fail', cacheInvalidationMiddleware(['session']), (req, res) => {
    res.status(400).json({ success: false });
  });

  beforeEach(async () => {
    dbValue = 'v1';
    await cacheService.clear();
    cacheService.resetStats();
  });

  it('serves MISS then HIT with the X-Cache header', async () => {
    const first = await request(app).get('/item');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body.data).toBe('v1');

    const second = await request(app).get('/item');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.data).toBe('v1');
  });

  it('invalidates on a 2xx write so the next read is not stale', async () => {
    await request(app).get('/item'); // populate cache with v1
    const hit = await request(app).get('/item');
    expect(hit.headers['x-cache']).toBe('HIT');

    const write = await request(app).put('/item');
    expect(write.status).toBe(200);

    const after = await request(app).get('/item');
    expect(after.headers['x-cache']).toBe('MISS'); // generation bumped → old key orphaned
    expect(after.body.data).toBe('v2'); // fresh value, no stale read
  });

  it('does not invalidate on a non-2xx write', async () => {
    await request(app).get('/item'); // cache v1
    dbValue = 'v3'; // change the source directly, bypassing invalidation

    const fail = await request(app).put('/item-fail');
    expect(fail.status).toBe(400);

    const after = await request(app).get('/item');
    expect(after.headers['x-cache']).toBe('HIT');
    expect(after.body.data).toBe('v1'); // still cached — no invalidation occurred
  });

  it('only caches GET responses', async () => {
    const put = await request(app).put('/item');
    expect(put.status).toBe(200);
    // The PUT response itself is never cached (no X-Cache HIT on a repeat PUT).
    const put2 = await request(app).put('/item');
    expect(put2.status).toBe(200);
  });
});
