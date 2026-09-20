/**
 * Story 6.9 — T12b: static wiring assertion (AC 3).
 *
 * This is a **source-level wiring assertion, NOT a render test**. It proves the
 * new preferences client is reachable from the app's navigation graph:
 * `Settings` is registered with `component={SettingsScreen}` in `ProfileStack`,
 * and `SettingsScreen` imports `notificationPreferencesApi`.
 *
 * It is an honest *weak* guard: it proves the module is statically referenced,
 * not that the screen behaves correctly at runtime. Epic 6 has produced four or
 * five orphaned modules from exactly this gap (a new file that nothing imports),
 * so a static anti-orphan check is worth having even though it cannot execute
 * the screen. The executable component-render assertion is deferred to a
 * separate harness workstream (no component-render suite in the repo runs green;
 * `@testing-library/react-native` is intentionally not installed).
 */

import * as fs from 'fs';
import * as path from 'path';

// `__dirname` is <frontend>/src/__tests__ → repo root of the app is two up.
const appRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(appRoot, relPath), 'utf8');
}

describe('Settings wiring — static source assertion (Story 6.9 AC 3)', () => {
  it('registers Settings with component={SettingsScreen} in ProfileStack', () => {
    const navigator = read('src/navigation/MainTabNavigator.tsx');

    // `<ProfileStack.Screen name="Settings" component={SettingsScreen} ... />`
    expect(navigator).toMatch(/name="Settings"[\s\S]{0,200}?component=\{SettingsScreen\}/);
  });

  it('SettingsScreen imports the new notification preferences client', () => {
    const screen = read('src/screens/SettingsScreen.tsx');

    expect(screen).toContain("from '../services/notificationPreferencesApi'");
    expect(screen).toContain('notificationPreferencesApi');
  });

  it('SettingsScreen uses the pure label→preference-key mapping', () => {
    const screen = read('src/screens/SettingsScreen.tsx');

    expect(screen).toContain("from '../services/notificationPreferenceMapping'");
    expect(screen).toContain('NOTIFICATION_PREFERENCE_ENTRIES');
  });
});
