import { API_BASE_URL } from '../config/api';

export interface SessionHistoryItem {
  id: string;
  name: string;
  date: string;
  location: string;
  duration: string;
  playerCount: number;
  totalGames: number;
  organizer: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  shareCode: string;
  players: PlayerStats[];
  games: GameResult[];
}

export interface PlayerStats {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

export interface GameResult {
  id: string;
  gameNumber: number;
  courtName?: string;
  team1Players: string[];
  team2Players: string[];
  team1Score: number;
  team2Score: number;
  winnerTeam?: number;
  duration: string;
  startTime?: string;
  endTime?: string;
  sets: GameSet[];
}

export interface GameSet {
  setNumber: number;
  team1Score: number;
  team2Score: number;
  winnerTeam?: number;
  isCompleted: boolean;
}

export interface SessionHistoryResponse {
  success: boolean;
  data: {
    sessions: SessionHistoryItem[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    userInfo?: {
      id: string;
      email: string | null;
      role: string;
    };
    isAuthenticated: boolean;
  };
  message: string;
  timestamp: string;
}

export interface PlayerStatsResponse {
  success: boolean;
  data: {
    playerStats: {
      totalSessions: number;
      totalGamesPlayed: number;
      totalWins: number;
      totalLosses: number;
      overallWinRate: number;
      recentWinRate: number;
      favoritePartners: string[];
      sessionsHistory: {
        sessionId: string;
        sessionName: string;
        date: string;
        gamesPlayed: number;
        wins: number;
        losses: number;
        winRate: number;
      }[];
    };
  };
  message: string;
  timestamp: string;
}

export interface SearchResult {
  success: boolean;
  data: {
    query: string;
    type: string;
    results: {
      sessions: any[];
      players: any[];
      totalResults: number;
    };
    suggestions: string[];
  };
  message: string;
  timestamp: string;
}

class SessionHistoryApi {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Set authentication token for API requests
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  // Get common headers for API requests
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    return headers;
  }

  // Handle API response errors
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // Get session history with optional filtering and pagination
  async getSessionHistory(params?: {
    deviceId?: string;
    filter?: 'all' | 'organized' | 'participated';
    sortBy?: 'date' | 'games' | 'duration' | 'players';
    limit?: number;
    offset?: number;
  }): Promise<SessionHistoryResponse> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params?.deviceId) queryParams.append('deviceId', params.deviceId);
      if (params?.filter) queryParams.append('filter', params.filter);
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const response = await fetch(`${this.baseUrl}/session-history?${queryParams}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<SessionHistoryResponse>(response);
    } catch (error) {
      console.error('Error fetching session history:', error);
      throw error;
    }
  }

  // Get detailed information for a specific session
  async getSessionDetails(sessionId: string): Promise<{ success: boolean; data: { session: SessionHistoryItem } }> {
    try {
      const response = await fetch(`${this.baseUrl}/session-history/${sessionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse(response);
    } catch (error) {
      console.error('Error fetching session details:', error);
      throw error;
    }
  }

  // Get player statistics across all sessions
  async getPlayerStats(deviceId: string): Promise<PlayerStatsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/session-history/players/${deviceId}/stats`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<PlayerStatsResponse>(response);
    } catch (error) {
      console.error('Error fetching player stats:', error);
      throw error;
    }
  }

  // Create a new game within a session
  async createGame(sessionId: string, gameData: {
    courtName?: string;
    team1Player1: string;
    team1Player2: string;
    team2Player1: string;
    team2Player2: string;
  }): Promise<{ success: boolean; data: { game: any } }> {
    try {
      const response = await fetch(`${this.baseUrl}/session-history/sessions/${sessionId}/games`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(gameData),
      });

      return this.handleResponse(response);
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  // Update game results
  async updateGame(gameId: string, updateData: {
    team1FinalScore?: number;
    team2FinalScore?: number;
    winnerTeam?: 1 | 2;
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  }): Promise<{ success: boolean; data: { game: any } }> {
    try {
      const response = await fetch(`${this.baseUrl}/session-history/games/${gameId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updateData),
      });

      return this.handleResponse(response);
    } catch (error) {
      console.error('Error updating game:', error);
      throw error;
    }
  }

  // Search for sessions and players
  async search(params: {
    q: string;
    type?: 'sessions' | 'players' | 'all';
    limit?: number;
    includeCompleted?: boolean;
  }): Promise<SearchResult> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('q', params.q);
      if (params.type) queryParams.append('type', params.type);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.includeCompleted) queryParams.append('includeCompleted', params.includeCompleted.toString());

      const response = await fetch(`${this.baseUrl}/search?${queryParams}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse<SearchResult>(response);
    } catch (error) {
      console.error('Error searching:', error);
      throw error;
    }
  }

  // Get search suggestions
  async getSuggestions(query: string): Promise<{ success: boolean; data: { suggestions: { text: string; type: string }[] } }> {
    try {
      const response = await fetch(`${this.baseUrl}/search/suggestions?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return this.handleResponse(response);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const sessionHistoryApi = new SessionHistoryApi();

// Export default for easier importing
export default sessionHistoryApi;

// Utility functions for working with session history data
export const SessionHistoryUtils = {
  // Calculate win rate percentage
  calculateWinRate: (wins: number, totalGames: number): number => {
    return totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  },

  // Format duration string
  formatDuration: (minutes: number): string => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  },

  // Get player ranking based on win rate and games played
  rankPlayers: (players: PlayerStats[]): PlayerStats[] => {
    return [...players].sort((a, b) => {
      // Primary sort: win rate
      if (a.winRate !== b.winRate) {
        return b.winRate - a.winRate;
      }
      // Secondary sort: total games played
      return b.gamesPlayed - a.gamesPlayed;
    });
  },

  // Find player's best performance session
  findBestSession: (sessionsHistory: any[]): any | null => {
    if (!sessionsHistory.length) return null;
    
    return sessionsHistory.reduce((best, current) => {
      const bestRate = best.gamesPlayed > 0 ? (best.wins / best.gamesPlayed) * 100 : 0;
      const currentRate = current.gamesPlayed > 0 ? (current.wins / current.gamesPlayed) * 100 : 0;
      
      if (currentRate > bestRate || (currentRate === bestRate && current.wins > best.wins)) {
        return current;
      }
      return best;
    });
  },

  // Calculate game statistics
  calculateGameStats: (games: GameResult[]) => {
    const completed = games.filter(g => g.winnerTeam);
    const totalSets = games.reduce((acc, game) => acc + game.sets.length, 0);
    const avgDuration = completed.length > 0 
      ? completed.reduce((acc, game) => {
          const duration = parseInt(game.duration.replace(/[^\d]/g, '')) || 0;
          return acc + duration;
        }, 0) / completed.length 
      : 0;

    return {
      totalGames: games.length,
      completedGames: completed.length,
      inProgressGames: games.filter(g => !g.winnerTeam).length,
      totalSets,
      averageDuration: Math.round(avgDuration)
    };
  }
};