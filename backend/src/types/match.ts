import { MvpPlayer, MvpSession } from '@prisma/client';

export interface Match {
  id: string;
  sessionId: string;
  session: MvpSession;
  player1Id: string;
  player1: MvpPlayer;
  player2Id: string;
  player2: MvpPlayer;
  winnerId: string;
  winner: MvpPlayer;
  scoreType: string; // "2-0" or "2-1"
  recordedBy: string;
  recorder: MvpPlayer;
  recordedAt: Date;
  approvedBy?: string;
  approver?: MvpPlayer;
  approvedAt?: Date;
}

export interface CreateMatchInput {
  sessionId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  scoreType: '2-0' | '2-1';
  recordedBy: string;
}

export interface MatchWithPlayers extends Match {
  player1: MvpPlayer;
  player2: MvpPlayer;
  winner: MvpPlayer;
  recorder: MvpPlayer;
  approver?: MvpPlayer;
}

export interface MatchStatistics {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: Match[];
}