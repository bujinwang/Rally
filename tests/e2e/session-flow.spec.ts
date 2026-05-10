/**
 * E2E: Session lifecycle — full API flow
 *
 * Covers: health → create → join → fetch → leaderboard → discovery → leave
 * Runs against a live backend. Start with `npm run dev` in backend/ first.
 */
import { test, expect } from './fixtures';
import { createSession, joinSession, uid } from './fixtures';

// ── Health ──────────────────────────────────────────────────────
test.describe('Health', () => {
  test('GET /health returns healthy', async ({ page }) => {
    const res = await page.request.get('/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });

  test('GET /api/v1/health returns success', async ({ page }) => {
    const res = await page.request.get('/api/v1/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

// ── Session CRUD ────────────────────────────────────────────────
test.describe('Session lifecycle', () => {
  test('create → fetch → discovery', async ({ page }) => {
    // Create
    const session = await createSession(page);
    expect(session.shareCode).toBeTruthy();
    expect(session.shareCode.length).toBe(6);

    // Fetch by share code
    const getRes = await page.request.get(`/api/v1/mvp-sessions/${session.shareCode}`);
    expect(getRes.status()).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.session.shareCode).toBe(session.shareCode);
    expect(getJson.data.session.ownerName).toBe(session.name);

    // Discovery list includes our session
    const listRes = await page.request.get('/api/v1/mvp-sessions');
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data.sessions.length).toBeGreaterThan(0);
    const found = listJson.data.sessions.find(
      (s: any) => s.shareCode === session.shareCode
    );
    expect(found).toBeDefined();
  });

  test('join session with multiple players', async ({ page }) => {
    const session = await createSession(page);
    const p1 = await joinSession(page, session.shareCode, 'Alice');
    const p2 = await joinSession(page, session.shareCode, 'Bob');

    // Verify player count
    const res = await page.request.get(`/api/v1/mvp-sessions/${session.shareCode}`);
    const json = await res.json();
    const playerCount = json.data.session.playerCount ?? json.data.session.players?.length ?? 0;
    expect(playerCount).toBeGreaterThanOrEqual(2);
  });

  test('my sessions by device', async ({ page }) => {
    const devId = `e2e-dev-${uid()}`;
    const session = await createSession(page);
    await joinSession(page, session.shareCode, 'Charlie', devId);

    const res = await page.request.get(`/api/v1/mvp-sessions/my/${devId}`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.sessions.length).toBeGreaterThan(0);
    const found = json.data.sessions.find((s: any) => s.shareCode === session.shareCode);
    expect(found).toBeDefined();
  });
});

// ── Leaderboard & Community ─────────────────────────────────────
test.describe('Leaderboard & Community', () => {
  test('session leaderboard is accessible', async ({ page }) => {
    const session = await createSession(page);
    await joinSession(page, session.shareCode);

    const res = await page.request.get(`/api/v1/scoring/${session.shareCode}/leaderboard`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data?.leaderboard)).toBe(true);
  });

  test('community leaderboard returns results', async ({ page }) => {
    const res = await page.request.get('/api/v1/community/leaderboard');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test('venue directory returns results', async ({ page }) => {
    const res = await page.request.get('/api/v1/community/venues');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

// ── Error handling ──────────────────────────────────────────────
test.describe('Error handling', () => {
  test('404 for non-existent session', async ({ page }) => {
    const res = await page.request.get('/api/v1/mvp-sessions/ZZZZZZ');
    expect(res.status()).toBe(404);
  });

  test('400 for invalid session creation', async ({ page }) => {
    const res = await page.request.post('/api/v1/mvp-sessions', {
      data: { organizerName: '' }, // empty name should fail
    });
    expect([400, 422]).toContain(res.status());
  });
});
