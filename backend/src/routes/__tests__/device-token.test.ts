/**
 * Device token (Option B, Phase 1) — tests with teeth.
 *
 * These exercise the REAL `resolveIdentity` (design §3.1), the REAL
 * `deviceTokenGuard`, the REAL `deviceTokenService` and the REAL `/device`
 * routes, against an in-memory stand-in for the `device_tokens` table. The
 * precedence rules — token wins over raw id, and a present-but-invalid token is
 * a hard 401 (never a silent downgrade) — are the security contract of Phase 1.
 *
 * The env overrides are read by `env.ts` / `routes/device.ts` at import time, so
 * they are set BEFORE those modules are `require`d (in `beforeAll`), and removed
 * in `afterAll` so they cannot leak to other suites in the same Jest worker.
 */
process.env.DEVICE_TOKEN_ADOPTION_OPEN = 'true';
process.env.DEVICE_ENROLL_RATE_LIMIT_MAX_TEST = '3';

// In-memory stand-in for the `device_tokens` table.
jest.mock('../../config/database', () => {
  interface Row {
    id: string;
    deviceId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    replacedByTokenId: string | null;
    createdByIp?: string;
    userAgent?: string;
  }
  const rows: Row[] = [];
  let seq = 0;

  const deviceToken = {
    create: jest.fn(async ({ data }: any) => {
      const row: Row = {
        id: `dt_${++seq}`,
        deviceId: data.deviceId,
        tokenHash: data.tokenHash,
        createdAt: new Date(),
        expiresAt: data.expiresAt,
        lastSeenAt: null,
        revokedAt: null,
        replacedByTokenId: null,
        createdByIp: data.createdByIp,
        userAgent: data.userAgent,
      };
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(
      async ({ where }: any) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null
    ),
    findFirst: jest.fn(async ({ where }: any) => {
      const match = rows.find(
        (r) =>
          r.deviceId === where.deviceId &&
          (where.revokedAt === null ? r.revokedAt === null : true)
      );
      return match ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const r of rows) {
        if (where.tokenHash !== undefined && r.tokenHash !== where.tokenHash) continue;
        if (where.revokedAt === null && r.revokedAt !== null) continue;
        Object.assign(r, data);
        count += 1;
      }
      return { count };
    }),
  };

  return {
    prisma: {
      deviceToken,
      $transaction: jest.fn(async (cb: any) => cb({ deviceToken })),
    },
    __rows: rows,
    __reset: () => {
      rows.length = 0;
      seq = 0;
    },
  };
});

import express from 'express';
import request from 'supertest';

// Required in `beforeAll` (after the env overrides above).
let resolveIdentity: any;
let InvalidDeviceTokenError: any;
let deviceIdentityMetrics: any;
let deviceTokenService: any;
let deviceTokenGuard: any;
let databaseMock: any;

describe('Device token (Option B, Phase 1)', () => {
  let app: express.Express;
  let guardlessApp: express.Express;
  let deviceRouter: any;

  beforeAll(() => {
    const permissions = require('../../middleware/permissions');
    resolveIdentity = permissions.resolveIdentity;
    InvalidDeviceTokenError = permissions.InvalidDeviceTokenError;
    deviceIdentityMetrics = permissions.deviceIdentityMetrics;
    deviceTokenService = require('../../services/deviceTokenService').deviceTokenService;
    deviceTokenGuard = require('../../middleware/deviceIdentity').deviceTokenGuard;
    deviceRouter = require('../device').default;
    databaseMock = require('../../config/database');

    app = express();
    app.use(express.json());
    app.use(deviceTokenGuard);
    app.post('/whoami', async (req, res) => {
      res.json(await resolveIdentity(req));
    });
    app.get('/whoami', async (req, res) => {
      res.json(await resolveIdentity(req));
    });
    app.use('/device', deviceRouter);

    // No guard: proves `resolveIdentity` is self-contained — a bad token throws
    // rather than silently resolving to anonymous / a raw id.
    guardlessApp = express();
    guardlessApp.use(express.json());
    guardlessApp.get('/whoami', async (req, res) => {
      try {
        res.json(await resolveIdentity(req));
      } catch (e: any) {
        res.status(e instanceof InvalidDeviceTokenError ? 401 : 500).json({ name: e?.name });
      }
    });
  });

  beforeEach(() => {
    databaseMock.__reset();
  });

  afterAll(() => {
    delete process.env.DEVICE_TOKEN_ADOPTION_OPEN;
    delete process.env.DEVICE_ENROLL_RATE_LIMIT_MAX_TEST;
  });

  // ── Precedence ────────────────────────────────────────────────────────────

  it('resolves a valid device token to the TOKEN\u2019s deviceId', async () => {
    const minted = await deviceTokenService.mint();

    const res = await request(app)
      .get('/whoami')
      .set('x-device-token', minted.token)
      .set('x-device-id', 'attacker-id');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deviceId: minted.deviceId, source: 'device' });
  });

  it('token wins over a conflicting body.deviceId AND x-device-id', async () => {
    const minted = await deviceTokenService.mint();

    const res = await request(app)
      .post('/whoami')
      .set('x-device-token', minted.token)
      .set('x-device-id', 'header-attacker')
      .send({ deviceId: 'body-attacker' });

    expect(res.status).toBe(200);
    expect(res.body.deviceId).toBe(minted.deviceId);
    expect(res.body.source).toBe('device');
  });

  it('a valid JWT still wins over a device token, but carries the token deviceId', async () => {
    const minted = await deviceTokenService.mint();
    const jwtApp = express();
    jwtApp.use(express.json());
    jwtApp.use((req, _res, next) => {
      (req as any).user = { id: 'user-1' };
      next();
    });
    jwtApp.use(deviceTokenGuard);
    jwtApp.get('/whoami', async (req, res) => {
      res.json(await resolveIdentity(req));
    });

    const res = await request(jwtApp).get('/whoami').set('x-device-token', minted.token);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('jwt');
    expect(res.body.userId).toBe('user-1');
    expect(res.body.deviceId).toBe(minted.deviceId);
  });

  // ── Present-but-invalid → hard 401 (no silent downgrade) ──────────────────

  it('rejects a present-but-invalid token with 401 (never falls back to the raw id)', async () => {
    const res = await request(app)
      .get('/whoami')
      .set('x-device-token', 'not-a-real-token')
      .set('x-device-id', 'victim-id');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.deviceId).toBeUndefined();
  });

  it('resolveIdentity is self-contained: an invalid token throws, never resolves anonymous', async () => {
    const res = await request(guardlessApp)
      .get('/whoami')
      .set('x-device-token', 'bogus')
      .set('x-device-id', 'victim-id');

    expect(res.status).toBe(401);
    expect(res.body.name).toBe('InvalidDeviceTokenError');
  });

  it('rejects a revoked token with 401', async () => {
    const minted = await deviceTokenService.mint();
    await deviceTokenService.revoke(minted.token);

    const res = await request(app).get('/whoami').set('x-device-token', minted.token);

    expect(res.status).toBe(401);
  });

  // ── Phase-1 legacy path (measurable) ──────────────────────────────────────

  it('still accepts a legacy raw id (device-legacy) and makes it observable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const before = deviceIdentityMetrics.deviceLegacyResolutions;

    const res = await request(app).get('/whoami').set('x-device-id', 'legacy-dev');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deviceId: 'legacy-dev', source: 'device-legacy' });
    expect(deviceIdentityMetrics.deviceLegacyResolutions).toBe(before + 1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[device-legacy]'))).toBe(true);

    warn.mockRestore();
  });

  it('resolves anonymous when there is no identity at all', async () => {
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: 'anonymous' });
  });

  // ── Endpoints ─────────────────────────────────────────────────────────────

  it('enroll mints a server-generated deviceId + token', async () => {
    const res = await request(app)
      .post('/device/enroll')
      .set('x-forwarded-for', '198.51.100.11')
      .send({});

    expect(res.status).toBe(201);
    expect(typeof res.body.data.deviceId).toBe('string');
    expect(res.body.data.deviceId.length).toBeGreaterThan(0);
    expect(typeof res.body.data.deviceToken).toBe('string');
    expect(res.body.data.expiresAt).toBeTruthy();
  });

  it('rate-limits enroll (429 once the ceiling is exceeded)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/device/enroll')
        .set('x-forwarded-for', '198.51.100.22')
        .send({});
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);

    const blocked = await request(app)
      .post('/device/enroll')
      .set('x-forwarded-for', '198.51.100.22')
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('adoption returns 409 when an active token already holds the id', async () => {
    const first = await request(app)
      .post('/device/enroll')
      .set('x-forwarded-for', '198.51.100.33')
      .send({ adoptDeviceId: 'shared-dev' });
    expect(first.status).toBe(201);
    expect(first.body.data.deviceId).toBe('shared-dev');

    const second = await request(app)
      .post('/device/enroll')
      .set('x-forwarded-for', '198.51.100.33')
      .send({ adoptDeviceId: 'shared-dev' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DEVICE_ID_TAKEN');
  });

  it('refresh rotates: same deviceId, a new token, the old token revoked', async () => {
    const minted = await deviceTokenService.mint();

    const res = await request(app)
      .post('/device/refresh')
      .set('x-device-token', minted.token)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.deviceId).toBe(minted.deviceId);
    expect(res.body.data.deviceToken).not.toBe(minted.token);

    const old = await request(app).get('/whoami').set('x-device-token', minted.token);
    expect(old.status).toBe(401);
  });

  it('revoke invalidates the presented token', async () => {
    const minted = await deviceTokenService.mint();

    const res = await request(app)
      .post('/device/revoke')
      .set('x-device-token', minted.token)
      .send({});
    expect(res.status).toBe(200);

    const after = await request(app).get('/whoami').set('x-device-token', minted.token);
    expect(after.status).toBe(401);
  });
});
