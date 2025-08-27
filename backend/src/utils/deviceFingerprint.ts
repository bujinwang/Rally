import { Request } from 'express';
import crypto from 'crypto';

/**
 * Generate a device fingerprint from request headers and client info
 */
export function generateDeviceFingerprint(req: Request, clientFingerprint?: string): string {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.ip || '',
    clientFingerprint || '' // Client-side generated fingerprint
  ];

  const fingerprint = components.join('|');
  return crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .substring(0, 16); // Keep it reasonably short
}

/**
 * Client-side device fingerprinting JavaScript code
 * This generates a more comprehensive fingerprint on the client side
 */
export const CLIENT_FINGERPRINT_SCRIPT = `
function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.fillText('BadmintonGroup Device ID', 2, 2);
  }
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    navigator.deviceMemory || 'unknown',
    canvas.toDataURL()
  ];
  
  // Simple hash function for client-side
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}
`;