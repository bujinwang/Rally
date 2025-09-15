export interface ScheduledMatch {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  duration: number; // in minutes
  location?: string;
  courtName?: string;
  player1Id: string;
  player2Id?: string; // optional for singles/doubles
  player3Id?: string; // for doubles
  player4Id?: string; // for doubles
  matchType: 'SINGLES' | 'DOUBLES';
  status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdBy: string; // deviceId of creator
  createdAt: Date;
  updatedAt: Date;
  reminderSent: boolean;
  calendarEventId?: string; // for calendar integration
}

export interface CreateScheduledMatchData {
  sessionId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  duration?: number;
  location?: string;
  courtName?: string;
  player1Id: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  matchType: 'SINGLES' | 'DOUBLES';
  createdBy: string;
}

export interface UpdateScheduledMatchData {
  title?: string;
  description?: string;
  scheduledAt?: Date;
  duration?: number;
  location?: string;
  courtName?: string;
  player1Id?: string;
  player2Id?: string;
  player3Id?: string;
  player4Id?: string;
  matchType?: 'SINGLES' | 'DOUBLES';
  status?: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface MatchReminder {
  id: string;
  matchId: string;
  userId: string;
  reminderType: 'EMAIL' | 'PUSH' | 'SMS';
  scheduledFor: Date;
  sent: boolean;
  sentAt?: Date;
  createdAt: Date;
}

export interface CalendarEvent {
  id: string;
  matchId: string;
  calendarId: string; // user's calendar ID
  eventId: string; // external calendar event ID
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchScheduleConflict {
  conflictingMatch: ScheduledMatch;
  conflictType: 'OVERLAP' | 'DOUBLE_BOOKING' | 'COURT_CONFLICT';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}