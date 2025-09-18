import {
  PlayerAnalytics,
  SessionAnalytics,
  TournamentAnalytics,
  SystemAnalytics,
  LeaderboardEntry,
  PlayerPerformanceTrends,
  AnalyticsApiResponse,
  AnalyticsDashboardData,
  AnalyticsFilters
} from '../types/analytics';

const API_BASE_URL = 'http://localhost:3001/api';

class AnalyticsApiService {
  private static readonly BASE_URL = `${API_BASE_URL}/analytics`;

  /**
   * Get player analytics
   */
  static async getPlayerAnalytics(playerId: string): Promise<AnalyticsApiResponse<PlayerAnalytics>> {
    try {
      const response = await fetch(`${this.BASE_URL}/player/${playerId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching player analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch player analytics'
      };
    }
  }

  /**
   * Get player leaderboard
   */
  static async getLeaderboard(limit: number = 10): Promise<AnalyticsApiResponse<LeaderboardEntry[]>> {
    try {
      const response = await fetch(`${this.BASE_URL}/leaderboard?limit=${limit}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch leaderboard'
      };
    }
  }

  /**
   * Get player performance trends
   */
  static async getPlayerTrends(playerId: string, days: number = 30): Promise<AnalyticsApiResponse<PlayerPerformanceTrends>> {
    try {
      const response = await fetch(`${this.BASE_URL}/player/${playerId}/trends?days=${days}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching player trends:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch player trends'
      };
    }
  }

  /**
   * Get session analytics
   */
  static async getSessionAnalytics(sessionId: string): Promise<AnalyticsApiResponse<SessionAnalytics>> {
    try {
      const response = await fetch(`${this.BASE_URL}/session/${sessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching session analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch session analytics'
      };
    }
  }

  /**
   * Get tournament analytics
   */
  static async getTournamentAnalytics(tournamentId: string): Promise<AnalyticsApiResponse<TournamentAnalytics>> {
    try {
      const response = await fetch(`${this.BASE_URL}/tournament/${tournamentId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching tournament analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tournament analytics'
      };
    }
  }

  /**
   * Get system analytics
   */
  static async getSystemAnalytics(date?: string): Promise<AnalyticsApiResponse<SystemAnalytics>> {
    try {
      const url = date
        ? `${this.BASE_URL}/system?date=${date}`
        : `${this.BASE_URL}/system`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching system analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch system analytics'
      };
    }
  }

  /**
   * Refresh player analytics
   */
  static async refreshPlayerAnalytics(playerId: string): Promise<AnalyticsApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/refresh/player/${playerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing player analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh player analytics'
      };
    }
  }

  /**
   * Refresh session analytics
   */
  static async refreshSessionAnalytics(sessionId: string): Promise<AnalyticsApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/refresh/session/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing session analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh session analytics'
      };
    }
  }

  /**
   * Refresh tournament analytics
   */
  static async refreshTournamentAnalytics(tournamentId: string): Promise<AnalyticsApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/refresh/tournament/${tournamentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing tournament analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh tournament analytics'
      };
    }
  }

  /**
   * Refresh system analytics
   */
  static async refreshSystemAnalytics(date?: Date): Promise<AnalyticsApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/refresh/system`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: date ? date.toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing system analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh system analytics'
      };
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  static async getAnalyticsDashboard(playerId: string): Promise<AnalyticsApiResponse<AnalyticsDashboardData>> {
    try {
      // Fetch all analytics data in parallel
      const [playerAnalytics, leaderboard, systemAnalytics, trends] = await Promise.all([
        this.getPlayerAnalytics(playerId),
        this.getLeaderboard(10),
        this.getSystemAnalytics(),
        this.getPlayerTrends(playerId, 30)
      ]);

      // Check if any requests failed
      if (!playerAnalytics.success || !leaderboard.success || !systemAnalytics.success || !trends.success) {
        return {
          success: false,
          error: 'Failed to fetch complete dashboard data'
        };
      }

      const dashboardData: AnalyticsDashboardData = {
        playerAnalytics: playerAnalytics.data,
        leaderboard: leaderboard.data || [],
        systemAnalytics: systemAnalytics.data,
        performanceTrends: trends.data
      };

      return {
        success: true,
        data: dashboardData
      };

    } catch (error) {
      console.error('Error fetching analytics dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch analytics dashboard'
      };
    }
  }

  /**
   * Get session analytics dashboard data
   */
  static async getSessionAnalyticsDashboard(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/sessions?${queryParams.toString()}`
        : `${this.BASE_URL}/sessions`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching session analytics dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch session analytics dashboard'
      };
    }
  }

  /**
   * Get session attendance trends
   */
  static async getSessionTrends(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/trends?${queryParams.toString()}`
        : `${this.BASE_URL}/trends`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching session trends:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch session trends'
      };
    }
  }

  /**
   * Get geographic distribution of sessions
   */
  static async getGeographicDistribution(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/geography?${queryParams.toString()}`
        : `${this.BASE_URL}/geography`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching geographic distribution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch geographic distribution'
      };
    }
  }

  /**
   * Get participation analysis
   */
  static async getParticipationAnalysis(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/participation?${queryParams.toString()}`
        : `${this.BASE_URL}/participation`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching participation analysis:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch participation analysis'
      };
    }
  }

  /**
   * Get session type popularity analytics
   */
  static async getSessionTypeAnalytics(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/session-types?${queryParams.toString()}`
        : `${this.BASE_URL}/session-types`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching session type analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch session type analytics'
      };
    }
  }

  /**
   * Get peak usage patterns
   */
  static async getPeakUsagePatterns(
    startDate?: Date,
    endDate?: Date,
    filters?: any
  ): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (startDate) {
        queryParams.append('startDate', startDate.toISOString());
      }

      if (endDate) {
        queryParams.append('endDate', endDate.toISOString());
      }

      if (filters) {
        queryParams.append('filters', JSON.stringify(filters));
      }

      const url = queryParams.toString()
        ? `${this.BASE_URL}/peak-usage?${queryParams.toString()}`
        : `${this.BASE_URL}/peak-usage`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching peak usage patterns:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch peak usage patterns'
      };
    }
  }

  /**
   * Export analytics data
   */
  static async exportAnalyticsData(
    startDate?: Date,
    endDate?: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<Blob | any> {
    try {
      const response = await fetch(`${this.BASE_URL}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          format
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (format === 'csv') {
        return await response.blob();
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to export analytics data');
    }
  }

  /**
   * Track analytics event
   */
  static async trackAnalyticsEvent(
    type: string,
    entityId: string,
    userId?: string,
    data?: any
  ): Promise<AnalyticsApiResponse<{ message: string }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          entityId,
          userId,
          data
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('Error tracking analytics event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to track analytics event'
      };
    }
  }

  /**
   * Get analytics with filters
   */
  static async getAnalyticsWithFilters(filters: AnalyticsFilters): Promise<AnalyticsApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();

      if (filters.dateRange) {
        queryParams.append('startDate', filters.dateRange.start);
        queryParams.append('endDate', filters.dateRange.end);
      }

      if (filters.limit) {
        queryParams.append('limit', filters.limit.toString());
      }

      if (filters.sortBy) {
        queryParams.append('sortBy', filters.sortBy);
      }

      if (filters.sortOrder) {
        queryParams.append('sortOrder', filters.sortOrder);
      }

      let url = this.BASE_URL;

      // Determine which endpoint to call based on filters
      if (filters.playerId) {
        url += `/player/${filters.playerId}`;
      } else if (filters.sessionId) {
        url += `/session/${filters.sessionId}`;
      } else if (filters.tournamentId) {
        url += `/tournament/${filters.tournamentId}`;
      } else {
        url += '/leaderboard';
      }

      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Error fetching filtered analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch filtered analytics'
      };
    }
  }
}

// Export convenience functions
export const getPlayerAnalytics = AnalyticsApiService.getPlayerAnalytics.bind(AnalyticsApiService);
export const getLeaderboard = AnalyticsApiService.getLeaderboard.bind(AnalyticsApiService);
export const getPlayerTrends = AnalyticsApiService.getPlayerTrends.bind(AnalyticsApiService);
export const getSessionAnalytics = AnalyticsApiService.getSessionAnalytics.bind(AnalyticsApiService);
export const getTournamentAnalytics = AnalyticsApiService.getTournamentAnalytics.bind(AnalyticsApiService);
export const getSystemAnalytics = AnalyticsApiService.getSystemAnalytics.bind(AnalyticsApiService);
export const refreshPlayerAnalytics = AnalyticsApiService.refreshPlayerAnalytics.bind(AnalyticsApiService);
export const refreshSessionAnalytics = AnalyticsApiService.refreshSessionAnalytics.bind(AnalyticsApiService);
export const refreshTournamentAnalytics = AnalyticsApiService.refreshTournamentAnalytics.bind(AnalyticsApiService);
export const refreshSystemAnalytics = AnalyticsApiService.refreshSystemAnalytics.bind(AnalyticsApiService);
export const getAnalyticsDashboard = AnalyticsApiService.getAnalyticsDashboard.bind(AnalyticsApiService);
export const getAnalyticsWithFilters = AnalyticsApiService.getAnalyticsWithFilters.bind(AnalyticsApiService);

// New session analytics exports
export const getSessionAnalyticsDashboard = AnalyticsApiService.getSessionAnalyticsDashboard.bind(AnalyticsApiService);
export const getSessionTrends = AnalyticsApiService.getSessionTrends.bind(AnalyticsApiService);
export const getGeographicDistribution = AnalyticsApiService.getGeographicDistribution.bind(AnalyticsApiService);
export const getParticipationAnalysis = AnalyticsApiService.getParticipationAnalysis.bind(AnalyticsApiService);
export const getSessionTypeAnalytics = AnalyticsApiService.getSessionTypeAnalytics.bind(AnalyticsApiService);
export const getPeakUsagePatterns = AnalyticsApiService.getPeakUsagePatterns.bind(AnalyticsApiService);
export const exportAnalyticsData = AnalyticsApiService.exportAnalyticsData.bind(AnalyticsApiService);
export const trackAnalyticsEvent = AnalyticsApiService.trackAnalyticsEvent.bind(AnalyticsApiService);

export default AnalyticsApiService;