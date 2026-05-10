import { API_BASE_URL } from '../config/api';
import {
  PlayerStatistics,
  LeaderboardEntry,
  SessionStatistics,
  PlayerComparison,
  PerformanceTrend,
  StatisticsQueryParams,
  LeaderboardQueryParams,
  ComparisonQueryParams,
  TrendsQueryParams,
  DetailedMatchData,
  MatchRecordingState,
} from '../types/statistics';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

class StatisticsApiService {
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

  /**
   * Get comprehensive statistics for a specific player
   */
  async getPlayerStatistics(
    playerId: string,
    params?: StatisticsQueryParams
  ): Promise<PlayerStatistics> {
    try {
      const queryString = params ? this.buildQueryString(params) : '';
      const response = await fetch(`${this.baseUrl}/statistics/player/${playerId}${queryString}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<PlayerStatistics> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error fetching player statistics:', error);
      throw error;
    }
  }

  /**
   * Get leaderboard rankings
   */
  async getLeaderboard(params?: LeaderboardQueryParams): Promise<LeaderboardEntry[]> {
    try {
      const queryString = params ? this.buildQueryString(params) : '';
      const response = await fetch(`${this.baseUrl}/statistics/leaderboard${queryString}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<LeaderboardEntry[]> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get statistics for a specific session
   */
  async getSessionStatistics(sessionId: string): Promise<SessionStatistics> {
    try {
      const response = await fetch(`${this.baseUrl}/statistics/session/${sessionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<SessionStatistics> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error fetching session statistics:', error);
      throw error;
    }
  }

  /**
   * Compare multiple players' statistics
   */
  async comparePlayers(params: ComparisonQueryParams): Promise<PlayerComparison> {
    try {
      const queryString = this.buildQueryString(params);
      const response = await fetch(`${this.baseUrl}/statistics/compare${queryString}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<PlayerComparison> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error comparing players:', error);
      throw error;
    }
  }

  /**
   * Get performance trends for a player
   */
  async getPerformanceTrends(
    playerId: string,
    params?: TrendsQueryParams
  ): Promise<PerformanceTrend> {
    try {
      const queryString = params ? this.buildQueryString(params) : '';
      const response = await fetch(`${this.baseUrl}/statistics/trends/${playerId}${queryString}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<PerformanceTrend> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error fetching performance trends:', error);
      throw error;
    }
  }

  /**
   * Get current user's statistics (convenience method)
   */
  async getMyStatistics(params?: StatisticsQueryParams): Promise<PlayerStatistics> {
    // This would typically get the current user ID from auth context
    // For now, we'll require the playerId to be passed
    throw new Error('Player ID required. Use getPlayerStatistics(playerId, params) instead.');
  }

  /**
   * Get top performers for quick overview
   */
  async getTopPerformers(limit: number = 10, params?: StatisticsQueryParams): Promise<LeaderboardEntry[]> {
    const leaderboardParams: LeaderboardQueryParams = {
      ...params,
      limit,
      sortBy: 'rating',
      order: 'desc',
    };

    return this.getLeaderboard(leaderboardParams);
  }

  /**
   * Get recent activity summary
   */
  async getActivitySummary(sessionId?: string): Promise<{
    totalMatches: number;
    activePlayers: number;
    topPerformer: LeaderboardEntry | null;
  }> {
    try {
      const leaderboard = await this.getLeaderboard({
        sessionId,
        limit: 1,
        sortBy: 'rating',
        order: 'desc',
      });

      // This is a simplified version - in a real implementation,
      // you might want a dedicated endpoint for activity summary
      const sessionStats = sessionId ? await this.getSessionStatistics(sessionId) : null;

      return {
        totalMatches: sessionStats?.totalMatches || 0,
        activePlayers: sessionStats?.totalPlayers || 0,
        topPerformer: leaderboard[0] || null,
      };
    } catch (error) {
      console.error('Error fetching activity summary:', error);
      return {
        totalMatches: 0,
        activePlayers: 0,
        topPerformer: null,
      };
    }
  }

  /**
   * Record a detailed match with set-by-set scores
   */
  async recordDetailedMatch(matchData: DetailedMatchData, deviceId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/matches/detailed`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...matchData,
          deviceId
        }),
      });

      const result: ApiResponse<any> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error recording detailed match:', error);
      throw error;
    }
  }

  /**
   * Get detailed match information
   */
  async getDetailedMatch(matchId: string, deviceId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/matches/detailed/${matchId}?deviceId=${deviceId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<any> = await this.handleResponse(response);
      return result.data;
    } catch (error) {
      console.error('Error fetching detailed match:', error);
      throw error;
    }
  }

  /**
   * Get matches for a session with detailed information
   */
  async getSessionMatchesDetailed(sessionId: string, deviceId: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/matches/session/${sessionId}?deviceId=${deviceId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const result: ApiResponse<{ matches: any[] }> = await this.handleResponse(response);
      return result.data.matches;
    } catch (error) {
      console.error('Error fetching session matches:', error);
      throw error;
    }
  }

  /**
   * Build query string from parameters
   */
  private buildQueryString(params: Record<string, any>): string {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // Handle array parameters (like playerIds)
          queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }
}

// Export singleton instance
export const statisticsApi = new StatisticsApiService();
export default statisticsApi;