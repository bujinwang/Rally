import { syncManager } from './syncManager';
import { StorageService } from './storageService';

interface ApiResponse<T> {
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

class ApiService {
  private baseURL: string;
  private timeout: number = 10000; // 10 seconds

  constructor(baseURL: string = 'http://localhost:3001/api/v1') {
    this.baseURL = baseURL;
  }

  // Generic request method with offline support
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    enableOffline: boolean = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    // Check network connectivity
    const isOnline = true; // TODO: Implement actual network check

    if (!isOnline && enableOffline) {
      // Queue operation for offline sync
      if (options.method && options.method !== 'GET') {
        await syncManager.queueOperation({
          type: this.getOperationType(options.method, endpoint),
          payload: {
            endpoint,
            data: options.body ? JSON.parse(options.body as string) : undefined,
          },
        });
      }

      // Return optimistic response
      return {
        success: true,
        data: {} as T,
        message: 'Operation queued for sync',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorData.error?.code || 'HTTP_ERROR',
            message: errorData.error?.message || `HTTP ${response.status}`,
            details: errorData.error?.details,
          },
          timestamp: new Date().toISOString(),
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
        message: data.message,
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch (error: any) {
      // If offline and operation should be queued
      if (!isOnline && enableOffline && options.method !== 'GET') {
        await syncManager.queueOperation({
          type: this.getOperationType(options.method, endpoint),
          payload: {
            endpoint,
            data: options.body ? JSON.parse(options.body as string) : undefined,
          },
        });

        return {
          success: true,
          data: {} as T,
          message: 'Operation queued for sync',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.name === 'AbortError' ? 'Request timeout' : 'Network error',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Helper method to determine operation type from HTTP method and endpoint
  private getOperationType(method: string, endpoint: string): any {
    if (method === 'POST' && endpoint.includes('/sessions')) {
      return 'CREATE_SESSION';
    }
    if (method === 'PUT' && endpoint.includes('/sessions/') && endpoint.includes('/status')) {
      return 'UPDATE_PLAYER_STATUS';
    }
    if (method === 'POST' && endpoint.includes('/rotation/trigger')) {
      return 'TRIGGER_ROTATION';
    }
    // Add more operation types as needed
    return 'UNKNOWN_OPERATION';
  }

  // Authentication endpoints
  async login(credentials: { email: string; password: string; deviceId?: string }) {
    return this.request<{ user: any; tokens: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userData: { name: string; email: string; password: string; phone?: string }) {
    return this.request<{ user: any; tokens: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request<{ tokens: any }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  // Session endpoints
  async getSessions() {
    return this.request<any[]>('/sessions', {
      method: 'GET',
    });
  }

  async createSession(sessionData: any, enableOffline: boolean = true) {
    return this.request<any>('/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    }, enableOffline);
  }

  async getSession(sessionId: string) {
    return this.request<any>(`/sessions/${sessionId}`, {
      method: 'GET',
    });
  }

  async updateSession(sessionId: string, sessionData: any, enableOffline: boolean = true) {
    return this.request<any>(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(sessionData),
    }, enableOffline);
  }

  async deleteSession(sessionId: string, enableOffline: boolean = true) {
    return this.request<any>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }, enableOffline);
  }

  // Rotation endpoints
  async getRotationQueue(sessionId: string) {
    return this.request<any>(`/sessions/${sessionId}/rotation`, {
      method: 'GET',
    });
  }

  async triggerRotation(sessionId: string, enableOffline: boolean = true) {
    return this.request<any>(`/sessions/${sessionId}/rotation/trigger`, {
      method: 'POST',
    }, enableOffline);
  }

  async updatePlayerStatus(sessionId: string, playerId: string, status: string, enableOffline: boolean = true) {
    return this.request<any>(`/sessions/${sessionId}/players/${playerId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }, enableOffline);
  }

  // Utility methods
  setAuthToken(token: string) {
    // Store token for future requests
    // This would typically be handled by an interceptor
  }

  clearAuthToken() {
    // Clear stored token
  }

  // Cache management
  async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const data = await StorageService.getSessions(); // Adjust based on key
      return data as T;
    } catch (error) {
      return null;
    }
  }

  async setCachedData<T>(key: string, data: T): Promise<void> {
    try {
      // Store in appropriate storage based on key
      if (key.includes('sessions')) {
        await StorageService.saveSessions(data as any);
      }
      // Add more caching logic as needed
    } catch (error) {
      console.error('Error caching data:', error);
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;