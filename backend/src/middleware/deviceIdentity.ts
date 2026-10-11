import { Request, Response, NextFunction } from 'express';
import { deviceTokenService } from '../services/deviceTokenService';

/**
 * Device-token guard (Option B, Phase 1).
 *
 * Verifies the `x-device-token` credential ONCE per request and attaches the
 * verified `{ deviceId }` to `req.deviceIdentity`, which `resolveIdentity`
 * consumes (so the token is not re-verified per resolver call).
 *
 * A present-but-invalid token is a hard 401 — never a silent downgrade to a raw
 * `deviceId` or to anonymous (design §3.1, mirroring `optionalAuth` rule 3,
 * `middleware/auth.ts:82-89`). Mounted as the first middleware under `/api/v1`,
 * this is the single choke point that turns the resolver's
 * `InvalidDeviceTokenError` into an HTTP 401 for every mounted route — including
 * the `publicRouter` routes whose handlers call `resolveIdentity` directly.
 *
 * When no token is presented this is a cheap no-op (a header read); tokenless
 * requests do not touch the database.
 */
export const deviceTokenGuard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const raw = req.headers['x-device-token'];
  const rawToken = typeof raw === 'string' && raw.length > 0 ? raw : undefined;

  if (!rawToken) {
    next();
    return;
  }

  try {
    const verified = await deviceTokenService.verifyDeviceToken(rawToken);

    if (!verified) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired device token' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    (req as Request & { deviceIdentity?: { deviceId: string } }).deviceIdentity = {
      deviceId: verified.deviceId,
    };
    next();
  } catch (error) {
    // A verification failure must not be read as "no token" (that would be a
    // silent downgrade). Fail closed with 500 and let the client retry.
    console.error('deviceTokenGuard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify device token' },
      timestamp: new Date().toISOString(),
    });
  }
};

export default deviceTokenGuard;
