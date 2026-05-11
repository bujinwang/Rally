import { PasswordUtils } from '../password';

describe('PasswordUtils', () => {
  it('hashes a password and returns a salt+hash', async () => {
    const hash = await PasswordUtils.hashPassword('mypassword123');
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(20); // salt+hash should be long
    expect(hash).toContain('.'); // salt.hash format
  });

  it('verifies correct password against hash', async () => {
    const hash = await PasswordUtils.hashPassword('secret123');
    const result = await PasswordUtils.verifyPassword('secret123', hash);
    expect(result).toBe(true);
  });

  it('rejects incorrect password against hash', async () => {
    const hash = await PasswordUtils.hashPassword('secret123');
    const result = await PasswordUtils.verifyPassword('wrong', hash);
    expect(result).toBe(false);
  });

  it('hashes same password differently each time (random salt)', async () => {
    const h1 = await PasswordUtils.hashPassword('password');
    const h2 = await PasswordUtils.hashPassword('password');
    expect(h1).not.toBe(h2); // different salts
  });

  it('handles empty password', async () => {
    const hash = await PasswordUtils.hashPassword('');
    expect(hash).toBeTruthy();
    const result = await PasswordUtils.verifyPassword('', hash);
    expect(result).toBe(true);
  });

  it('handles special characters', async () => {
    const pw = '!@#$%^&*()_+测试中文';
    const hash = await PasswordUtils.hashPassword(pw);
    const result = await PasswordUtils.verifyPassword(pw, hash);
    expect(result).toBe(true);
  });
});
