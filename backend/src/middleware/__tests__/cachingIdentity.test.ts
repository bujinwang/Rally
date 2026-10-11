/**
 * Caller-identity cache-key guard (device-token design §4.2 — Flag C).
 *
 * THE CONTRACT THIS FILE PINS: a route whose response contains per-caller fields
 * (the session `viewer` / `players[].isYou` signals) must vary its cache key by
 * CALLER IDENTITY. The default key is `domain+generation+method+path+query` — it
 * embeds no identity, so one caller's identity view would be served to every
 * other caller until the TTL expires.
 *
 * WHY THREE TESTS (either alone is insufficient):
 *   1. UNIT — the key generator itself varies by identity, and the identity
 *      component is PREFIX-based (`x-device-*`), so the Phase 1 `x-device-token`
 *      header is covered by construction.
 *   2. MIDDLEWARE (caching forced ON) — the end-to-end defect reproduction. The
 *      cache is disabled under `NODE_ENV=test` by default (`caching.ts`), so a
 *      test that does not pass `enabled: true` would pass VACUOUSLY: there is no
 *      cache under test to serve the wrong body. The paired CONTROL (no
 *      keyGenerator) proves the test can fail — the second caller really does
 *      receive the first caller's body.
 *   3. STATIC — both session GET routes pass the generator, so deleting it from
 *      the wiring fails the build.
 */

import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

import { cachingMiddleware, identityCacheKeyGenerator, callerIdentityDigest } from '../caching';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// 1. UNIT — the key generator varies by caller identity (and by prefix).
// ---------------------------------------------------------------------------

function fakeReq(headers: Record<string, string>) {
  return {
    method: 'GET',
    baseUrl: '/api/v1/mvp-sessions',
    path: '/ABC123',
    query: {},
    headers,
  } as never;
}

describe('identityCacheKeyGenerator (unit)', () => {
  const gen = identityCacheKeyGenerator('session');

  it('produces different keys for different callers on the same path+query', async () => {
    const a = await gen(fakeReq({ 'x-device-id': 'device-A' }));
    const b = await gen(fakeReq({ 'x-device-id': 'device-B' }));
    expect(a).not.toBe(b);
  });

  it('produces an identical key for the same caller', async () => {
    const a1 = await gen(fakeReq({ 'x-device-id': 'device-A' }));
    const a2 = await gen(fakeReq({ 'x-device-id': 'device-A' }));
    expect(a1).toBe(a2);
  });

  it('varies by the PREFIX rule — a future x-device-token header also splits the key', async () => {
    const id = await gen(fakeReq({ 'x-device-id': 'device-A' }));
    const token = await gen(fakeReq({ 'x-device-token': 'token-A' }));
    expect(id).not.toBe(token);
  });

  it('varies by the authorization header', async () => {
    const anon = await gen(fakeReq({}));
    const authed = await gen(fakeReq({ authorization: 'Bearer jwt-1' }));
    expect(anon).not.toBe(authed);
  });

  it('embeds the domain generation (so invalidation still reaches the entry)', async () => {
    const key = await gen(fakeReq({ 'x-device-id': 'device-A' }));
    // `<domain>:g<gen>:http:...` — the generation segment must be present.
    expect(key).toMatch(/^session:g\d+:http:GET:/);
  });

  it('callerIdentityDigest is identity-aware but stable', () => {
    const a = callerIdentityDigest(fakeReq({ 'x-device-id': 'device-A' }) as never);
    const b = callerIdentityDigest(fakeReq({ 'x-device-id': 'device-B' }) as never);
    const aAgain = callerIdentityDigest(fakeReq({ 'x-device-id': 'device-A' }) as never);
    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });
});

// ---------------------------------------------------------------------------
// 2. MIDDLEWARE — caching FORCED ON, per-caller body, two identities.
// ---------------------------------------------------------------------------

function makeApp(options: Parameters<typeof cachingMiddleware>[0], pathName: string) {
  const app = express();
  app.get(pathName, cachingMiddleware(options), (req, res) => {
    res.json({ success: true, data: { caller: (req.headers['x-device-id'] as string) ?? 'anon' } });
  });
  return app;
}

describe('cachingMiddleware — per-caller responses (caching forced ON)', () => {
  it('serves each caller their OWN body when the identity key generator is used', async () => {
    const app = makeApp(
      { domain: 'session', ttl: 60, enabled: true, keyGenerator: identityCacheKeyGenerator('session') },
      '/fixed',
    );

    const first = await request(app).get('/fixed').set('x-device-id', 'device-A');
    await flush();
    const second = await request(app).get('/fixed').set('x-device-id', 'device-B');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.caller).toBe('device-A');
    // The defect would return 'device-A' here (the first caller's body).
    expect(second.body.data.caller).toBe('device-B');
  });

  it('CONTROL: without the generator the default key is NOT caller-aware (the defect)', async () => {
    // Same shape, no `keyGenerator`. This documents the exact failure mode the
    // identity generator fixes, and proves the assertion above is not vacuous.
    const app = makeApp({ domain: 'session', ttl: 60, enabled: true }, '/defect');

    const first = await request(app).get('/defect').set('x-device-id', 'device-A');
    await flush();
    const second = await request(app).get('/defect').set('x-device-id', 'device-B');

    expect(first.body.data.caller).toBe('device-A');
    // Second caller receives the FIRST caller's identity view.
    expect(second.body.data.caller).toBe('device-A');
  });
});

// ---------------------------------------------------------------------------
// 3. STATIC — both session GET routes wire the generator.
// ---------------------------------------------------------------------------

describe('session route wiring (static)', () => {
  it('both session GET routes pass an identity-aware keyGenerator', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../routes/mvpSessions.ts'),
      'utf8',
    );
    const matches = [...source.matchAll(/cachingMiddleware\(\{\s*domain:\s*'session'[^}]*\}\)/g)].map(
      (m) => m[0],
    );

    // Guard the guard: both GET routes must be found, or the assertion below
    // passes vacuously on a file whose routes were renamed.
    expect(matches.length).toBe(2);
    matches.forEach((options) => {
      expect(options).toMatch(/keyGenerator:\s*identityCacheKeyGenerator\('session'\)/);
    });
  });
});
