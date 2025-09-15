import { MvpPlayerRole, MvpPlayerStatus } from '@prisma/client';

export interface PlayerStatistics {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  ranking?: number;
  rankingPoints: number;
  lastMatchDate?: Date;
}

export interface PlayerWithStatistics {
  id: string;
  sessionId: string;
  name: string;
  deviceId?: string;
  role: MvpPlayerRole;
  status: MvpPlayerStatus;
  joinedAt: Date;
  gamesPlayed: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  totalSetsWon: number;
  totalSetsLost: number;
  totalPlayTime: number;
  winRate: number;
  matchWinRate: number;
  averageGameDuration: number;
  // Scoring and Statistics System Fields
  totalMatches: number;
  ranking?: number;
  rankingPoints: number;
  lastMatchDate?: Date;
  // Relations
  player1Matches?: any[];
  player2Matches?: any[];
  winnerMatches?: any[];
  recorderMatches?: any[];
  approverMatches?: any[];
  rankingHistory?: any[];
}

export interface PlayerRanking {
  id: string;
  playerId: string;
  ranking: number;
  rankingPoints: number;
  performanceRating: number;
  changeReason: string;
  matchId?: string;
  previousRanking?: number;
  pointsChange: number;
  recordedAt: Date;
}

export interface CreatePlayerInput {
  sessionId: string;
  name: string;
  deviceId?: string;
  role?: MvpPlayerRole;
}

export interface UpdatePlayerStatisticsInput {
  playerId: string;
  matchResult: 'win' | 'loss';
  scoreType: '2-0' | '2-1';
  matchDate: Date;
}