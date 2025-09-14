import {
  Achievement,
  PlayerAchievement,
  PlayerBadge,
  PlayerReward,
  AchievementTrigger,
  AchievementProgress,
  AchievementTriggerType,
  AchievementListResponse,
  PlayerAchievementsResponse,
  AchievementTriggerResponse,
  RewardClaimResponse,
  CreateAchievementData,
  CreateBadgeData
} from '../types/achievement';

const API_BASE_URL = 'http://localhost:3000/api';

class AchievementApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all active achievements
   */
  async getActiveAchievements(category?: string): Promise<Achievement[]> {
    const queryParams = category ? `?category=${category}` : '';
    const response: AchievementListResponse = await this.request(
      `/achievements${queryParams}`
    );
    return response.data;
  }

  /**
   * Get achievements by category
   */
  async getAchievementsByCategory(category: string): Promise<Achievement[]> {
    return this.getActiveAchievements(category);
  }

  /**
   * Get player achievements and badges
   */
  async getPlayerAchievements(playerId: string): Promise<{
    achievements: PlayerAchievement[];
    badges: PlayerBadge[];
    totalAchievements: number;
    totalBadges: number;
  }> {
    const response: PlayerAchievementsResponse = await this.request(
      `/achievements/player/${playerId}`
    );
    return response.data;
  }

  /**
   * Get player badges only
   */
  async getPlayerBadges(playerId: string): Promise<PlayerBadge[]> {
    const response = await this.request<{ success: boolean; data: PlayerBadge[]; count: number }>(
      `/achievements/player/${playerId}/badges`
    );
    return response.data;
  }

  /**
   * Get player rewards
   */
  async getPlayerRewards(playerId: string): Promise<PlayerReward[]> {
    const response = await this.request<{ success: boolean; data: PlayerReward[]; count: number }>(
      `/achievements/player/${playerId}/rewards`
    );
    return response.data;
  }

  /**
   * Claim a reward
   */
  async claimReward(playerId: string, rewardId: string): Promise<boolean> {
    const response: RewardClaimResponse = await this.request(
      `/achievements/player/${playerId}/rewards/${rewardId}/claim`,
      {
        method: 'POST',
      }
    );
    return response.success;
  }

  /**
   * Trigger achievement check and update
   */
  async triggerAchievements(
    playerId: string,
    trigger: AchievementTrigger
  ): Promise<AchievementProgress[]> {
    const response: AchievementTriggerResponse = await this.request(
      '/achievements/trigger',
      {
        method: 'POST',
        body: JSON.stringify({
          playerId,
          trigger,
        }),
      }
    );
    return response.data;
  }

  /**
   * Create a new achievement (admin only)
   */
  async createAchievement(data: CreateAchievementData): Promise<Achievement> {
    const response = await this.request<{ success: boolean; data: Achievement }>(
      '/achievements',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response.data;
  }

  /**
   * Create a new badge (admin only)
   */
  async createBadge(data: CreateBadgeData): Promise<any> {
    const response = await this.request<{ success: boolean; data: any }>(
      '/achievements/badges',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response.data;
  }

  /**
   * Helper method to trigger achievement on match completion
   */
  async triggerMatchWin(playerId: string, matchId: string): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.MATCH_WIN,
      source: `match:${matchId}`,
      data: { matchId }
    });
  }

  /**
   * Helper method to trigger achievement on tournament win
   */
  async triggerTournamentWin(playerId: string, tournamentId: string): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.TOURNAMENT_WIN,
      source: `tournament:${tournamentId}`,
      data: { tournamentId }
    });
  }

  /**
   * Helper method to trigger achievement on tournament participation
   */
  async triggerTournamentParticipation(playerId: string, tournamentId: string): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.TOURNAMENT_PARTICIPATE,
      source: `tournament:${tournamentId}`,
      data: { tournamentId }
    });
  }

  /**
   * Helper method to trigger achievement on streak
   */
  async triggerStreak(playerId: string, currentStreak: number): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.STREAK,
      source: 'match_completion',
      data: { currentStreak }
    });
  }

  /**
   * Helper method to trigger achievement on perfect game
   */
  async triggerPerfectGame(playerId: string, matchId: string): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.PERFECT_GAME,
      source: `match:${matchId}`,
      data: { matchId }
    });
  }

  /**
   * Helper method to trigger achievement on session hosting
   */
  async triggerSessionHost(playerId: string, sessionId: string): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.SESSION_HOST,
      source: `session:${sessionId}`,
      data: { sessionId }
    });
  }

  /**
   * Helper method to trigger achievement on time played
   */
  async triggerTimePlayed(playerId: string, minutesPlayed: number): Promise<AchievementProgress[]> {
    return this.triggerAchievements(playerId, {
      type: AchievementTriggerType.TIME_PLAYED,
      source: 'session_completion',
      data: { minutesPlayed }
    });
  }
}

export const achievementApi = new AchievementApiService();
export default achievementApi;