/**
 * Story 6.9 (T14/F13) — static source assertions for the base-URL fix.
 *
 * These are cheap, honest regression guards that the specific defects stay
 * fixed at the call sites: the notification hook no longer double-prefixes
 * `/api/v1` nor imports the deleted `config.ts`; `achievementApi` no longer
 * hardcodes the frontend dev port; `SessionSuggestions` uses the shared builder;
 * and the conflicting duplicate `config.ts` is gone.
 *
 * They prove SOURCE SHAPE only — the runtime behaviour of the builders is proven
 * by `services/__tests__/apiUrls.test.ts`. This mirrors the existing
 * `settingsWiring.test.ts` pattern (no component-render harness is available).
 */

import * as fs from 'fs';
import * as path from 'path';

// `__dirname` is <frontend>/src/__tests__ → app root is two up.
const appRoot = path.resolve(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.resolve(appRoot, rel), 'utf8');

describe('base-URL wiring — static source assertions (Story 6.9 T14/F13)', () => {
  it('useNotificationManager imports the canonical base and never doubles /api/v1', () => {
    const src = read('src/hooks/useNotificationManager.ts');

    expect(src).toContain("from '../config/api'");
    // Must NOT import the deleted, conflicting module (`from '../config'`).
    expect(src).not.toMatch(/from '\.\.\/config';/);
    // The old double-prefix literal must be gone.
    expect(src).not.toContain('/api/v1/notifications/register');
    expect(src).toContain('notificationRegisterUrl');
    // The socket must connect to the origin, not the REST base.
    expect(src).toContain('socketUrl(API_BASE_URL)');
  });

  it('achievementApi imports the canonical base instead of a hardcoded localhost', () => {
    const src = read('src/services/achievementApi.ts');

    expect(src).toContain("from '../config/api'");
    expect(src).not.toContain('localhost:3000');
  });

  it('SessionSuggestions requests the `/suggestions/:deviceId` path', () => {
    const src = read('src/components/SessionSuggestions.tsx');

    expect(src).toContain('sessionSuggestionsUrl');
    expect(src).toContain('/session-suggestions/suggestions/');
    // The old, 404-ing shape must be gone.
    expect(src).not.toContain('/session-suggestions/${deviceId}');
  });

  it('the conflicting duplicate config.ts is deleted', () => {
    expect(fs.existsSync(path.resolve(appRoot, 'src/config.ts'))).toBe(false);
  });
});
