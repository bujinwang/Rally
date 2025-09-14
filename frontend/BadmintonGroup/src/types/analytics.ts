// Analytics Types for Player Performance and Engagement Tracking

export interface PlayerAnalytics {
  id: string;
  playerId: string;
  playerName?: string;

  // Performance Metrics
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  averageGameDuration: number; // Average game time in minutes
  currentStreak: number; // Current win/loss streak
  bestStreak: number; // Best win streak

  // Skill Progression
  skillRating: number; // Calculated skill rating
  skillChange: number; // Rating change in last 30 days
  rankingPosition?: number; // Current leaderboard position

  // Activity Metrics
  sessionsPlayed: number; // Total sessions participated
  tournamentsEntered: number; // Total tournaments entered
  hoursPlayed: number; // Total hours played

  // Social Metrics
  friendsCount: number; // Number of friends
  challengesSent: number; // Challenges sent
  challengesAccepted: number; // Challenges accepted

  // Achievement Metrics
  achievementsUnlocked: number; // Total achievements earned
  badgesEarned: number; // Total badges earned
  totalPoints: number; // Total achievement points

  // Engagement Metrics
  lastActiveDate?: string;
  daysActive: number; // Days with activity in last 30 days
  notificationsRead: number; // Notifications read
  messagesSent: number; // Messages sent

  // Performance Trends (JSON for flexible storage)
  monthlyStats?: any; // Monthly performance data
  weeklyActivity?: any; // Weekly activity patterns

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface SessionAnalytics {
  id: string;
  sessionId: string;
  sessionName?: string;

  // Session Metrics
  totalPlayers: number;
  totalMatches: number;
  totalGames: number;
  completionRate: number; // Percentage of planned matches completed
  averageMatchDuration: number; // Average match time in minutes

  // Player Engagement
  playerRetentionRate: number; // Players who stayed vs joined
  averagePlayerSkill: number; // Average skill rating of participants

  // Location and Timing
  location?: string;
  scheduledHour?: number; // Hour of day (0-23)
  dayOfWeek?: number; // Day of week (0-6, Sunday=0)

  // Performance Trends
  matchCompletionTime?: any; // Average time to complete matches
  playerSatisfaction?: any; // Player feedback/ratings if available

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface TournamentAnalytics {
  id: string;
  tournamentId: string;
  tournamentName?: string;

  // Tournament Metrics
  totalParticipants: number;
  totalMatches: number;
  totalGames: number;
  completionRate: number; // Tournament completion percentage
  averageMatchDuration: number; // Average match time in minutes

  // Participation Analytics
  registrationRate: number; // Registrations vs capacity
  noShowRate: number; // Players who registered but didn't show
  earlyWithdrawalRate: number; // Players who withdrew before completion

  // Performance Distribution
  skillDistribution?: any; // Distribution of player skill levels
  roundProgression?: any; // How players progressed through rounds
  upsetFrequency: number; // Frequency of upsets (lower seed beating higher)

  // Engagement Metrics
  spectatorCount: number; // If tracking spectators
  socialInteractions: number; // Friend challenges, messages during tournament

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface SystemAnalytics {
  id: string;

  // User Engagement
  totalActiveUsers: number; // Users active in last 30 days
  newUsersToday: number; // New users registered today
  returningUsers: number; // Users who returned after inactivity

  // Session Activity
  totalSessions: number; // Total active sessions
  sessionsCreatedToday: number; // Sessions created today
  averageSessionSize: number; // Average players per session

  // Match Activity
  totalMatchesToday: number; // Matches played today
  averageMatchDuration: number; // Average match duration
  peakHours?: any; // Peak activity hours

  // Tournament Activity
  activeTournaments: number; // Currently active tournaments
  tournamentsCompleted: number; // Tournaments completed this week

  // Social Activity
  friendRequestsSent: number; // Friend requests sent today
  challengesCreated: number; // Challenges created today
  messagesSent: number; // Messages sent today

  // Achievement Activity
  achievementsUnlocked: number; // Achievements unlocked today
  badgesEarned: number; // Badges earned today

  // Technical Metrics
  apiResponseTime: number; // Average API response time
  errorRate: number; // API error rate percentage
  activeConnections: number; // Current active connections

  // Geographic Distribution
  topLocations?: any; // Most popular locations
  userDistribution?: any; // User distribution by region

  // Date tracking
  date: string; // Date for this analytics record
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  skillRating: number;
  winRate: number;
  totalMatches: number;
  currentStreak: number;
}

export interface PerformanceTrend {
  date: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

export interface PlayerPerformanceTrends {
  playerId: string;
  period: string;
  dailyPerformance: PerformanceTrend[];
}

// API Response Types
export interface AnalyticsApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Analytics Dashboard Data
export interface AnalyticsDashboardData {
  playerAnalytics?: PlayerAnalytics;
  leaderboard: LeaderboardEntry[];
  systemAnalytics?: SystemAnalytics;
  performanceTrends?: PlayerPerformanceTrends;
}

// Analytics Filter Options
export interface AnalyticsFilters {
  dateRange?: {
    start: string;
    end: string;
  };
  playerId?: string;
  sessionId?: string;
  tournamentId?: string;
  limit?: number;
  sortBy?: 'skillRating' | 'winRate' | 'totalMatches' | 'currentStreak';
  sortOrder?: 'asc' | 'desc';
}