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

  it('GET /api/v1/oauth/google/url is unaffected (still works)', async () => {
    const res = await request(app).get('/api/v1/oauth/google/url').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('accounts.google.com');
    expect(res.body.data.provider).toBe('google');
  });

  it('GET /api/v1/oauth/wechat/url is unaffected (still works)', async () => {
    const res = await request(app).get('/api/v1/oauth/wechat/url').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('open.weixin.qq.com');
    expect(res.body.data.provider).toBe('wechat');
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