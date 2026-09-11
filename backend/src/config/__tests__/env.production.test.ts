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
});
