import { API_BASE_URL, DEVICE_ID_KEY } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceService from './deviceService';

export interface CreateSessionRequest {
  name?: string;
  dateTime: string; // ISO string
  location?: string;
  maxPlayers?: number;
  organizerName: string;
}

export interface SessionData {
  id: string;
  name: string;
  scheduledAt: string;
  location?: string;
  maxPlayers: number;
  skillLevel?: string;
  cost?: number;
  description?: string;
  ownerName: string;
  ownerDeviceId?: string;
  shareCode: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  players: SessionPlayer[];
  games: SessionGame[];
}

export interface SessionPlayer {
  id: string;
  name: string;
  deviceId?: string;
  joinedAt: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export interface SessionGame {
  id: string;
  gameNumber: number;
  courtName?: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  team1FinalScore: number;
  team2FinalScore: number;
  winnerTeam?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export interface SessionResponse extends ApiResponse<{ session: SessionData; shareLink: string }> {}
export interface SessionsListResponse extends ApiResponse<{ sessions: SessionData[] }> {}
export interface JoinSessionResponse extends ApiResponse<{ player: SessionPlayer; session: SessionData }> {}

class SessionApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Get common headers for API requests
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  // Handle API response errors
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // Get or create device ID using DeviceService
  async getDeviceId(): Promise<string> {
    return await DeviceService.getDeviceId();
  }

  // Create a new session
  async createSession(sessionRequest: CreateSessionRequest): Promise<SessionResponse> {
    try {
      const requestData = {
        ...sessionRequest,
        maxPlayers: sessionRequest.maxPlayers || 20,
      };

      const response = await fetch(`${this.baseUrl}/mvp-sessions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestData),
      });

      return this.handleResponse<SessionResponse>(response);
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  // Get session by share code
  async getSessionByShareCode(shareCode: string): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<SessionResponse>(response);
    } catch (error) {
      console.error('Error fetching session:', error);
      throw error;
    }
  }

  // Get all active sessions
  async getActiveSessions(): Promise<SessionsListResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions?status=ACTIVE&limit=50`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<SessionsListResponse>(response);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  }

  // Get sessions for current device (organized or participated)
  async getMySessions(): Promise<SessionsListResponse> {
    try {
      const deviceId = await this.getDeviceId();
      
      const response = await fetch(`${this.baseUrl}/mvp-sessions/my-sessions/${deviceId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<SessionsListResponse>(response);
    } catch (error) {
      console.error('Error fetching my sessions:', error);
      throw error;
    }
  }

  // Join a session
  async joinSession(shareCode: string, playerName: string): Promise<JoinSessionResponse> {
    try {
      const deviceId = await this.getDeviceId();
      
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}/join`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: playerName,
          deviceId: deviceId,
        }),
      });

      return this.handleResponse<JoinSessionResponse>(response);
    } catch (error) {
      console.error('Error joining session:', error);
      throw error;
    }
  }

  // Leave a session
  async leaveSession(shareCode: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const deviceId = await this.getDeviceId();
      
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}/leave`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          deviceId: deviceId,
        }),
      });

      return this.handleResponse<ApiResponse<{ message: string }>>(response);
    } catch (error) {
      console.error('Error leaving session:', error);
      throw error;
    }
  }

  // Update session details (only for session owner)
  async updateSession(shareCode: string, updates: Partial<CreateSessionRequest>): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      });

      return this.handleResponse<SessionResponse>(response);
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  // Cancel/Complete session (only for session owner)
  async updateSessionStatus(shareCode: string, status: 'COMPLETED' | 'CANCELLED'): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ status }),
      });

      return this.handleResponse<SessionResponse>(response);
    } catch (error) {
      console.error('Error updating session status:', error);
      throw error;
    }
  }

  // Generate session share link
  generateShareLink(shareCode: string): string {
    return `https://badminton-group.app/join/${shareCode}`;
  }

  // Create a new game
  async createGame(shareCode: string, gameData: {
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
    courtName?: string;
  }): Promise<ApiResponse<{ game: SessionGame }>> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}/games`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(gameData),
      });

      return this.handleResponse<ApiResponse<{ game: SessionGame }>>(response);
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  // Update game score (finish game)
  async updateGameScore(shareCode: string, gameId: string, scores: {
    team1FinalScore: number;
    team2FinalScore: number;
  }): Promise<ApiResponse<{ game: SessionGame }>> {
    try {
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}/games/${gameId}/score`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(scores),
      });

      return this.handleResponse<ApiResponse<{ game: SessionGame }>>(response);
    } catch (error) {
      console.error('Error updating game score:', error);
      throw error;
    }
  }

  // Validate session data
  validateSessionData(data: Partial<CreateSessionRequest>): string[] {
    const errors: string[] = [];

    if (!data.organizerName?.trim()) {
      errors.push('Your name is required');
    }

    if (!data.dateTime) {
      errors.push('Session date and time is required');
    } else {
      const scheduledDate = new Date(data.dateTime);
      const now = new Date();
      if (scheduledDate <= now) {
        errors.push('Session must be scheduled for a future date and time');
      }
    }

    if (data.maxPlayers && (data.maxPlayers < 2 || data.maxPlayers > 20)) {
      errors.push('Maximum players must be between 2 and 20');
    }

    if (data.organizerName && data.organizerName.length > 30) {
      errors.push('Name cannot exceed 30 characters');
    }

    if (data.location && data.location.length > 200) {
      errors.push('Location cannot exceed 200 characters');
    }

    if (data.name && data.name.length > 200) {
      errors.push('Session name cannot exceed 200 characters');
    }

    return errors;
  }

  // Format session data for display
  formatSessionForDisplay(session: SessionData): {
    displayName: string;
    formattedDate: string;
    formattedTime: string;
    duration: string;
    playersText: string;
    statusColor: string;
    statusText: string;
  } {
    const scheduledDate = new Date(session.scheduledAt);
    
    return {
      displayName: session.name || 'Badminton Session',
      formattedDate: scheduledDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      formattedTime: scheduledDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      duration: this.calculateSessionDuration(session),
      playersText: `${session.players.length}/${session.maxPlayers} players`,
      statusColor: this.getStatusColor(session.status),
      statusText: this.getStatusText(session.status),
    };
  }

  // Calculate session duration
  private calculateSessionDuration(session: SessionData): string {
    if (session.games.length === 0) return 'Not started';
    
    const completedGames = session.games.filter(g => g.endTime);
    if (completedGames.length === 0) return 'In progress';

    const startTimes = session.games
      .filter(g => g.startTime)
      .map(g => new Date(g.startTime!).getTime());
    
    const endTimes = completedGames
      .map(g => new Date(g.endTime!).getTime());

    if (startTimes.length === 0 || endTimes.length === 0) return 'In progress';

    const earliestStart = Math.min(...startTimes);
    const latestEnd = Math.max(...endTimes);
    const durationMs = latestEnd - earliestStart;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  }

  // Get status color
  private getStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE': return '#4CAF50';
      case 'COMPLETED': return '#2196F3';
      case 'CANCELLED': return '#f44336';
      default: return '#9E9E9E';
    }
  }

  // Get status text
  private getStatusText(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'COMPLETED': return 'Completed';
      case 'CANCELLED': return 'Cancelled';
      default: return 'Unknown';
    }
  }

  // Claim ownership of a session (when ownerDeviceId is missing)
  async claimSessionOwnership(shareCode: string): Promise<SessionResponse> {
    try {
      const deviceId = await this.getDeviceId();
      const response = await fetch(`${this.baseUrl}/mvp-sessions/${shareCode}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ ownerDeviceId: deviceId }),
      });

      return this.handleResponse<SessionResponse>(response);
    } catch (error) {
      console.error('Error claiming session ownership:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const sessionApi = new SessionApiService();

// Export default for easier importing
export default sessionApi;