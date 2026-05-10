import {
  Challenge,
  ChallengeData,
  ChallengeResponse,
  ChallengeApiResponse,
  ApiResponse,
  CreateChallengeForm,
  RespondToChallengeForm,
  ChallengeStats,
  ChallengeType
} from '../types/social';

class ChallengesApiService {
  private baseUrl = 'http://localhost:3000/api/challenges';

  /**
   * Create a new challenge
   */
  async createChallenge(data: CreateChallengeForm): Promise<Challenge> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create challenge');
    }

    const result: ApiResponse<Challenge> = await response.json();
    return result.data;
  }

  /**
   * Respond to a challenge
   */
  async respondToChallenge(data: RespondToChallengeForm): Promise<Challenge> {
    const response = await fetch(`${this.baseUrl}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to respond to challenge');
    }

    const result: ApiResponse<Challenge> = await response.json();
    return result.data;
  }

  /**
   * Get user's challenges
   */
  async getUserChallenges(type: 'sent' | 'received' | 'all' = 'all'): Promise<Challenge[]> {
    const response = await fetch(`${this.baseUrl}?type=${type}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch challenges');
    }

    const result: ChallengeApiResponse = await response.json();
    return result.data;
  }

  /**
   * Get active challenges (pending or accepted)
   */
  async getActiveChallenges(): Promise<Challenge[]> {
    const response = await fetch(`${this.baseUrl}/active`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch active challenges');
    }

    const result: ChallengeApiResponse = await response.json();
    return result.data;
  }

  /**
   * Cancel a challenge
   */
  async cancelChallenge(challengeId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/${challengeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to cancel challenge');
    }

    return await response.json();
  }

  /**
   * Mark challenge as completed
   */
  async completeChallenge(challengeId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/${challengeId}/complete`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to complete challenge');
    }

    return await response.json();
  }

  /**
   * Get challenge statistics
   */
  async getChallengeStats(): Promise<ChallengeStats> {
    const response = await fetch(`${this.baseUrl}/stats`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch challenge statistics');
    }

    const result: ApiResponse<ChallengeStats> = await response.json();
    return result.data;
  }

  /**
   * Get pending challenges count
   */
  async getPendingChallengesCount(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/pending/count`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch pending challenges count');
    }

    const result: ApiResponse<{ count: number }> = await response.json();
    return result.data.count;
  }

  /**
   * Get challenge by ID
   */
  async getChallengeById(challengeId: string): Promise<Challenge> {
    const response = await fetch(`${this.baseUrl}/${challengeId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch challenge');
    }

    const result: ApiResponse<Challenge> = await response.json();
    return result.data;
  }

  /**
   * Accept a challenge (convenience method)
   */
  async acceptChallenge(challengeId: string): Promise<Challenge> {
    return this.respondToChallenge({
      challengeId,
      accept: true
    });
  }

  /**
   * Decline a challenge (convenience method)
   */
  async declineChallenge(challengeId: string): Promise<Challenge> {
    return this.respondToChallenge({
      challengeId,
      accept: false
    });
  }

  /**
   * Create a match challenge (convenience method)
   */
  async createMatchChallenge(challengedId: string, message?: string, sessionId?: string): Promise<Challenge> {
    return this.createChallenge({
      challengedId,
      challengeType: ChallengeType.MATCH,
      message,
      sessionId,
      matchFormat: 'SINGLES',
      scoringSystem: '21_POINT',
      bestOfGames: 3
    });
  }

  /**
   * Create a tournament challenge (convenience method)
   */
  async createTournamentChallenge(challengedId: string, message?: string): Promise<Challenge> {
    return this.createChallenge({
      challengedId,
      challengeType: ChallengeType.TOURNAMENT,
      message,
      matchFormat: 'SINGLES',
      scoringSystem: '21_POINT',
      bestOfGames: 3
    });
  }

  /**
   * Create a practice challenge (convenience method)
   */
  async createPracticeChallenge(challengedId: string, message?: string, sessionId?: string): Promise<Challenge> {
    return this.createChallenge({
      challengedId,
      challengeType: ChallengeType.PRACTICE,
      message,
      sessionId,
      matchFormat: 'SINGLES',
      scoringSystem: '21_POINT',
      bestOfGames: 1
    });
  }
}

export const challengesApi = new ChallengesApiService();