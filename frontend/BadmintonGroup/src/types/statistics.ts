// Statistics Types for Badminton Group App

export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  winStreak: number;
  currentStreak: number;
  averageScore: number;
  totalPointsScored: number;
  totalPointsConceded: number;
  bestWinStreak: number;
  recentForm: string[]; // Last 5 matches: 'W', 'L'
  performanceRating: number;
  ranking: number;
  // Enhanced statistics for detailed scoring
  setsWon: number;
  setsLost: number;
  setWinRate: number;
  averagePointsPerSet: number;
  bestSetScore: number;
  scoringEfficiency: number; // Points won per set
  comebackWins: number; // Matches won after being behind
  dominantWins: number; // Matches won without losing a set
  sessionId?: string; // Optional: statistics for specific session
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  winRate: number;
  matchesPlayed: number;
  performanceRating: number;
  trend: 'up' | 'down' | 'stable';
}

export interface SessionStatistics {
  sessionId: string;
  sessionName: string;
  totalMatches: number;
  totalPlayers: number;
  averageMatchesPerPlayer: number;
  topPerformers: LeaderboardEntry[];
  matchDistribution: {
    singles: number;
    doubles: number;
    mixed: number;
  };
  activityLevel: 'low' | 'medium' | 'high';
  duration: number; // Session duration in hours
}

export interface PlayerComparison {
  players: PlayerStatistics[];
  comparisonMetrics: {
    metric: string;
    values: number[];
    winner: string; // Player ID of the best performer
  }[];
}

export interface PerformanceTrend {
  playerId: string;
  playerName: string;
  period: string; // e.g., "30d", "7d", "all"
  data: {
    date: string;
    winRate: number;
    matchesPlayed: number;
    performanceRating: number;
  }[];
  trend: 'improving' | 'declining' | 'stable';
  averageWinRate: number;
  totalMatches: number;
}

// API Request/Response Types
export interface StatisticsQueryParams {
  sessionId?: string;
  timeRange?: '7d' | '30d' | '90d' | 'all';
  minMatches?: number;
  limit?: number;
}

export interface LeaderboardQueryParams extends StatisticsQueryParams {
  sortBy?: 'rating' | 'winRate' | 'matches';
  order?: 'asc' | 'desc';
}

export interface ComparisonQueryParams {
  playerIds: string[]; // Comma-separated or array
  sessionId?: string;
  timeRange?: '7d' | '30d' | '90d' | 'all';
}

export interface TrendsQueryParams {
  days?: number; // 1-365, default 30
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export type PlayerStatisticsResponse = ApiResponse<PlayerStatistics>;
export type LeaderboardResponse = ApiResponse<LeaderboardEntry[]>;
export type SessionStatisticsResponse = ApiResponse<SessionStatistics>;
export type PlayerComparisonResponse = ApiResponse<PlayerComparison>;
export type PerformanceTrendsResponse = ApiResponse<PerformanceTrend>;

// Score Recording Types
export interface MatchSet {
  setNumber: number;
  player1Score: number;
  player2Score: number;
  winnerId: string;
}

export interface DetailedMatchData {
  sessionId: string;
  player1Id: string;
  player2Id: string;
  sets: MatchSet[];
  scoringSystem: '21_POINT' | '15_POINT' | '11_POINT';
  bestOfGames: 1 | 3 | 5;
  courtName?: string;
}

export interface MatchRecordingState {
  currentSet: number;
  player1Score: number;
  player2Score: number;
  sets: MatchSet[];
  isRecording: boolean;
  matchWinner?: string;
}

// Chart Data Types for Visualization
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface TrendChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
}

// Dashboard State Types
export interface StatisticsDashboardState {
  selectedTimeRange: '7d' | '30d' | '90d' | 'all';
  selectedSessionId?: string;
  selectedPlayerId?: string;
  isLoading: boolean;
  error?: string;
}

// Filter Types
export interface StatisticsFilters {
  timeRange: '7d' | '30d' | '90d' | 'all';
  sessionId?: string;
  minMatches: number;
  sortBy: 'rating' | 'winRate' | 'matches';
  order: 'asc' | 'desc';
}