import { test as base, Page, expect } from '@playwright/test';
import { randomBytes } from 'crypto';

// ── Types ───────────────────────────────────────────────────────
export interface SessionData {
  shareCode: string;
  sessionId?: string;
  name: string;
}

export interface PlayerData {
  name: string;
  deviceId: string;
}

// ── Helpers ─────────────────────────────────────────────────────
export const uid = () => randomBytes(4).toString('hex');

/**
 * Create a new MVP session via API (bypasses UI for speed).
 * Returns the shareCode needed to interact with the session.
 */
export async function createSession(page: Page, organizerName?: string): Promise<SessionData> {
  const name = organizerName || `E2E-${uid()}`;
  const body = {
    organizerName: name,
    name: `E2E Test ${uid()}`,
    dateTime: new Date(Date.now() + 86400000).toISOString(),
    location: 'E2E Court',
    maxPlayers: 8,
  };

  const res = await page.request.post('/api/v1/mvp-sessions', { data: body });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);

  return {
    shareCode: json.data.session.shareCode,
    sessionId: json.data.session.id,
    name,
  };
}

/**
 * Join a session via API.
 */
export async function joinSession(
  page: Page,
  shareCode: string,
  playerName?: string,
  deviceId?: string
): Promise<PlayerData> {
  const name = playerName || `Player-${uid()}`;
  const devId = deviceId || `e2e-${uid()}`;

  const body = { playerName: name, deviceId: devId };
  const res = await page.request.post(`/api/v1/mvp-sessions/join/${shareCode}`, { data: body });

  // 200 = joined, 400/405 = already joined
  expect([200, 400, 405]).toContain(res.status());
  return { name, deviceId: devId };
}

/**
 * Wait for the web app to hydrate on a page.
 */
export async function waitForApp(page: Page) {
  await page.goto('/');
  // Expo web renders into #root
  await page.waitForSelector('#root', { timeout: 15000 });
}

// ── Extended test fixture ───────────────────────────────────────
export type E2EFixture = {
  session: SessionData;
  players: PlayerData[];
};

/**
 * Test fixture that creates a session with 2 players pre-joined.
 */
export const test = base.extend<E2EFixture>({
  session: async ({ page }, use) => {
    const session = await createSession(page);
    await use(session);
  },
  players: async ({ page, session }, use) => {
    const p1 = await joinSession(page, session.shareCode);
    const p2 = await joinSession(page, session.shareCode);
    await use([p1, p2]);
  },
});

export { expect };
