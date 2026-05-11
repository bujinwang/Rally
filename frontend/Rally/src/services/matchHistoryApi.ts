// @ts-nocheck
import { API_BASE_URL } from '../config/api';

export interface MatchRecord {
  id: string;
  gameNumber: number;
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  courtName?: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  team1Score: number;
  team2Score: number;
  winnerTeam?: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface MatchHistoryResponse {
  success: boolean;
  data: {
    matches: MatchRecord[];
    total: number;
    summary: {
      totalMatches: number;
      completedMatches: number;
      inProgressMatches: number;
      cancelledMatches: number;
    };
  };
  message: string;
  timestamp: string;
}

class MatchHistoryApiService {
  /**
   * Get all matches across completed sessions for a device
   */
  async getMatchHistory(params: {
    deviceId: string;
    limit?: number;
    offset?: number;
  }): Promise<MatchHistoryResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('deviceId', params.deviceId);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response = await fetch(
        `${API_BASE_URL}/session-history?${queryParams}&filter=all&sortBy=date`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) throw new Error('Failed to fetch match history');

      const sessionData = await response.json();

      if (!sessionData.success) throw new Error(sessionData.message || 'Error loading history');

      // Flatten games from all sessions into match records
      const sessions = sessionData.data?.sessions || [];
      const allMatches: MatchRecord[] = [];

      sessions.forEach((session: any) => {
        (session.games || []).forEach((game: any) => {
          allMatches.push({
            id: game.id,
            gameNumber: game.gameNumber,
            sessionId: session.id,
            sessionName: session.name,
            sessionDate: session.date,
            courtName: game.courtName,
            team1Player1: game.team1Players?.[0] || '',
            team1Player2: game.team1Players?.[1] || '',
            team2Player1: game.team2Players?.[0] || '',
            team2Player2: game.team2Players?.[1] || '',
            team1Score: game.team1Score,
            team2Score: game.team2Score,
            winnerTeam: game.winnerTeam,
            status: game.winnerTeam ? 'COMPLETED' : 'IN_PROGRESS',
            startTime: game.startTime,
            endTime: game.endTime,
            duration: game.duration ? parseInt(game.duration.replace(/[^\d]/g, '')) || 0 : 0,
          });
        });
      });

      // Sort by date descending (newest first)
      allMatches.sort((a, b) =>
        new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime()
      );

      const summary = {
        totalMatches: allMatches.length,
        completedMatches: allMatches.filter(m => m.status === 'COMPLETED').length,
        inProgressMatches: allMatches.filter(m => m.status === 'IN_PROGRESS').length,
        cancelledMatches: allMatches.filter(m => m.status === 'CANCELLED').length,
      };

      return {
        success: true,
        data: {
          matches: allMatches,
          total: allMatches.length,
          summary,
        },
        message: 'Match history retrieved',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error fetching match history:', error);
      throw error;
    }
  }
}

export const matchHistoryApi = new MatchHistoryApiService();

/**
 * Filter and sort helpers for match data
 */
export const MatchHistoryUtils = {
  filterByPlayer(matches: MatchRecord[], playerName: string): MatchRecord[] {
    if (!playerName.trim()) return matches;
    const q = playerName.toLowerCase();
    return matches.filter(
      m =>
        m.team1Player1.toLowerCase().includes(q) ||
        m.team1Player2.toLowerCase().includes(q) ||
        m.team2Player1.toLowerCase().includes(q) ||
        m.team2Player2.toLowerCase().includes(q)
    );
  },

  filterByDateRange(matches: MatchRecord[], startDate?: Date, endDate?: Date): MatchRecord[] {
    return matches.filter(m => {
      const d = new Date(m.sessionDate);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  },

  filterByStatus(matches: MatchRecord[], status: string): MatchRecord[] {
    if (status === 'all') return matches;
    return matches.filter(m => m.status === status);
  },

  sortMatches(matches: MatchRecord[], sortBy: 'date' | 'score' | 'session'): MatchRecord[] {
    const sorted = [...matches];
    switch (sortBy) {
      case 'date':
        sorted.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
        break;
      case 'score':
        sorted.sort((a, b) => {
          const aTotal = a.team1Score + a.team2Score;
          const bTotal = b.team1Score + b.team2Score;
          return bTotal - aTotal;
        });
        break;
      case 'session':
        sorted.sort((a, b) => a.sessionName.localeCompare(b.sessionName));
        break;
    }
    return sorted;
  },

  getUniquePlayers(matches: MatchRecord[]): string[] {
    const names = new Set<string>();
    matches.forEach(m => {
      if (m.team1Player1) names.add(m.team1Player1);
      if (m.team1Player2) names.add(m.team1Player2);
      if (m.team2Player1) names.add(m.team2Player1);
      if (m.team2Player2) names.add(m.team2Player2);
    });
    return Array.from(names).sort();
  },
};
