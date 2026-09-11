/**
 * Winston format that redacts sensitive fields from logged objects (Story 6.3,
 * AC 8 / AC 14).
 *
 * Recursively traverses objects and replaces values whose keys match a
 * sensitive-key pattern with `[REDACTED]`. The key's presence is preserved
 * so developers can see that a field was present without exposing its value.
 */

import winston from 'winston';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'apikey',
  'api_key',
  'secret',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactValue(val);
      }
    }
    return result;
  }
  return value;
}

export const redactionFormat = winston.format((info) => {
  return redactValue(info) as winston.Logform.TransformableInfo;
});
