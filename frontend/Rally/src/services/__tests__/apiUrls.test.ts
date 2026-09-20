/**
 * Story 6.9 (T14/F13) — pure URL-construction tests.
 *
 * The frontend suite has no component-render harness (`@testing-library/
 * react-native` is intentionally not installed), so the notification
 * registration URL, the session-suggestions path and the socket origin are
 * proven directly against the canonical base from `config/api`.
 *
 * The double-prefix assertion is the whole point: `config/api.API_BASE_URL`
 * already ends in `/api/v1`, so any builder that re-adds `/api/v1` yields
 * `…/api/v1/api/v1/…` and 404s.
 */

import { API_BASE_URL } from '../../config/api';
import {
  notificationRegisterUrl,
  sessionSuggestionsUrl,
  socketUrl,
} from '../apiUrls';

describe('apiUrls (Story 6.9 T14/F13)', () => {
  it('builds the notification registration URL without doubling /api/v1', () => {
    const url = notificationRegisterUrl(API_BASE_URL);

    // Exactly the canonical base + the path below /api/v1.
    expect(url).toBe(`${API_BASE_URL}/notifications/register`);
    expect(url).not.toContain('/api/v1/api/v1');
  });

  it('builds the notification registration URL deterministically for a known base', () => {
    expect(notificationRegisterUrl('http://localhost:3001/api/v1')).toBe(
      'http://localhost:3001/api/v1/notifications/register',
    );
  });

  it('builds the session-suggestions path with the required `suggestions` segment', () => {
    const url = sessionSuggestionsUrl(API_BASE_URL, 'device-42');

    expect(url).toBe(`${API_BASE_URL}/session-suggestions/suggestions/device-42`);
    expect(url).toContain('/session-suggestions/suggestions/device-42');
    expect(url).not.toContain('/api/v1/api/v1');
  });

  it('does NOT emit the old 404-ing /session-suggestions/:deviceId path', () => {
    const url = sessionSuggestionsUrl(API_BASE_URL, 'device-42');

    // The buggy shape had no `suggestions` segment.
    expect(url).not.toContain('/session-suggestions/device-42');
  });

  it('derives the socket origin by stripping the /api/v1 REST suffix', () => {
    expect(socketUrl('http://localhost:3001/api/v1')).toBe('http://localhost:3001');
    expect(socketUrl('http://localhost:3001/api/v1/')).toBe('http://localhost:3001');
    expect(socketUrl('https://api.example.com/api/v1')).toBe('https://api.example.com');
    // Relative production base → undefined, so io(undefined) uses the current
    // origin rather than a bogus `http://` host.
    expect(socketUrl('/api/v1')).toBeUndefined();
  });

  it('never emits a doubled /api/v1 for any builder', () => {
    const urls = [
      notificationRegisterUrl(API_BASE_URL),
      sessionSuggestionsUrl(API_BASE_URL, 'd1'),
      socketUrl(API_BASE_URL) ?? '',
    ];
    urls.forEach((u) => expect(u).not.toContain('/api/v1/api/v1'));
  });
});
