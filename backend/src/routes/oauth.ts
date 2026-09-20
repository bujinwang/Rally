import { Router, Request, Response } from 'express';
import { OAuthService } from '../services/oauthService';

const router = Router();

/**
 * GET /api/v1/oauth/:provider/url
 * Get the OAuth authorization URL for a provider
 */
router.get('/:provider/url', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!['google', 'wechat'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid provider. Use "google" or "wechat".' },
        timestamp: new Date().toISOString(),
      });
    }

    const authUrl = OAuthService.getAuthorizationUrl(provider as 'google' | 'wechat');

    res.json({
      success: true,
      data: { url: authUrl, provider },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('OAuth URL error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate authorization URL' },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/v1/oauth/:provider/callback
 * Handle OAuth callback from provider — exchanges code for tokens, creates/links user, returns JWT
 */
router.get('/:provider/callback', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { code } = req.query;

    if (!['google', 'wechat'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid provider' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Authorization code is required' },
        timestamp: new Date().toISOString(),
      });
    }

    // Exchange code for user profile
    const { profile } = await OAuthService.handleCallback(
      provider as 'google' | 'wechat',
      code
    );

    // Find or create user, generate JWT
    const result = await OAuthService.findOrCreateOAuthUser(profile);

    // For mobile apps, return JWT in response
    // For web, could also set cookies or redirect with token in URL
    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.jwtTokens,
        isNewUser: result.isNewUser,
      },
      message: result.isNewUser ? 'Account created successfully' : 'Logged in successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'OAuth login failed',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/v1/oauth/:provider/mobile
 *
 * DISABLED — returns 501 Not Implemented.
 *
 * This route previously trusted a body-supplied `providerId` and minted access
 * and refresh JWTs via `OAuthService.findOrCreateOAuthUser` without ever
 * verifying the provider credential (the `accessToken` was never exchanged or
 * validated server-side). Since `providerId` is an identifier (a Google `sub`
 * or WeChat `openid`), not a secret, any caller who knew a victim's `provider`
 * and `providerId` could receive that user's full session — an authentication
 * bypass. It also overwrote the victim's stored `accessToken`/`providerData`.
 *
 * The route had no reachable client: `handleMobileOAuth`
 * (`frontend/Rally/src/components/SocialLoginButtons.tsx`) is never called, and
 * no provider SDK is installed, so disabling it breaks nothing in production.
 *
 * A correct mobile login flow must verify the provider token server-side (call
 * the provider's token/userinfo endpoint, or verify an ID-token signature and
 * audience) and derive `providerId` from the verified response. It should be
 * authored fresh against that contract — do not resurrect this handler.
 */
router.post('/:provider/mobile', (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Mobile OAuth login is not available.',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
