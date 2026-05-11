import { prisma } from '../config/database';
import { JWTUtils } from '../utils/jwt';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export interface OAuthUserProfile {
  provider: 'google' | 'wechat';
  providerId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  rawProfile: any;
}

// Default configs — override via environment variables in production
const getGoogleConfig = (): OAuthProviderConfig => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/oauth/google/callback`,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
});

const getWeChatConfig = (): OAuthProviderConfig => ({
  clientId: process.env.WECHAT_APP_ID || '',
  clientSecret: process.env.WECHAT_APP_SECRET || '',
  redirectUri: process.env.WECHAT_REDIRECT_URI || `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/oauth/wechat/callback`,
  authorizeUrl: 'https://open.weixin.qq.com/connect/qrconnect',
  tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
  userInfoUrl: 'https://api.weixin.qq.com/sns/userinfo',
});

export class OAuthService {
  /**
   * Generate the OAuth authorization URL for a provider
   */
  static getAuthorizationUrl(provider: 'google' | 'wechat', state?: string): string {
    const config = provider === 'google' ? getGoogleConfig() : getWeChatConfig();

    if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        access_type: 'offline',
        prompt: 'consent',
        state: state || this.generateState(),
      });
      return `${config.authorizeUrl}?${params.toString()}`;
    }

    // WeChat
    if (provider === 'wechat') {
      const params = new URLSearchParams({
        appid: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'snsapi_login',
        state: state || this.generateState(),
      });
      return `${config.authorizeUrl}?${params.toString()}#wechat_redirect`;
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Exchange authorization code for an access token and user profile
   */
  static async handleCallback(
    provider: 'google' | 'wechat',
    code: string
  ): Promise<{ profile: OAuthUserProfile; tokens: { accessToken: string; refreshToken: string } }> {
    if (provider === 'google') {
      return this.handleGoogleCallback(code);
    }
    if (provider === 'wechat') {
      return this.handleWeChatCallback(code);
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Handle Google OAuth callback
   */
  private static async handleGoogleCallback(code: string): Promise<{
    profile: OAuthUserProfile;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const config = getGoogleConfig();

    // Exchange code for tokens
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Google token exchange failed:', errorText);
      throw new Error('Failed to exchange Google authorization code');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // Get user info
    const userInfoResponse = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const userInfo = (await userInfoResponse.json()) as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    };

    const profile: OAuthUserProfile = {
      provider: 'google',
      providerId: userInfo.sub,
      name: userInfo.name || userInfo.email?.split('@')[0] || 'Google User',
      email: userInfo.email,
      avatarUrl: userInfo.picture,
      rawProfile: userInfo,
    };

    return {
      profile,
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
      },
    };
  }

  /**
   * Handle WeChat OAuth callback
   */
  private static async handleWeChatCallback(code: string): Promise<{
    profile: OAuthUserProfile;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const config = getWeChatConfig();

    // Exchange code for access token
    const tokenUrl = `${config.tokenUrl}?appid=${config.clientId}&secret=${config.clientSecret}&code=${code}&grant_type=authorization_code`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = (await tokenResponse.json()) as any;

    if (tokenData.errcode) {
      console.error('WeChat token exchange failed:', tokenData);
      throw new Error(`WeChat OAuth error: ${tokenData.errmsg || 'Unknown error'}`);
    }

    // Get user info
    const userInfoUrl = `${config.userInfoUrl}?access_token=${tokenData.access_token}&openid=${tokenData.openid}&lang=en`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo = (await userInfoResponse.json()) as any;

    if (userInfo.errcode) {
      console.error('WeChat user info failed:', userInfo);
      throw new Error(`WeChat user info error: ${userInfo.errmsg || 'Unknown error'}`);
    }

    const profile: OAuthUserProfile = {
      provider: 'wechat',
      providerId: tokenData.openid,
      name: userInfo.nickname || 'WeChat User',
      email: userInfo.email || undefined,
      avatarUrl: userInfo.headimgurl,
      rawProfile: { ...userInfo, openid: tokenData.openid, unionid: tokenData.unionid },
    };

    return {
      profile,
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
      },
    };
  }

  /**
   * Find or create a user from OAuth profile and return JWT tokens
   */
  static async findOrCreateOAuthUser(profile: OAuthUserProfile): Promise<{
    user: { id: string; name: string; email: string | null; role: string };
    jwtTokens: { accessToken: string; refreshToken: string };
    isNewUser: boolean;
  }> {
    // Try to find existing social connection
    const existingConnection = await prisma.socialConnection.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider,
          providerId: profile.providerId,
        },
      },
      include: { user: true },
    });

    if (existingConnection && existingConnection.user) {
      // Existing user — update profile data if changed
      await prisma.socialConnection.update({
        where: { id: existingConnection.id },
        data: {
          providerData: profile.rawProfile,
          accessToken: profile.rawProfile?.access_token || '',
        },
      });

      const jwtTokens = JWTUtils.generateTokens({
        userId: existingConnection.userId!,
        email: existingConnection.user.email || '',
        role: existingConnection.user.role,
      });

      await JWTUtils.storeRefreshToken(existingConnection.userId!, jwtTokens.refreshToken);

      return {
        user: {
          id: existingConnection.user.id,
          name: existingConnection.user.name,
          email: existingConnection.user.email,
          role: existingConnection.user.role,
        },
        jwtTokens,
        isNewUser: false,
      };
    }

    // Try to find user by email (for Google OAuth)
    let user = profile.email
      ? await prisma.user.findUnique({ where: { email: profile.email } })
      : null;

    const isNewUser = !user;

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email: profile.email || `${profile.provider}_${profile.providerId}@${profile.provider}.oauth`,
          avatarUrl: profile.avatarUrl,
        },
      });
    }

    // Create social connection
    await prisma.socialConnection.create({
      data: {
        userId: user.id,
        provider: profile.provider,
        providerId: profile.providerId,
        providerData: profile.rawProfile,
      },
    });

    const jwtTokens = JWTUtils.generateTokens({
      userId: user.id,
      email: user.email || '',
      role: user.role,
    });

    await JWTUtils.storeRefreshToken(user.id, jwtTokens.refreshToken);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      jwtTokens,
      isNewUser,
    };
  }

  private static generateState(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
}

export const oauthService = OAuthService;
