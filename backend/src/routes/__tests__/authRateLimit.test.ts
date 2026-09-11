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
});
