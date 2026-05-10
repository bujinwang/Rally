import { API_BASE_URL } from '../config/api';

export interface MatchResult {
  id: string;
  sessionId: string;
  player1: {
    id: string;
    name: string;
  };
  player2: {
    id: string;
    name: string;
  };
  winner: {
    id: string;
    name: string;
  };
  scoreType: '2-0' | '2-1';
  recordedAt: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export interface MatchSubmission {
  sessionId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  scoreType: '2-0' | '2-1';
  deviceId: string;
}

export interface MatchApproval {
  deviceId: string;
}

export interface MatchStatistics {
  [playerId: string]: {
    id: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
  };
}

class MatchesApiService {
  private getAuthHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  // Record a new match result
  async recordMatch(matchData: MatchSubmission): Promise<{
    success: boolean;
    data: {
      match: MatchResult;
      requiresApproval: boolean;
      message: string;
    };
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/matches`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(matchData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to record match');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error recording match:', error);
      throw error;
    }
  }

  // Approve a match (organizer only)
  async approveMatch(matchId: string, approvalData: MatchApproval): Promise<{
    success: boolean;
    data: {
      match: MatchResult;
      message: string;
    };
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/matches/${matchId}/approve`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(approvalData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to approve match');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error approving match:', error);
      throw error;
    }
  }

  // Get matches for a session
  async getSessionMatches(sessionId: string, deviceId: string): Promise<{
    success: boolean;
    data: {
      matches: MatchResult[];
      total: number;
    };
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/matches/session/${sessionId}?deviceId=${encodeURIComponent(deviceId)}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch session matches');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching session matches:', error);
      throw error;
    }
  }

  // Real-time event listeners
  private listeners: { [event: string]: ((data: any) => void)[] } = {};

  addMatchListener(event: 'match_recorded' | 'match_approved', callback: (data: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return cleanup function
    return () => {
      const index = this.listeners[event].indexOf(callback);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    };
  }

  // Internal method to notify listeners (called by socket service)
  notifyListeners(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in match listener for ${event}:`, error);
        }
      });
    }
  }

  // Get match statistics for players
  getMatchStatistics(matches: MatchResult[]): MatchStatistics {
    const stats: MatchStatistics = {};

    matches.forEach(match => {
      // Initialize player stats if not exists
      if (!stats[match.player1.id]) {
        stats[match.player1.id] = {
          id: match.player1.id,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0
        };
      }
      if (!stats[match.player2.id]) {
        stats[match.player2.id] = {
          id: match.player2.id,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0
        };
      }

      // Update match counts
      stats[match.player1.id].matchesPlayed++;
      stats[match.player2.id].matchesPlayed++;

      // Update wins/losses
      if (match.winner.id === match.player1.id) {
        stats[match.player1.id].wins++;
        stats[match.player2.id].losses++;
      } else {
        stats[match.player2.id].wins++;
        stats[match.player1.id].losses++;
      }
    });

    // Calculate win rates
    Object.values(stats).forEach(playerStats => {
      playerStats.winRate = playerStats.matchesPlayed > 0
        ? Math.round((playerStats.wins / playerStats.matchesPlayed) * 100)
        : 0;
    });

    return stats;
  }
}

export const matchesApi = new MatchesApiService();