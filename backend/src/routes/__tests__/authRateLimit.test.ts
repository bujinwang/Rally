/**
 * P1 — proves the auth rate limiter is ACTIVE under test (not bypassed) and
 * returns 429 RATE_LIMIT_EXCEEDED when its ceiling is exceeded, while the
 * production ceilings (auth=5, sensitive=10) remain unchanged.
 *
 * The test-only env override is read by `auth.ts` at import time, so it must be
 * set before the router is required (done in `beforeAll`), and is removed in
 * `afterAll` so it cannot leak to other suites sharing the Jest worker.
 */
process.env.AUTH_RATE_LIMIT_MAX_TEST = '3';

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    mvpSession: { findMany: jest.fn(), updateMany: jest.fn() },
    mvpPlayer: { findMany: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';

const CLIENT_IP = '203.0.113.77';

describe('auth rate limiting (P1)', () => {
  let app: express.Express;

  beforeAll(() => {
    // Required AFTER the env override so auth.ts builds its limiter with max=3.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const authRouter = require('../auth').default;
    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
  });

  afterAll(() => {
    delete process.env.AUTH_RATE_LIMIT_MAX_TEST;
  });

  it('returns 429 RATE_LIMIT_EXCEEDED once the auth limit is exceeded', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/auth/login')
        .set('x-forwarded-for', CLIENT_IP)
        .send({}); // invalid body → 400, but the limiter counts first
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses[3]).toBe(429);

    const blocked = await request(app)
      .post('/auth/login')
      .set('x-forwarded-for', CLIENT_IP)
      .send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('keeps the production auth ceiling at 5', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRateLimiters } = require('../../middleware/rateLimit');
    const prodApp = express();
    prodApp.use(createRateLimiters().auth);
    prodApp.get('/x', (_req: express.Request, res: express.Response) => res.json({ ok: true }));

    const res = await request(prodApp).get('/x').set('x-forwarded-for', '203.0.113.88');
    expect(res.headers['x-ratelimit-limit']).toBe('5');
  });

  it('keeps the production sensitive ceiling at 10', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRateLimiters } = require('../../middleware/rateLimit');
    const prodApp = express();
    prodApp.use(createRateLimiters().sensitive);
    prodApp.get('/x', (_req: express.Request, res: express.Response) => res.json({ ok: true }));

    const res = await request(prodApp).get('/x').set('x-forwarded-for', '203.0.113.89');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });

  // Regression: a successful login used to consume the brute-force budget, so
  // five ordinary sign-ins inside 15 minutes locked the user out with a 429.
  it('does not charge successful requests against the auth budget', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rateLimit } = require('../../middleware/rateLimit');
    const okApp = express();
    okApp.use(
      rateLimit({
        windowMs: 60_000,
        maxRequests: 2,
        skipSuccessfulRequests: true,
        keyGenerator: () => 'test:success-skip',
      })
    );
    okApp.post('/ok', (_req: express.Request, res: express.Response) => res.json({ ok: true }));

    for (let i = 0; i < 6; i++) {
      const res = await request(okApp).post('/ok').send({});
      expect(res.status).toBe(200);
      // Let the post-response decrement land before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  // Brute-force protection must survive the change: failures still count.
  it('still counts failed requests towards the auth budget', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rateLimit } = require('../../middleware/rateLimit');
    const failApp = express();
    failApp.use(
      rateLimit({
        windowMs: 60_000,
        maxRequests: 2,
        skipSuccessfulRequests: true,
        keyGenerator: () => 'test:failure-counts',
      })
    );
    failApp.post('/fail', (_req: express.Request, res: express.Response) =>
      res.status(401).json({ ok: false })
    );

    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(failApp).post('/fail').send({});
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 429]);
  });

  // Regression: /auth/refresh shared the strict auth bucket, so the client's
  // automatic refresh-on-401 could exhaust the login budget on its own.
  it('gives /auth/refresh its own, more generous bucket', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRateLimiters } = require('../../middleware/rateLimit');
    const refreshApp = express();
    refreshApp.use(createRateLimiters().refresh);
    refreshApp.post('/x', (_req: express.Request, res: express.Response) => res.json({ ok: true }));

    const res = await request(refreshApp).post('/x').set('x-forwarded-for', '203.0.113.99');
    expect(res.headers['x-ratelimit-limit']).toBe('60');
  });

  // `backend/.env` is tracked in git, so a dev-only ceiling must never be able
  // to weaken the limiter in production.
  describe('ceiling overrides are ignored in production', () => {
    const KEY = 'AUTH_RATE_LIMIT_MAX';
    let previous: string | undefined;

    beforeEach(() => {
      previous = process.env[KEY];
      process.env[KEY] = '50';
    });

    afterEach(() => {
      if (previous === undefined) delete process.env[KEY];
      else process.env[KEY] = previous;
    });

    it('ignores the env value when NODE_ENV=production', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { resolveCeilingOverride } = require('../../middleware/rateLimit');
      expect(resolveCeilingOverride(KEY, 'production')).toBeUndefined();
    });

    it('honours the env value outside production', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { resolveCeilingOverride } = require('../../middleware/rateLimit');
      expect(resolveCeilingOverride(KEY, 'development')).toBe(50);
    });

    it('ignores malformed values', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { resolveCeilingOverride } = require('../../middleware/rateLimit');
      process.env[KEY] = 'not-a-number';
      expect(resolveCeilingOverride(KEY, 'development')).toBeUndefined();
      process.env[KEY] = '0';
      expect(resolveCeilingOverride(KEY, 'development')).toBeUndefined();
    });
  });
});
