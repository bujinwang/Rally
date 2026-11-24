/**
 * Rate-limit ceilings must be generous while developing and pinned everywhere
 * else.
 *
 * Context: `backend/.env` is git-tracked and carries dev-only ceilings so a
 * heavy manual test pass from one localhost IP is not throttled. That is only
 * safe if three things hold, and this suite pins all three:
 *
 *   1. `NODE_ENV=production` ignores the dev ceilings entirely.
 *   2. `NODE_ENV=test` keeps the real (strict) ceilings, so the existing
 *      429-regression suites are still meaningful.
 *   3. Local development actually resolves to the high ceilings.
 *
 * The resolved ceiling is read back from the `X-RateLimit-Limit` response
 * header: express-rate-limit exposes no public accessor on the middleware.
 */
import express from 'express';
import request from 'supertest';
import { createRateLimiters, resolveCeiling } from '../rateLimit';

/** Mount a limiter on a throwaway route and report the ceiling it advertises. */
async function advertisedCeiling(middleware: any, ip = '203.0.113.10'): Promise<number> {
  const app = express();
  app.use(middleware);
  app.get('/x', (_req, res) => res.json({ ok: true }));

  const res = await request(app).get('/x').set('x-forwarded-for', ip);
  return Number(res.headers['x-ratelimit-limit']);
}

describe('rate limit ceilings', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  describe('resolveCeiling', () => {
    it('pins the production value regardless of any env override', () => {
      process.env.AUTH_RATE_LIMIT_MAX = '999999';
      expect(resolveCeiling('AUTH_RATE_LIMIT_MAX', 5, 10000, 'production')).toBe(5);
    });

    it('keeps the strict ceiling under test so 429 regressions stay visible', () => {
      process.env.AUTH_RATE_LIMIT_MAX = '999999';
      expect(resolveCeiling('AUTH_RATE_LIMIT_MAX', 5, 10000, 'test')).toBe(5);
    });

    it('uses the dev default in development when no override is set', () => {
      delete process.env.AUTH_RATE_LIMIT_MAX;
      expect(resolveCeiling('AUTH_RATE_LIMIT_MAX', 5, 10000, 'development')).toBe(10000);
    });

    it('honours an explicit dev override', () => {
      process.env.AUTH_RATE_LIMIT_MAX = '250';
      expect(resolveCeiling('AUTH_RATE_LIMIT_MAX', 5, 10000, 'development')).toBe(250);
    });

    it('falls back to the dev default when the override is malformed', () => {
      process.env.AUTH_RATE_LIMIT_MAX = 'not-a-number';
      expect(resolveCeiling('AUTH_RATE_LIMIT_MAX', 5, 10000, 'development')).toBe(10000);
    });
  });

  describe('createRateLimiters() under test', () => {
    it('falls back to the strict production ceilings', async () => {
      // Jest runs with NODE_ENV=test. This is the invariant the adversarial
      // assertions in authRateLimit.test.ts rely on.
      delete process.env.AUTH_RATE_LIMIT_MAX;
      delete process.env.SENSITIVE_RATE_LIMIT_MAX;
      delete process.env.REFRESH_RATE_LIMIT_MAX;
      delete process.env.API_RATE_LIMIT_MAX;

      const limiters = createRateLimiters();

      expect(await advertisedCeiling(limiters.auth, '203.0.113.11')).toBe(5);
      expect(await advertisedCeiling(limiters.sensitive, '203.0.113.12')).toBe(10);
      expect(await advertisedCeiling(limiters.refresh, '203.0.113.13')).toBe(60);
      expect(await advertisedCeiling(limiters.api, '203.0.113.14')).toBe(100);
    });

    it('still respects explicit caller overrides when under test', async () => {
      const limiters = createRateLimiters({ authMax: 3, sensitiveMax: 7 });

      expect(await advertisedCeiling(limiters.auth, '203.0.113.15')).toBe(3);
      expect(await advertisedCeiling(limiters.sensitive, '203.0.113.16')).toBe(7);
    });
  });
});
