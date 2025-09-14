import { API_BASE_URL } from '../config/api';
import { io, Socket } from 'socket.io-client';

export interface DiscoveryFilters {
  latitude?: number;
  longitude?: number;
  radius?: number;
  startTime?: string;
  endTime?: string;
  skillLevel?: string;
  minPlayers?: number;
  maxPlayers?: number;
  courtType?: string;
  limit?: number;
  offset?: number;
}

export interface DiscoveryResult {
  id: string;
  name: string;
  location: string;
  distance?: number;
  scheduledAt: string;
  currentPlayers: number;
  maxPlayers: number;
  skillLevel?: string;
  courtType?: string;
  organizerName: string;
  visibility: string;
  relevanceScore: number;
}

export interface DiscoveryResponse {
  sessions: DiscoveryResult[];
  totalCount: number;
  searchRadius?: number;
  filters: DiscoveryFilters;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
  timestamp: string;
}

class DiscoveryApiService {
  private baseUrl = `${API_BASE_URL}/sessions/discovery`;
  private socket: Socket | null = null;
  private discoveryListeners: Map<string, Function[]> = new Map();

  /**
   * Initialize real-time discovery updates
   */
  initializeRealTimeUpdates(): void {
    if (this.socket) {
      return; // Already initialized
    }

    try {
      this.socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      this.socket.on('connect', () => {
        console.log('🔗 Discovery: Connected to real-time updates');
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 Discovery: Disconnected from real-time updates');
      });

      // Listen for discovery events
      this.socket.on('discovery:session-created', (data) => {
        console.log('📡 Discovery: New session created', data);
        this.notifyListeners('session-created', data);
      });

      this.socket.on('discovery:session-updated', (data) => {
        console.log('📡 Discovery: Session updated', data);
        this.notifyListeners('session-updated', data);
      });

      this.socket.on('discovery:session-terminated', (data) => {
        console.log('📡 Discovery: Session terminated', data);
        this.notifyListeners('session-terminated', data);
      });

      this.socket.on('discovery:session-reactivated', (data) => {
        console.log('📡 Discovery: Session reactivated', data);
        this.notifyListeners('session-reactivated', data);
      });

    } catch (error) {
      console.error('Failed to initialize real-time discovery updates:', error);
    }
  }

  /**
   * Add event listener for discovery events
   */
  addDiscoveryListener(event: string, callback: Function): void {
    if (!this.discoveryListeners.has(event)) {
      this.discoveryListeners.set(event, []);
    }
    this.discoveryListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener for discovery events
   */
  removeDiscoveryListener(event: string, callback: Function): void {
    const listeners = this.discoveryListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Notify all listeners for a specific event
   */
  private notifyListeners(event: string, data: any): void {
    const listeners = this.discoveryListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in discovery listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Disconnect from real-time updates
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.discoveryListeners.clear();
      console.log('🔌 Discovery: Disconnected from real-time updates');
    }
  }

  /**
   * Discover sessions based on filters
   */
  async discoverSessions(filters: DiscoveryFilters = {}): Promise<DiscoveryResponse> {
    try {
      const queryParams = new URLSearchParams();

      // Add filter parameters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });

      const url = `${this.baseUrl}?${queryParams.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<DiscoveryResponse> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to discover sessions');
      }

      return result.data!;
    } catch (error) {
      console.error('Discovery API error:', error);
      throw error;
    }
  }

  /**
   * Get detailed session information for discovery
   */
  async getSessionDetails(sessionId: string, userLocation?: { latitude: number; longitude: number }): Promise<DiscoveryResult> {
    try {
      const queryParams = new URLSearchParams();

      if (userLocation) {
        queryParams.append('latitude', userLocation.latitude.toString());
        queryParams.append('longitude', userLocation.longitude.toString());
      }

      const url = `${this.baseUrl}/${sessionId}?${queryParams.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<DiscoveryResult> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get session details');
      }

      return result.data!;
    } catch (error) {
      console.error('Get session details API error:', error);
      throw error;
    }
  }

  /**
   * Join a session discovered through the discovery system
   */
  async joinSessionFromDiscovery(sessionId: string, playerData: { playerName: string; deviceId: string }): Promise<{ sessionId: string; shareCode: string; joined: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/${sessionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playerData),
      });

      const result: ApiResponse<{ sessionId: string; shareCode: string; joined: boolean }> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to join session');
      }

      return result.data!;
    } catch (error) {
      console.error('Join session from discovery API error:', error);
      throw error;
    }
  }

  /**
   * Get discovery statistics
   */
  async getDiscoveryStats(): Promise<{
    totalActiveSessions: number;
    sessionsWithLocation: number;
    averageRelevanceScore: number;
    popularSkillLevels: string[];
    popularLocations: string[];
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/stats/summary`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse<any> = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get discovery stats');
      }

      return result.data!;
    } catch (error) {
      console.error('Get discovery stats API error:', error);
      throw error;
    }
  }
}

export const discoveryApi = new DiscoveryApiService();
export default discoveryApi;