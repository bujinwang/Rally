import { apiService } from './apiService';

export interface ShareData {
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  platform: 'twitter' | 'facebook' | 'whatsapp' | 'copy_link';
  message?: string;
}

export interface SocialConnectionData {
  provider: 'google' | 'facebook' | 'twitter';
  providerId: string;
  providerData?: any;
}

export interface PrivacySettings {
  session_share: 'public' | 'friends' | 'private';
  stats_share: 'public' | 'friends' | 'private';
  achievements_share: 'public' | 'friends' | 'private';
}

export interface CommunityFeedItem {
  id: string;
  type: 'session' | 'match' | 'achievement';
  entityId: string;
  sharer: {
    id: string;
    name: string;
  };
  platform: string;
  message?: string;
  createdAt: string;
  preview?: {
    title: string;
    description: string;
    image: string;
    url: string;
  };
}

export interface CommunityFeed {
  shares: CommunityFeedItem[];
  sessions: any[];
  total: number;
}

export class SocialApi {
  /**
   * Share an entity (session, match, achievement)
   */
  async shareEntity(data: ShareData) {
    return apiService.post<{
      share: any;
      shareUrl: string;
      preview: any;
    }>('/sharing/share', data);
  }

  /**
   * Get community feed
   */
  async getCommunityFeed(limit: number = 20, offset: number = 0, userId?: string) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (userId) {
      params.append('userId', userId);
    }

    return apiService.get<CommunityFeed>(`/sharing/feed?${params.toString()}`);
  }

  /**
   * Connect social media account
   */
  async connectSocialAccount(data: SocialConnectionData) {
    return apiService.post<any>('/sharing/connect', data);
  }

  /**
   * Get user's social connections
   */
  async getSocialConnections() {
    return apiService.get<any[]>('/sharing/connections');
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(settings: PrivacySettings) {
    return apiService.put<PrivacySettings>('/sharing/privacy', settings);
  }

  /**
   * Get current privacy settings
   */
  async getPrivacySettings() {
    return apiService.get<PrivacySettings>('/sharing/privacy');
  }

  /**
   * Get sharing statistics
   */
  async getShareStats() {
    return apiService.get<any[]>('/sharing/stats');
  }

  /**
   * Get social preview for an entity
   */
  async getSocialPreview(type: string, entityId: string) {
    return apiService.get<any>(`/sharing/preview/${type}/${entityId}`);
  }
}

export const socialApi = new SocialApi();
export default socialApi;