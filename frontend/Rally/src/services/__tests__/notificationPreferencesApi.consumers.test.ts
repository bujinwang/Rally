/**
 * Story 6.9 — T11 consumer-level proof for the notification preferences client.
 *
 * `notificationPreferencesApi` is the client the Settings screen calls to read
 * and write the store the push gate honours. This suite proves the *consumer
 * contract* against a real HTTP server returning byte-exact backend bodies
 * (`{ success, data, timestamp }`), because a type check cannot see the defect
 * being removed: the orphaned client read `result.preferences` and silently
 * resolved to `undefined`.
 *
 * Modelled on `apiService.consumers.test.ts`: real `http` server, byte-exact
 * bodies, `../../config/api` mocked with a live-port getter, and the module
 * under test `require()`d inside `beforeAll` (after the server binds) so the
 * mocked `API_BASE_URL` resolves to the live port. The layer under test is NOT
 * mocked.
 */

// Resolves to the live ephemeral port once `mockPort` is set below.
let mockPort = 0;
jest.mock('../../config/api', () => ({
  get API_BASE_URL() {
    return `http://127.0.0.1:${mockPort}`;
  },
  ACCESS_TOKEN_KEY: 'accessToken',
  REFRESH_TOKEN_KEY: 'refreshToken',
  DEVICE_ID_KEY: '@badminton_device_id',
}));

import http from 'http';
import type { AddressInfo } from 'net';

/**
 * Byte-exact `GET`/`PUT /notifications/preferences` payload (route :274,:339):
 * exactly the nine boolean columns the route returns.
 *
 * The two quiet-hour bounds are deliberately ABSENT. `toNotificationPreferences`
 * (`backend/src/services/notificationPreferences.ts`) maps a null column to
 * `undefined`, and `JSON.stringify` drops undefined keys — so the real server
 * omits them when unset and never sends `null`. A stub that carried
 * `quietHoursStart/End: null` would return keys the server never does, silently
 * weakening this harness's byte-exact guarantee.
 */
const DEFAULT_PREFS = {
  pushEnabled: true,
  matchResults: true,
  achievements: true,
  friendRequests: true,
  challenges: true,
  tournamentUpdates: true,
  socialMessages: true,
  sessionReminders: true,
  emailEnabled: false,
};

let server: http.Server;
let notificationPreferencesApi: any;
let lastRequest: { method: string; path: string; body: any } | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const path = (req.url || '').split('?')[0];
      const method = req.method || 'GET';
      const body = raw ? JSON.parse(raw) : null;
      lastRequest = { method, path, body };

      const send = (payload: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (path === '/notifications/preferences' && method === 'GET') {
        // Byte-exact `GET /notifications/preferences` (routes/notifications.ts:274)
        return send({ success: true, data: { ...DEFAULT_PREFS }, timestamp: '2026-01-01T00:00:00.000Z' });
      }
      if (path === '/notifications/preferences' && method === 'PUT') {
        // Byte-exact `PUT /notifications/preferences` (routes/notifications.ts:339)
        return send({
          success: true,
          data: { ...DEFAULT_PREFS, ...(body || {}) },
          message: 'Notification preferences updated successfully',
          timestamp: '2026-01-01T00:00:00.000Z',
        });
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'nope' } }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  mockPort = (server.address() as AddressInfo).port;

  notificationPreferencesApi = require('../notificationPreferencesApi').notificationPreferencesApi;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('notificationPreferencesApi consumer (Story 6.9 AC 3)', () => {
  it('getPreferences issues GET /notifications/preferences and unwraps data', async () => {
    const prefs = await notificationPreferencesApi.getPreferences();

    expect(lastRequest?.method).toBe('GET');
    expect(lastRequest?.path).toBe('/notifications/preferences');
    // The unwrapped preferences, not the `{success,data,timestamp}` envelope.
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.socialMessages).toBe(true);
    expect((prefs as any).success).toBeUndefined();
    expect((prefs as any).timestamp).toBeUndefined();
  });

  it('updatePreferences issues PUT /notifications/preferences with a partial body and unwraps data', async () => {
    const saved = await notificationPreferencesApi.updatePreferences({ socialMessages: false });

    expect(lastRequest?.method).toBe('PUT');
    expect(lastRequest?.path).toBe('/notifications/preferences');
    expect(lastRequest?.body).toEqual({ socialMessages: false });
    // Saved, effective preferences come back unwrapped.
    expect(saved.socialMessages).toBe(false);
    expect((saved as any).success).toBeUndefined();
  });

  it('updatePreferences never sends keys the server does not accept', async () => {
    // `messages` is the OLD user_settings name and is NOT an accepted key; it
    // must be dropped client-side (the server also drops it silently).
    await notificationPreferencesApi.updatePreferences({
      socialMessages: true,
      messages: false,
    } as any);

    expect(lastRequest?.body).toEqual({ socialMessages: true });
    expect(Object.prototype.hasOwnProperty.call(lastRequest?.body, 'messages')).toBe(false);
  });

  it('unwraps a GET body carrying exactly the nine columns the real route sends', async () => {
    const prefs = await notificationPreferencesApi.getPreferences();

    // Pins the harness's byte-exact shape: the server sends nine booleans and
    // omits the quiet-hour bounds entirely (never `null`).
    expect(Object.keys(prefs).sort()).toEqual(
      [
        'achievements',
        'challenges',
        'emailEnabled',
        'friendRequests',
        'matchResults',
        'pushEnabled',
        'sessionReminders',
        'socialMessages',
        'tournamentUpdates',
      ].sort(),
    );
    expect(Object.prototype.hasOwnProperty.call(prefs, 'quietHoursStart')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(prefs, 'quietHoursEnd')).toBe(false);
  });

  it('never emits a null-valued key (D2 regression — the route rejects null with 400)', async () => {
    // The route validates quiet-hour bounds with `optional().isString()`, which
    // rejects `null` (400 VALIDATION_ERROR). The client must therefore drop
    // null-valued keys rather than forward them.
    await notificationPreferencesApi.updatePreferences({
      socialMessages: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    } as any);

    expect(lastRequest?.body).toEqual({ socialMessages: true });
    expect(Object.prototype.hasOwnProperty.call(lastRequest?.body, 'quietHoursStart')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(lastRequest?.body, 'quietHoursEnd')).toBe(false);
  });

  it('keeps an empty-string quiet-hour bound (the documented clear path)', async () => {
    // The route maps `''` → null, so an empty string is the sanctioned way to
    // clear a bound and must be forwarded (unlike `null`, which is dropped).
    await notificationPreferencesApi.updatePreferences({ quietHoursStart: '' } as any);

    expect(lastRequest?.body).toEqual({ quietHoursStart: '' });
  });
});
