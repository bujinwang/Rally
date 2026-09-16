import apiService from './apiService';
import { authFetch } from './authFetch';
import DeviceService from './deviceService';
import { API_BASE_URL } from '../config/api';

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

// ---------------------------------------------------------------------------
// Story 6.7 — Bracket Management types
//
// These mirror the canonical domain shape returned by
// `GET /tournaments/:id/bracket` (see `backend/src/services/bracket/types.ts`).
// Slot nullability is meaningful: a `PENDING` placeholder has both slots
// `null`; a `BYE` has exactly one real player and its `winnerId` is already
// set (auto-advanced). A bye is therefore *not* the same thing as an unplayed
// match and the UI renders the two differently.
// ---------------------------------------------------------------------------

/** Which sub-bracket a round/match belongs to. */
export type BracketSide = 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

/**
 * Lifecycle state of a bracket match. A superset of the database enum that adds
 * the domain-only `PENDING` (future-round placeholder) and `BYE` states.
 */
export type BracketMatchStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WALKOVER'
  | 'BYE';

/** A single match inside a bracket. */
export interface BracketMatch {
  id: string;
  /** 1-based round number within the whole bracket. */
  round: number;
  /** 1-based match number within its round. */
  match: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: BracketMatchStatus;
  feedMatch1Id: string | null;
  feedMatch2Id: string | null;
  /** Sub-bracket membership. Defaults to `WINNERS` when omitted. */
  bracket?: BracketSide;
  /** Denormalised display names (presentation convenience only). */
  player1Name?: string;
  player2Name?: string;
  winnerName?: string;
  /** Free-text score line, when known. */
  score?: string;
  court?: string;
  scheduledTime?: string;
  /** Set when the result was corrected (AC 12 audit trail). */
  correctedAt?: string | null;
  correctionReason?: string | null;
}

/** A fully-structured bracket, as returned by the API. */
export interface TournamentBracket {
  tournamentId: string;
  totalRounds: number;
  totalPlayers: number;
  /** Matches grouped by round; index 0 is round 1. */
  bracket: BracketMatch[][];
  currentRound: number;
  isComplete: boolean;
  format: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS' | 'MIXED';
  /** Total match nodes, including bye matches. */
  totalMatches: number;
  /** Ids of first-round bye recipients, highest seed first. */
  byePlayers: string[];
}

/** One row of `GET /tournaments/:id/standings`. */
export interface StandingsEntry {
  playerId: string;
  playerName: string;
  rank: number;
  seed?: number | null;
  winRate: number;
  totalMatches: number;
  isEliminated: boolean;
  status: string;
}

/** Outcome of `POST /tournaments/:id/matches/:matchId/correct` (AC 12). */
export interface CorrectionResult {
  matchId: string;
  previousWinnerId: string | null;
  winnerId: string;
  reason: string;
  cascade: boolean;
  recomputed: boolean;
  clearedDownstreamMatchIds: string[];
}

/**
 * One entry of {@link TournamentAnalytics.rankingChanges}.
 *
 * `finalRank` is nullable because it is backed by `TournamentPlayer.finalRank`,
 * which is unset until the tournament finishes. The UI renders it as text, so a
 * null is displayed as blank rather than crashing.
 */
export interface TournamentRankingChange {
  playerId: string;
  finalRank: number | null;
  wins: number;
  totalMatches: number;
  winRate: number;
  pointsGained: number;
}

/**
 * Computed analytics for a tournament — `GET /tournaments/:id/analytics`.
 *
 * Mirrors the merge performed by the backend route: the spread of
 * `TournamentAnalyticsService.calculateParticipationMetrics` and
 * `calculateBracketEfficiency`, plus `trackPlayerRankingChanges`.
 *
 * Story 6.11: this replaced an earlier screen-local type that expected the same
 * shape but was fed by `/tournaments/:id/stats`, whose payload overlaps it on
 * only two of eight fields.
 */
export interface TournamentAnalytics {
  totalRegistered: number;
  participationRate: number;
  completionRate: number;
  noShowRate: number;
  matchesCompleted: number;
  totalMatches: number;
  completedMatches: number;
  bracketEfficiency: number;
  averageUpsets: number;
  rankingChanges: TournamentRankingChange[];
  timestamp: string;
}

/**
 * A bracket-domain failure surfaced from the backend's standard error envelope
 * (`{ success: false, error: { code, message } }`).
 *
 * The `code` is preserved verbatim so callers can distinguish the cases that
 * matter to the UI: `FORBIDDEN` (403, not the organizer),
 * `BRACKET_GENERATION_FAILED` (400, e.g. an unsupported non-power-of-two
 * double-elimination field) and `BRACKET_NOT_FOUND` (404, no bracket yet).
 */
export class TournamentApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'TournamentApiError';
    this.code = code;
    this.status = status;
  }
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

  // -------------------------------------------------------------------------
  // Story 6.7 — Bracket Management API
  // -------------------------------------------------------------------------

  /**
   * Perform a bracket request, always attaching the caller's device id as the
   * `x-device-id` header.
   *
   * Why a dedicated path (rather than the shared `apiService` helpers): the
   * bracket *mutation* endpoints are guarded by `requireTournamentOrganizer`,
   * which — for an anonymous caller — authorizes **only** when
   * `deviceId === tournament.organizerDeviceId`, read from `req.body.deviceId`
   * or the `x-device-id` header. `apiService` uses `authFetch` (which attaches
   * the stored token only when present) and offers no way to add a custom
   * header, so a **logged-out device-based organizer would otherwise send no
   * identity at all and get 403 on their own tournament**. Attaching the header
   * here fixes that while leaving the logged-in path untouched: `authFetch`
   * still attaches the bearer token when one is stored, and the guard decides
   * solely by `userId` in that case (the header is simply ignored).
   *
   * Throws {@link TournamentApiError} carrying the backend `error.code` and the
   * HTTP status so callers can surface 403/400/404 meaningfully instead of a
   * generic failure.
   */
  private async bracketRequest<T>(
    endpoint: string,
    init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
  ): Promise<T> {
    const deviceId = await DeviceService.getDeviceId();
    const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    const body: any = await response.json().catch(() => ({}));
    const errorField = body?.error;
    const isErrorEnvelope = body?.success === false;

    if (!response.ok || isErrorEnvelope) {
      const code =
        (typeof errorField === 'object' && errorField?.code) || `HTTP_${response.status}`;
      const message =
        typeof errorField === 'string'
          ? errorField
          : errorField?.message || `HTTP ${response.status}`;
      throw new TournamentApiError(String(code), response.status, String(message));
    }

    return body as T;
  }

  /**
   * Fetch the persisted (projected) bracket for a tournament.
   *
   * Returns `null` when no bracket exists yet (the backend answers 404
   * `BRACKET_NOT_FOUND`) so the caller can render a sensible empty state rather
   * than an error. Every other failure propagates as a {@link TournamentApiError}.
   */
  async getBracket(tournamentId: string): Promise<TournamentBracket | null> {
    try {
      const body = await this.bracketRequest<{ data: { bracket: TournamentBracket } }>(
        `/tournaments/${tournamentId}/bracket`,
        { method: 'GET' },
      );
      return body?.data?.bracket ?? null;
    } catch (error) {
      if (error instanceof TournamentApiError && error.code === 'BRACKET_NOT_FOUND') {
        return null;
      }
      console.error('Error fetching bracket:', error);
      throw error;
    }
  }

  /**
   * Generate and persist the tournament bracket (idempotent server-side).
   *
   * Organizer-guarded. Surfaces `BRACKET_GENERATION_FAILED` (e.g. an
   * unsupported non-power-of-two double-elimination field) and `FORBIDDEN`
   * (not the organizer) as a {@link TournamentApiError}.
   */
  async generateBracket(tournamentId: string): Promise<TournamentBracket> {
    try {
      const body = await this.bracketRequest<{ data: { bracket: TournamentBracket } }>(
        `/tournaments/${tournamentId}/bracket/generate`,
        { method: 'POST' },
      );
      return body.data.bracket;
    } catch (error) {
      console.error('Error generating bracket:', error);
      throw error;
    }
  }

  /**
   * Record a match result and advance the bracket. Organizer-guarded.
   *
   * `winnerId` must be one of the match's two current occupants.
   */
  async recordResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    score?: string,
  ): Promise<void> {
    try {
      await this.bracketRequest(`/tournaments/${tournamentId}/matches/${matchId}/result`, {
        method: 'POST',
        body: score ? { winnerId, score } : { winnerId },
      });
    } catch (error) {
      console.error('Error recording result:', error);
      throw error;
    }
  }

  /**
   * Correct a recorded result and self-heal the bracket (AC 12).
   * Organizer-guarded.
   *
   * When a downstream match is already completed the backend refuses unless
   * `cascade` is `true` (it then voids the downstream results and re-projects).
   */
  async correctResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    reason: string,
    cascade: boolean = false,
  ): Promise<CorrectionResult> {
    try {
      const body = await this.bracketRequest<{ data: CorrectionResult }>(
        `/tournaments/${tournamentId}/matches/${matchId}/correct`,
        { method: 'POST', body: { winnerId, reason, cascade } },
      );
      return body.data;
    } catch (error) {
      console.error('Error correcting result:', error);
      throw error;
    }
  }

  /**
   * Fetch the tournament standings (derived from persisted players). Public.
   */
  async getStandings(tournamentId: string): Promise<StandingsEntry[]> {
    try {
      const body = await this.bracketRequest<{ data: { standings: StandingsEntry[] } }>(
        `/tournaments/${tournamentId}/standings`,
        { method: 'GET' },
      );
      return body?.data?.standings ?? [];
    } catch (error) {
      console.error('Error fetching standings:', error);
      throw error;
    }
  }

  /**
   * Fetch computed analytics for a tournament (Story 6.11).
   *
   * `GET /tournaments/:id/analytics`. A PUBLIC tournament is readable by anyone;
   * a non-public one only by its organizer. It therefore goes through
   * `bracketRequest` like the other bracket calls — that path attaches
   * `x-device-id`, so a logged-out, device-based organizer is recognised by the
   * backend's ownership check.
   *
   * Throws {@link TournamentApiError} carrying `TOURNAMENT_NOT_FOUND` when the
   * tournament does not exist or is not visible to the caller.
   */
  async getTournamentAnalytics(tournamentId: string): Promise<TournamentAnalytics> {
    try {
      const body = await this.bracketRequest<{ data: TournamentAnalytics }>(
        `/tournaments/${tournamentId}/analytics`,
        { method: 'GET' },
      );
      return body.data;
    } catch (error) {
      console.error('Error fetching tournament analytics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const tournamentApi = new TournamentApi();
export default tournamentApi;