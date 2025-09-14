// BadmintonGroup MVP API Service
// Connects to your existing backend MvpSession endpoints

import { ApiService } from './apiService';

// Types based on your backend API
export interface MvpSession {
  id: string;
  name: string;
  shareCode: string;
  scheduledAt: string;
  location: string;
  maxPlayers: number;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  ownerName: string;
  ownerDeviceId?: string;
  playerCount: number;
  players: MvpPlayer[];
  shareUrl: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MvpPlayer {
  id: string;
  name: string;
  role: 'ORGANIZER' | 'PLAYER';
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
  joinedAt: string;
  deviceId?: string;
}

export interface CreateSessionRequest {
  name?: string;
  scheduledAt: string;
  location?: string;
  ownerName: string;
  ownerDeviceId?: string;
}

export interface JoinSessionRequest {
  name: string;
  deviceId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

class MvpApiService extends ApiService {
  constructor() {
    // Your backend server URL - update this based on your setup
    super(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1');
  }

  // Create a new MVP session
  async createMvpSession(sessionData: CreateSessionRequest): Promise<ApiResponse<{ session: MvpSession }>> {
    return this.request<{ session: MvpSession }>('/mvp-sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    }, true); // Enable offline support
  }

  // Get session by share code (public access)
  async getSessionByShareCode(shareCode: string): Promise<ApiResponse<{ session: MvpSession }>> {
    const startTime = Date.now();
    
    try {
      const result = await this.request<{ session: MvpSession }>(`/mvp-sessions/join/${shareCode}`, {
        method: 'GET',
      });
      
      // Performance tracking: < 1 second target
      const loadTime = Date.now() - startTime;
      console.log(`Share link load time: ${loadTime}ms`);
      if (loadTime > 1000) {
        console.warn('Share link loading exceeded 1s target:', loadTime + 'ms');
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load session by share code:', error);
      throw error;
    }
  }

  // Join a session via share code
  async joinSession(shareCode: string, playerData: JoinSessionRequest): Promise<ApiResponse<{ player: MvpPlayer }>> {
    const startTime = Date.now();
    
    try {
      const result = await this.request<{ player: MvpPlayer }>(`/mvp-sessions/join/${shareCode}`, {
        method: 'POST',
        body: JSON.stringify(playerData),
      }, true);
      
      // Performance tracking: < 500ms target for RSVP updates
      const updateTime = Date.now() - startTime;
      console.log(`RSVP update time: ${updateTime}ms`);
      if (updateTime > 500) {
        console.warn('RSVP update exceeded 500ms target:', updateTime + 'ms');
      }
      
      return result;
    } catch (error) {
      console.error('Failed to join session:', error);
      throw error;
    }
  }

  // Update player status (ACTIVE, RESTING, LEFT)
  async updatePlayerStatus(playerId: string, status: 'ACTIVE' | 'RESTING' | 'LEFT'): Promise<ApiResponse<{ player: MvpPlayer }>> {
    const startTime = Date.now();
    
    try {
      const result = await this.request<{ player: MvpPlayer }>(`/mvp-sessions/players/${playerId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }, true);
      
      // Performance tracking
      const updateTime = Date.now() - startTime;
      console.log(`Player status update time: ${updateTime}ms`);
      
      return result;
    } catch (error) {
      console.error('Failed to update player status:', error);
      throw error;
    }
  }

  // Get sessions by owner device ID
  async getMySessionsByDeviceId(deviceId: string): Promise<ApiResponse<{ sessions: MvpSession[] }>> {
    return this.request<{ sessions: MvpSession[] }>(`/mvp-sessions/my-sessions/${deviceId}`, {
      method: 'GET',
    });
  }

  // Terminate session (owner only)
  async terminateSession(shareCode: string, ownerDeviceId: string): Promise<ApiResponse<{ session: { id: string; status: string; updatedAt: string } }>> {
    return this.request<{ session: { id: string; status: string; updatedAt: string } }>(`/mvp-sessions/terminate/${shareCode}`, {
      method: 'PUT',
      body: JSON.stringify({ ownerDeviceId }),
    }, true);
  }

  // Reactivate session (owner only)
  async reactivateSession(shareCode: string, ownerDeviceId: string): Promise<ApiResponse<{ session: { id: string; status: string; updatedAt: string } }>> {
    return this.request<{ session: { id: string; status: string; updatedAt: string } }>(`/mvp-sessions/reactivate/${shareCode}`, {
      method: 'PUT',
      body: JSON.stringify({ ownerDeviceId }),
    }, true);
  }

  // Remove player from session (owner only)
  async removePlayer(shareCode: string, playerId: string, ownerDeviceId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/mvp-sessions/${shareCode}/players/${playerId}`, {
      method: 'DELETE',
      body: JSON.stringify({ ownerDeviceId }),
    }, true);
  }

  // Add player to session (owner only)
  async addPlayer(shareCode: string, name: string, ownerDeviceId: string): Promise<ApiResponse<{ player: MvpPlayer }>> {
    return this.request<{ player: MvpPlayer }>(`/mvp-sessions/${shareCode}/add-player`, {
      method: 'POST',
      body: JSON.stringify({ name, ownerDeviceId }),
    }, true);
  }

  // Utility method: Format session for share message (WeChat/WhatsApp)
  formatSessionForShare(session: MvpSession): string {
    const date = new Date(session.scheduledAt).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
    const time = new Date(session.scheduledAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const activePlayers = session.players.filter(p => p.status === 'ACTIVE');
    const restingPlayers = session.players.filter(p => p.status === 'RESTING');

    let message = `${session.name || '羽毛球'} - ${date} ${time}\n`;
    message += `📍 ${session.location || '待定'}\n\n`;

    if (activePlayers.length > 0) {
      message += `✅ 已确认 (${activePlayers.length}):\n`;
      message += activePlayers.map(p => p.name).join(', ') + '\n\n';
    }

    if (restingPlayers.length > 0) {
      message += `⏳ 等待中 (${restingPlayers.length}):\n`;
      message += restingPlayers.map(p => p.name).join(', ') + '\n\n';
    }

    message += `🔗 点击加入: ${session.shareUrl}`;

    return message;
  }

  // Cache management for offline support
  async cacheSession(session: MvpSession): Promise<void> {
    try {
      const { StorageService } = require('./storageService');
      await StorageService.cacheSession(session);
    } catch (error) {
      console.error('Error caching session:', error);
    }
  }

  async getCachedSession(shareCode: string): Promise<MvpSession | null> {
    try {
      const { StorageService } = require('./storageService');
      return await StorageService.getCachedSession(shareCode);
    } catch (error) {
      console.error('Error getting cached session:', error);
      return null;
    }
  }
}

// Export singleton instance
export const mvpApiService = new MvpApiService();
export default mvpApiService;