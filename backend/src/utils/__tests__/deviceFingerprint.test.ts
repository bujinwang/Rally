import { generateDeviceFingerprint } from '../../utils/deviceFingerprint';

describe('deviceFingerprint', () => {
  const mockReq = (overrides: any = {}) => ({
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US,en',
      'accept-encoding': 'gzip',
      ...overrides.headers,
    },
    ip: overrides.ip || '127.0.0.1',
  });

  it('generates consistent fingerprint for same request', () => {
    const req = mockReq();
    const fp1 = generateDeviceFingerprint(req as any, 'client123');
    const fp2 = generateDeviceFingerprint(req as any, 'client123');
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });

  it('generates different fingerprint with different client data', () => {
    const fp1 = generateDeviceFingerprint(mockReq() as any, 'clientA');
    const fp2 = generateDeviceFingerprint(mockReq() as any, 'clientB');
    expect(fp1).not.toBe(fp2);
  });

  it('changes with different user agent', () => {
    const fp1 = generateDeviceFingerprint(mockReq({ headers: { 'user-agent': 'Chrome' } }) as any, 'c');
    const fp2 = generateDeviceFingerprint(mockReq({ headers: { 'user-agent': 'Firefox' } }) as any, 'c');
    expect(fp1).not.toBe(fp2);
  });

  it('returns hex string', () => {
    const fp = generateDeviceFingerprint(mockReq() as any, 'test');
    expect(/^[0-9a-f]{16}$/.test(fp)).toBe(true);
  });

  it('handles missing client fingerprint', () => {
    const fp = generateDeviceFingerprint(mockReq() as any);
    expect(fp).toBeTruthy();
    expect(fp).toHaveLength(16);
  });
});
