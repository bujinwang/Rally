/**
 * Story 6.1 — independent QA verification of secret handling (AC 18).
 *
 * Proves the process fails fast in production and never silently falls back to
 * a fixed/hardcoded secret. Uses `jest.resetModules()` so `config/env.ts` is
 * re-evaluated under a controlled `process.env`. Empty-string values are used
 * (not `delete`) because `dotenv.config()` does not override an existing key.
 */
describe('QA — env secret handling (AC 18)', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
    jest.resetModules();
  });

  const loadEnv = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../env');
  };

  it('throws at load time when secrets are missing in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '';
    process.env.JWT_REFRESH_SECRET = '';

    expect(() => loadEnv()).toThrow(/JWT_SECRET is required in production/);
  });

  it('throws when a production secret is shorter than 32 characters', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'too-short';
    process.env.JWT_REFRESH_SECRET = 'x'.repeat(40);

    expect(() => loadEnv()).toThrow(/at least 32 characters/);
  });

  it('accepts >=32 character secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);

    const { env } = loadEnv();

    expect(env.isProduction).toBe(true);
    expect(env.jwt.secret).toBe('a'.repeat(40));
    expect(env.jwt.refreshSecret).toBe('b'.repeat(40));
  });

  it('never falls back to a fixed dev secret (per-load random, no hardcoded string)', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = '';
    process.env.JWT_REFRESH_SECRET = '';

    const first = loadEnv().env.jwt.secret;
    const second = loadEnv().env.jwt.secret;

    expect(first).not.toBe('access-secret');
    expect(first).not.toBe('refresh-secret');
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second); // per-process random, not a constant
  });

  // ── Placeholder rejection ──────────────────────────────────────────────────
  // Length alone was the only production test. The placeholder that shipped in
  // `backend/.env` and was committed to the public repo is 34 characters, so it
  // cleared the length check and would have been accepted. A committed secret is
  // burned regardless of its length.

  it('rejects a long placeholder that clears the length check', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(40);
    // Shape of the real leaked value: `your-…` and 34 chars.
    process.env.JWT_REFRESH_SECRET = 'your-super-secret-refresh-token-key';

    expect(process.env.JWT_REFRESH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(() => loadEnv()).toThrow(/placeholder|example value/);
  });

  it.each([
    'your-super-secret-key-that-is-long-enough',
    'change-me-before-deploying-to-production',
    'CHANGE_ME_please_this_is_not_a_real_key',
    'replace-me-with-a-random-value-now',
    'secret-please-change-this-in-production',
  ])('rejects known placeholder shape: %s', (value) => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = value;
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);

    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(() => loadEnv()).toThrow(/placeholder|example value/);
  });

  it('accepts a random hex secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '9f2c7a1b4e8d3f6a0c5b2e9d7a4f1c8b3e6d9a2f5c8b1e4d7a0f3c6b9e2d5a8f';
    process.env.JWT_REFRESH_SECRET = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';

    const { env } = loadEnv();
    expect(env.jwt.secret).toContain('9f2c7a1b');
  });

  it('still accepts placeholders in development (no developer lockout)', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'your-super-secret-key-that-is-long-enough';
    process.env.JWT_REFRESH_SECRET = 'your-super-secret-refresh-token-key';

    const { env } = loadEnv();
    expect(env.isProduction).toBe(false);
  });
});
