import { API_BASE_URL } from '../config/api';
import {
  ScheduledMatch,
  CreateScheduledMatchData,
  UpdateScheduledMatchData,
  MatchSchedulingResponse,
  UpcomingMatchesResponse,
  MatchListFilters,
  CalendarSyncOptions,
  MatchReminderSettings,
  SchedulingConflict
} from '../types/matchScheduling';

class MatchSchedulingApiService {
  private getAuthHeaders(): HeadersInit {
    // Get auth token from storage or context
    // For now, return empty headers (will be handled by backend auth)
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new scheduled match
   */
  async createScheduledMatch(data: CreateScheduledMatchData): Promise<MatchSchedulingResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error?.message || 'Failed to create scheduled match');
      }

      return {
        success: true,
        data: responseData.data,
        conflicts: responseData.conflicts
      };
    } catch (error) {
      console.error('Error creating scheduled match:', error);
      throw error;
    }
  }

  /**
   * Get scheduled matches for a specific session
   */
  async getSessionMatches(sessionId: string): Promise<ScheduledMatch[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/session/${sessionId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch session matches');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching session matches:', error);
      throw error;
    }
  }

  /**
   * Get scheduled matches for a specific player
   */
  async getPlayerMatches(playerId: string): Promise<ScheduledMatch[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/player/${playerId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch player matches');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching player matches:', error);
      throw error;
    }
  }

  /**
   * Get upcoming matches for the current user
   */
  async getUpcomingMatches(limit: number = 10): Promise<UpcomingMatchesResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/upcoming?limit=${limit}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch upcoming matches');
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data || [],
        total: data.total || 0
      };
    } catch (error) {
      console.error('Error fetching upcoming matches:', error);
      throw error;
    }
  }

  /**
   * Update a scheduled match
   */
  async updateScheduledMatch(matchId: string, data: UpdateScheduledMatchData): Promise<MatchSchedulingResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error?.message || 'Failed to update scheduled match');
      }

      return {
        success: true,
        data: responseData.data,
        conflicts: responseData.conflicts
      };
    } catch (error) {
      console.error('Error updating scheduled match:', error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled match
   */
  async cancelScheduledMatch(matchId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}/cancel`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to cancel scheduled match');
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message || 'Match cancelled successfully'
      };
    } catch (error) {
      console.error('Error cancelling scheduled match:', error);
      throw error;
    }
  }

  /**
   * Delete a scheduled match
   */
  async deleteScheduledMatch(matchId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to delete scheduled match');
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message || 'Match deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting scheduled match:', error);
      throw error;
    }
  }

  /**
   * Get match details by ID
   */
  async getMatchDetails(matchId: string): Promise<ScheduledMatch> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch match details');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error fetching match details:', error);
      throw error;
    }
  }

  /**
   * Sync match with external calendar
   */
  async syncWithCalendar(matchId: string, options: CalendarSyncOptions): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}/sync-calendar`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to sync with calendar');
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message || 'Match synced with calendar successfully'
      };
    } catch (error) {
      console.error('Error syncing with calendar:', error);
      throw error;
    }
  }

  /**
   * Update reminder settings for a match
   */
  async updateMatchReminders(matchId: string, settings: MatchReminderSettings): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/${matchId}/reminders`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to update match reminders');
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message || 'Match reminders updated successfully'
      };
    } catch (error) {
      console.error('Error updating match reminders:', error);
      throw error;
    }
  }

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(data: CreateScheduledMatchData): Promise<SchedulingConflict[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/match-scheduling/check-conflicts`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to check conflicts');
      }

      const responseData = await response.json();
      return responseData.conflicts || [];
    } catch (error) {
      console.error('Error checking conflicts:', error);
      throw error;
    }
  }
}

// Create singleton instance
const matchSchedulingApiService = new MatchSchedulingApiService();

export default matchSchedulingApiService;
export { MatchSchedulingApiService };