import { ApiService } from './apiService';

export interface RankingEntry {
  id: string;
  name: string;
  sessionId?: string;
  ranking: number;
  rankingPoints: number;
  winRate: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface RankingHistory {
  id: string;
  playerId: string;
  ranking: number;
  rankingPoints: number;
  performanceRating: number;
  changeReason: string;
  matchId?: string;
  previousRanking?: number;
  pointsChange: number;
  recordedAt: string;
}

class RankingApiService {
  private apiService: ApiService;

  constructor() {
    this.apiService = new ApiService();
  }

  /**
   * Get ranking history for a specific player
   */
  async getPlayerRankingHistory(playerId: string, limit: number = 20): Promise<RankingHistory[]> {
    try {
      const response = await this.apiService.get<RankingHistory[]>(`/rankings/player/${playerId}/history?limit=${limit}`);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching player ranking history:', error);
      throw error;
    }
  }

  /**
   * Get current rankings for a session
   */
  async getSessionRankings(sessionId: string, minMatches: number = 0): Promise<RankingEntry[]> {
    try {
      const response = await this.apiService.get<RankingEntry[]>(`/rankings/session/${sessionId}?minMatches=${minMatches}`);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching session rankings:', error);
      throw error;
    }
  }

  /**
   * Get global rankings across all sessions
   */
  async getGlobalRankings(minMatches: number = 5, limit: number = 50): Promise<RankingEntry[]> {
    try {
      const response = await this.apiService.get<RankingEntry[]>(`/rankings/global?minMatches=${minMatches}&limit=${limit}`);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching global rankings:', error);
      throw error;
    }
  }

  /**
   * Update rankings after a match (admin/internal use)
   */
  async updateRankingsAfterDetailedMatch(matchId: string): Promise<any> {
    try {
      const response = await this.apiService.post(`/rankings/update/${matchId}`);
      return response.data;
    } catch (error) {
      console.error('Error updating rankings:', error);
      throw error;
    }
  }

  /**
   * Apply weekly decay to inactive players (admin use)
   */
  async applyWeeklyDecay(): Promise<any> {
    try {
      const response = await this.apiService.post('/rankings/decay');
      return response.data;
    } catch (error) {
      console.error('Error applying weekly decay:', error);
      throw error;
    }
  }

  /**
   * Initialize ranking for a new player (admin use)
   */
  async initializePlayerRanking(playerId: string): Promise<any> {
    try {
      const response = await this.apiService.post(`/rankings/initialize/${playerId}`);
      return response.data;
    } catch (error) {
      console.error('Error initializing player ranking:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const rankingApi = new RankingApiService();
export default rankingApi;