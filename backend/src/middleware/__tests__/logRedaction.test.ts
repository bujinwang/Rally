/**
 * Log redaction format tests (Story 6.3, AC 8 / AC 14).
 */

import { redactionFormat } from '../logRedaction';
import winston from 'winston';

describe('redactionFormat', () => {
  const format = redactionFormat();

  it('redacts sensitive keys at top level', () => {
    const info = format.transform({
      password: 'secret123',
      token: 'bearer-token',
      apiKey: 'my-api-key',
    }) as winston.Logform.TransformableInfo;

    expect(info.password).toBe('[REDACTED]');
    expect(info.token).toBe('[REDACTED]');
    expect(info.apiKey).toBe('[REDACTED]');
  });

  it('redacts nested sensitive keys', () => {
    const info = format.transform({
      user: {
        name: 'Alice',
        password: 'secret',
        refreshToken: 'rt',
      },
      headers: {
        authorization: 'Bearer abc',
        'content-type': 'application/json',
      },
    }) as winston.Logform.TransformableInfo;

    expect((info.user as any).password).toBe('[REDACTED]');
    expect((info.user as any).refreshToken).toBe('[REDACTED]');
    expect((info.user as any).name).toBe('Alice');
    expect((info.headers as any).authorization).toBe('[REDACTED]');
    expect((info.headers as any)['content-type']).toBe('application/json');
  });

  it('preserves non-sensitive data', () => {
    const info = format.transform({
      message: 'hello',
      count: 42,
      nested: { foo: 'bar' },
    }) as winston.Logform.TransformableInfo;

    expect(info.message).toBe('hello');
    expect(info.count).toBe(42);
    expect((info.nested as any).foo).toBe('bar');
  });

  it('handles arrays', () => {
    const info = format.transform({
      items: [
        { password: 'p1', name: 'A' },
        { password: 'p2', name: 'B' },
      ],
    }) as winston.Logform.TransformableInfo;

    expect((info.items as any[])[0].password).toBe('[REDACTED]');
    expect((info.items as any[])[0].name).toBe('A');
    expect((info.items as any[])[1].password).toBe('[REDACTED]');
  });
});
