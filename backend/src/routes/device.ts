import { Router, Request, Response } from 'express';
import { deviceTokenService } from '../services/deviceTokenService';
import { createRateLimiters } from '../middleware/rateLimit';
import env from '../config/env';

/**
 * Device-token endpoints (Option B, Phase 1 — design §2.1).
 *
 *   POST /device/enroll   — mint a token for a new (or adopted) device identity
 *   POST /device/refresh  — rotate: present a valid token, receive a new one
 *   POST /device/revoke   — revoke the presented token (self-service)
 *
 * Enrollment is unauthenticated BY NECESSITY (a guest has no account), so it is
 * rate-limited and must never become a free id-minting oracle: a fresh id is
 * server-generated and adoption is gated + conflict-checked (§2.1 rule 3).
 */
const router = Router();

// Rate limiting stays ACTIVE under test so it can be exercised, but with a high
// ceiling so unrelated suites sharing the in-memory counter cannot trip it. The
// dedicated rate-limit test tunes the ceiling down via the test-only env var.
// Production values are unchanged. (Same pattern as routes/auth.ts:19-33.)
const isTest = process.env.NODE_ENV === 'test';
const rateLimiters = createRateLimiters(
  isTest
    ? { authMax: Number(process.env.DEVICE_ENROLL_RATE_LIMIT_MAX_TEST ?? 10000) }
    : undefined
);
const enrollLimiter = rateLimiters.auth;
const mutationLimiter = rateLimiters.sensitive;

/** Read the presented raw device token (header first, then body fallback). */
const presentedToken = (req: Request): string | undefined => {
  const header = req.headers['x-device-token'];
  if (typeof header === 'string' && header.length > 0) return header;
  const body = (req.body as { deviceToken?: unknown } | undefined)?.deviceToken;
  return typeof body === 'string' && body.length > 0 ? body : undefined;
};

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

const envelope = (res: Response, status: number, code: string, message: string): Response =>
  res.status(status).json({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  });

/**
 * @route POST /api/v1/device/enroll
 * @desc Mint a device token. A fresh `deviceId` is always server-generated.
 *       `adoptDeviceId` is honoured ONLY while the adoption window is open, and
 *       only when no active token already holds that id (else 409).
 * @access Public (rate-limited)
 */
router.post('/enroll', enrollLimiter, async (req, res) => {
  try {
    const rawAdopt = (req.body as { adoptDeviceId?: unknown } | undefined)?.adoptDeviceId;
    const adoptDeviceId =
      typeof rawAdopt === 'string' && rawAdopt.trim().length > 0 ? rawAdopt.trim() : undefined;

    if (adoptDeviceId && env.deviceToken.adoptionOpen) {
      const adopted = await deviceTokenService.adopt(adoptDeviceId, meta(req));

      if (!adopted.ok) {
        return envelope(
          res,
          409,
          'DEVICE_ID_TAKEN',
          'That device id is already bound to an active token'
        );
      }

      // Every adoption is logged (§5.3) — never the raw token, only the id + ip.
      console.warn(
        `[device-adoption] deviceId=${adopted.deviceId} ip=${meta(req).ip ?? 'unknown'}`
      );

      return res.status(201).json({
        success: true,
        data: {
          deviceId: adopted.deviceId,
          deviceToken: adopted.token,
          expiresAt: adopted.expiresAt.toISOString(),
        },
      });
    }

    // No adoption requested, or the window is closed → always a fresh identity.
    const minted = await deviceTokenService.mint(meta(req));

    return res.status(201).json({
      success: true,
      data: {
        deviceId: minted.deviceId,
        deviceToken: minted.token,
        expiresAt: minted.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('POST /device/enroll error:', error);
    return envelope(res, 500, 'INTERNAL_ERROR', 'Failed to enroll device');
  }
});

/**
 * @route POST /api/v1/device/refresh
 * @desc Rotate the presented token. The new token is bound to the SAME
 *       `deviceId`; the presented row is revoked.
 * @access Public (rate-limited; presents the credential)
 */
router.post('/refresh', mutationLimiter, async (req, res) => {
  try {
    const raw = presentedToken(req);
    if (!raw) {
      return envelope(res, 400, 'MISSING_DEVICE_TOKEN', 'A device token is required');
    }

    const rotated = await deviceTokenService.rotate(raw, meta(req));
    if (!rotated.ok) {
      return envelope(res, 401, 'UNAUTHORIZED', 'Invalid or expired device token');
    }

    return res.json({
      success: true,
      data: {
        deviceId: rotated.deviceId,
        deviceToken: rotated.token,
        expiresAt: rotated.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('POST /device/refresh error:', error);
    return envelope(res, 500, 'INTERNAL_ERROR', 'Failed to refresh device token');
  }
});

/**
 * @route POST /api/v1/device/revoke
 * @desc Revoke the presented token (self-service). Idempotent.
 * @access Public (rate-limited; presents the credential)
 */
router.post('/revoke', mutationLimiter, async (req, res) => {
  try {
    const raw = presentedToken(req);
    if (!raw) {
      return envelope(res, 400, 'MISSING_DEVICE_TOKEN', 'A device token is required');
    }

    await deviceTokenService.revoke(raw);

    return res.json({ success: true, data: { revoked: true } });
  } catch (error) {
    console.error('POST /device/revoke error:', error);
    return envelope(res, 500, 'INTERNAL_ERROR', 'Failed to revoke device token');
  }
});

export default router;
