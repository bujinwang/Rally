import apiService from './apiService';

// Tournament Types
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  tournamentType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' | 'MIXED';
  sportType: string;
  maxPlayers: number;
  minPlayers: number;
  startDate: string;
  endDate?: string;
  registrationDeadline: string;
  venueName?: string;
  venueAddress?: string;
  latitude?: number;
  longitude?: number;
  matchFormat: 'SINGLES' | 'DOUBLES' | 'MIXED';
  scoringSystem: '21_POINT' | '15_POINT' | '11_POINT';
  bestOfGames: number;
  entryFee: number;
  prizePool: number;
  currency: string;
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  organizerName: string;
  organizerEmail?: string;
  organizerPhone?: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'INVITATION_ONLY';
  accessCode?: string;
  skillLevelMin?: string;
  skillLevelMax?: string;
  ageRestriction?: { min?: number; max?: number };
  createdAt: string;
  updatedAt: string;
}

export interface TournamentPlayer {
  id: string;
  tournamentId: string;
  playerName: string;
  email?: string;
  phone?: string;
  deviceId?: string;
  registeredAt: string;
  seed?: number;
  status: 'REGISTERED' | 'CONFIRMED' | 'WITHDRAWN' | 'DISQUALIFIED' | 'ADVANCED' | 'ELIMINATED';
  skillLevel?: string;
  winRate: number;
  totalMatches: number;
  currentRound: number;
  isEliminated: boolean;
  finalRank?: number;
}

export interface TournamentRound {
  id: string;
  tournamentId: string;
  roundNumber: number;
  roundName: string;
  roundType: 'ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' | 'QUALIFICATION';
  matchesRequired: number;
  playersAdvancing?: number;
  startDate?: string;
  endDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  roundId?: string;
  player1Id: string;
  player2Id: string;
  player1: TournamentPlayer;
  player2: TournamentPlayer;
  matchNumber: number;
  courtName?: string;
  scheduledAt?: string;
  bestOfGames: number;
  scoringSystem: '21_POINT' | '15_POINT' | '11_POINT';
  player1GamesWon: number;
  player2GamesWon: number;
  winnerId?: string;
  gameScores?: any[];
  startTime?: string;
  endTime?: string;
  duration?: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'WALKOVER';
}

export interface TournamentStats {
  totalPlayers: number;
  totalMatches: number;
  completedMatches: number;
  totalGames: number;
  totalSets: number;
  currentRound: number;
  tournamentProgress: number;
}

export interface TournamentCreationData {
  name: string;
  description?: string;
  tournamentType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' | 'MIXED';
  maxPlayers: number;
  minPlayers: number;
  startDate: Date;
  endDate?: Date;
  registrationDeadline: Date;
  venueName?: string;
  venueAddress?: string;
  latitude?: number;
  longitude?: number;
  matchFormat: 'SINGLES' | 'DOUBLES' | 'MIXED';
  scoringSystem: '21_POINT' | '15_POINT' | '11_POINT';
  bestOfGames: number;
  entryFee: number;
  prizePool: number;
  currency: string;
  organizerName: string;
  organizerEmail?: string;
  organizerPhone?: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'INVITATION_ONLY';
  accessCode?: string;
  skillLevelMin?: string;
  skillLevelMax?: string;
  ageRestriction?: { min?: number; max?: number };
}

export interface TournamentUpdateData {
  name?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  venueName?: string;
  venueAddress?: string;
  latitude?: number;
  longitude?: number;
  entryFee?: number;
  prizePool?: number;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'INVITATION_ONLY';
  accessCode?: string;
  status?: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface PlayerRegistrationData {
  playerName: string;
  email?: string;
  phone?: string;
  deviceId?: string;
  skillLevel?: string;
}

export interface TournamentFilters {
  status?: string;
  visibility?: string;
  tournamentType?: string;
  skillLevel?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  limit?: number;
  offset?: number;
}

export interface TournamentListResponse {
  tournaments: Tournament[];
  total: number;
  limit: number;
  offset: number;
}

class TournamentApi {
  /**
   * Create a new tournament
   */
  async createTournament(data: TournamentCreationData): Promise<Tournament> {
    try {
      const response = await apiService.post('/tournaments', data);
      return response.data as Tournament;
    } catch (error) {
      console.error('Error creating tournament:', error);
      throw error;
    }
  }

  /**
   * Get tournaments with filtering
   */
  async getTournaments(filters: TournamentFilters = {}): Promise<TournamentListResponse> {
    try {
      const queryParams = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });

      const response = await apiService.get(`/tournaments?${queryParams.toString()}`);
      return response.data as TournamentListResponse;
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      throw error;
    }
  }

  /**
   * Get tournament by ID
   */
  async getTournamentById(id: string): Promise<Tournament> {
    try {
      const response = await apiService.get(`/tournaments/${id}`);
      return response.data as Tournament;
    } catch (error) {
      console.error('Error fetching tournament:', error);
      throw error;
    }
  }

  /**
   * Update tournament
   */
  async updateTournament(id: string, data: TournamentUpdateData): Promise<Tournament> {
    try {
      const response = await apiService.put(`/tournaments/${id}`, data);
      return response.data as Tournament;
    } catch (error) {
      console.error('Error updating tournament:', error);
      throw error;
    }
  }

  /**
   * Delete tournament
   */
  async deleteTournament(id: string): Promise<void> {
    try {
      await apiService.delete(`/tournaments/${id}`);
    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw error;
    }
  }

  /**
   * Register player for tournament
   */
  async registerPlayer(tournamentId: string, data: PlayerRegistrationData): Promise<TournamentPlayer> {
    try {
      const response = await apiService.post(`/tournaments/${tournamentId}/register`, data);
      return response.data as TournamentPlayer;
    } catch (error) {
      console.error('Error registering player:', error);
      throw error;
    }
  }

  /**
   * Unregister player from tournament
   */
  async unregisterPlayer(tournamentId: string, playerId: string): Promise<void> {
    try {
      await apiService.delete(`/tournaments/${tournamentId}/players/${playerId}`);
    } catch (error) {
      console.error('Error unregistering player:', error);
      throw error;
    }
  }

  /**
   * Start tournament
   */
  async startTournament(tournamentId: string): Promise<void> {
    try {
      await apiService.post(`/tournaments/${tournamentId}/start`);
    } catch (error) {
      console.error('Error starting tournament:', error);
      throw error;
    }
  }

  /**
   * Get tournament statistics
   */
  async getTournamentStats(tournamentId: string): Promise<TournamentStats> {
    try {
      const response = await apiService.get(`/tournaments/${tournamentId}/stats`);
      return response.data as TournamentStats;
    } catch (error) {
      console.error('Error fetching tournament stats:', error);
      throw error;
    }
  }

  /**
   * Get nearby tournaments
   */
  async getNearbyTournaments(latitude: number, longitude: number, radius: number = 50): Promise<TournamentListResponse> {
    return this.getTournaments({
      latitude,
      longitude,
      radius,
      visibility: 'PUBLIC',
      status: 'REGISTRATION_OPEN',
    });
  }

  /**
   * Get tournaments by skill level
   */
  async getTournamentsBySkillLevel(skillLevel: string): Promise<TournamentListResponse> {
    return this.getTournaments({
      skillLevel,
      visibility: 'PUBLIC',
      status: 'REGISTRATION_OPEN',
    });
  }

  /**
   * Get upcoming tournaments
   */
  async getUpcomingTournaments(limit: number = 10): Promise<TournamentListResponse> {
    return this.getTournaments({
      status: 'REGISTRATION_OPEN',
      visibility: 'PUBLIC',
      limit,
      offset: 0,
    });
  }
}

// Export singleton instance
export const tournamentApi = new TournamentApi();
export default tournamentApi;