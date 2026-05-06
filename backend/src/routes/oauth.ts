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
 * Handle mobile OAuth — accepts provider token from mobile SDK, creates/links user
 * For when the mobile app handles OAuth natively with Google/WeChat SDKs
 */
router.post('/:provider/mobile', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { providerId, name, email, avatarUrl, accessToken } = req.body;

    if (!['google', 'wechat'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid provider' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'providerId is required' },
        timestamp: new Date().toISOString(),
      });
    }

    const profile = {
      provider: provider as 'google' | 'wechat',
      providerId,
      name: name || `${provider} User`,
      email: email || undefined,
      avatarUrl: avatarUrl || undefined,
      rawProfile: { accessToken },
    };

    const result = await OAuthService.findOrCreateOAuthUser(profile);

    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.jwtTokens,
        isNewUser: result.isNewUser,
      },
      message: result.isNewUser ? 'Account created' : 'Logged in',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Mobile OAuth error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Mobile OAuth login failed' },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
