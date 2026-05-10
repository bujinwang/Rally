// Match Scheduling Types for Frontend

export interface ScheduledMatch {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: string; // ISO date string
  duration: number; // in minutes
  courtName?: string;
  location?: string;
  player1Id: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  matchType: 'SINGLES' | 'DOUBLES';
  status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export interface MatchReminder {
  id: string;
  matchId: string;
  userId: string;
  reminderType: 'PUSH' | 'EMAIL' | 'SMS';
  minutesBefore: number;
  sent: boolean;
  sentAt?: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  matchId: string;
  userId: string;
  externalEventId?: string;
  calendarProvider: 'GOOGLE' | 'APPLE' | 'OUTLOOK' | 'LOCAL';
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledMatchData {
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: string;
  duration?: number;
  courtName?: string;
  location?: string;
  player1Id: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  matchType: 'SINGLES' | 'DOUBLES';
  notes?: string;
}

export interface UpdateScheduledMatchData {
  title?: string;
  description?: string;
  scheduledAt?: string;
  duration?: number;
  courtName?: string;
  location?: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  status?: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export interface SchedulingConflict {
  type: 'COURT_CONFLICT' | 'PLAYER_CONFLICT' | 'TIME_OVERLAP';
  message: string;
  conflictingMatchId?: string;
  conflictingMatchTitle?: string;
}

export interface MatchSchedulingResponse {
  success: boolean;
  data?: ScheduledMatch;
  conflicts?: SchedulingConflict[];
  error?: string;
}

export interface UpcomingMatchesResponse {
  success: boolean;
  data: ScheduledMatch[];
  total: number;
  error?: string;
}

export interface MatchListFilters {
  status?: ('SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED')[];
  matchType?: ('SINGLES' | 'DOUBLES')[];
  dateRange?: {
    start: string;
    end: string;
  };
  courtName?: string;
  playerId?: string;
}

export interface CalendarSyncOptions {
  provider: 'GOOGLE' | 'APPLE' | 'OUTLOOK';
  calendarId?: string;
  includeReminders: boolean;
  reminderMinutes: number;
}

export interface MatchReminderSettings {
  enabled: boolean;
  pushNotifications: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  defaultReminderMinutes: number;
  customReminders: number[];
}