/**
 * Metrics registry tests (Story 6.3, AC 1).
 */

import { canonicalRoute } from '../metricsRegistry';

describe('canonicalRoute', () => {
  it('returns req.route.path when available', () => {
    const req = { route: { path: '/api/v1/mvp-sessions/:shareCode' } };
    expect(canonicalRoute(req)).toBe('/api/v1/mvp-sessions/:shareCode');
  });

  it('replaces CUID-like segments in raw paths', () => {
    const req = { path: '/api/v1/sessions/cmtxcu44u0000fbvpvucnr3we' };
    expect(canonicalRoute(req)).toBe('/api/v1/sessions/:id');
  });

  it('replaces UUID segments in raw paths', () => {
    const req = { path: '/api/v1/users/550e8400-e29b-41d4-a716-446655440000' };
    expect(canonicalRoute(req)).toBe('/api/v1/users/:id');
  });

  it('returns "unknown" when no path is available', () => {
    expect(canonicalRoute({})).toBe('unknown');
  });
});
