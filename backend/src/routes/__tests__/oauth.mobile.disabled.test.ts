import request from 'supertest';
import express from 'express';
import oauthRouter from '../oauth';

const app = express();
app.use(express.json());
app.use('/api/v1/oauth', oauthRouter);

describe('OAuth mobile route — DISABLED (returns 501)', () => {
  const forgedGoogleBody = {
    providerId: 'google-sub-12345',
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    accessToken: 'ya29.fake-google-access-token',
  };

  const forgedWeChatBody = {
    providerId: 'wechat-openid-67890',
    name: '微信用户',
    email: 'wechat@example.com',
    avatarUrl: 'https://example.com/wechat-avatar.png',
    accessToken: 'fake-wechat-access-token',
  };

  it('POST /api/v1/oauth/google/mobile returns 501 with NOT_IMPLEMENTED and mints no tokens', async () => {
    const res = await request(app)
      .post('/api/v1/oauth/google/mobile')
      .send(forgedGoogleBody)
      .expect(501);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.error.message).toContain('Mobile OAuth login is not available');
    // Critical: no tokens in response
    expect(res.body.data).toBeUndefined();
    expect(res.body.tokens).toBeUndefined();
  });

  it('POST /api/v1/oauth/wechat/mobile returns 501 with NOT_IMPLEMENTED and mints no tokens', async () => {
    const res = await request(app)
      .post('/api/v1/oauth/wechat/mobile')
      .send(forgedWeChatBody)
      .expect(501);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.data).toBeUndefined();
    expect(res.body.tokens).toBeUndefined();
  });

  it('GET /api/v1/oauth/google/url is unaffected (still works) when the provider IS configured', async () => {
    // This test's intent is "disabling the mobile route did not break the web
    // URL route". That only holds once credentials exist: without them the route
    // now answers 503 on purpose (see the next test), so stub them here.
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    try {
      const res = await request(app).get('/api/v1/oauth/google/url').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('accounts.google.com');
      expect(res.body.data.url).toContain('client_id=test-client-id');
      expect(res.body.data.provider).toBe('google');
    } finally {
      if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
    }
  });

  it('GET /api/v1/oauth/wechat/url is unaffected (still works) when the provider IS configured', async () => {
    const prevId = process.env.WECHAT_APP_ID;
    const prevSecret = process.env.WECHAT_APP_SECRET;
    process.env.WECHAT_APP_ID = 'test-app-id';
    process.env.WECHAT_APP_SECRET = 'test-app-secret';
    try {
      const res = await request(app).get('/api/v1/oauth/wechat/url').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('open.weixin.qq.com');
      expect(res.body.data.provider).toBe('wechat');
    } finally {
      if (prevId === undefined) delete process.env.WECHAT_APP_ID;
      else process.env.WECHAT_APP_ID = prevId;
      if (prevSecret === undefined) delete process.env.WECHAT_APP_SECRET;
      else process.env.WECHAT_APP_SECRET = prevSecret;
    }
  });

  it('GET /api/v1/oauth/:provider/url answers 503 OAUTH_NOT_CONFIGURED when credentials are absent', async () => {
    // Regression guard for the bug this suite originally encoded: with no
    // GOOGLE_* env the route used to build an authorize URL containing
    // `client_id=` (empty) and hand it to the client, which redirected the user
    // to Google's "Access blocked: Missing required parameter: client_id" page.
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const res = await request(app).get('/api/v1/oauth/google/url').expect(503);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('OAUTH_NOT_CONFIGURED');
    expect(res.body.error.message).toMatch(/not set up/i);
    // Must never hand back a half-built authorize URL.
    expect(res.body.data).toBeUndefined();
  });

  it('GET /api/v1/oauth/providers reports configuration without leaking the client id', async () => {
    const res = await request(app).get('/api/v1/oauth/providers').expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.google.configured).toBe('boolean');
    expect(typeof res.body.data.wechat.configured).toBe('boolean');
    // Booleans only — never the credential.
    expect(JSON.stringify(res.body)).not.toMatch(/client[-_]?id/i);
  });

  it('POST /api/v1/oauth/google/mobile rejects even with missing providerId (no fallback to old logic)', async () => {
    const res = await request(app)
      .post('/api/v1/oauth/google/mobile')
      .send({ name: 'Test', accessToken: 'token' }) // no providerId
      .expect(501);

    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.data).toBeUndefined();
  });

  it('POST /api/v1/oauth/google/mobile rejects unknown provider with 501 (not 400)', async () => {
    const res = await request(app)
      .post('/api/v1/oauth/unknown/mobile')
      .send(forgedGoogleBody)
      .expect(501);

    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.data).toBeUndefined();
  });
});