import { ScheduledMatch, CreateScheduledMatchData, UpdateScheduledMatchData, MatchScheduleConflict, MatchReminder, CalendarEvent } from '../types/matchScheduling';
export declare class MatchSchedulingService {
    /**
     * Create a new scheduled match
     */
    static createScheduledMatch(data: CreateScheduledMatchData): Promise<ScheduledMatch>;
    /**
     * Get scheduled matches for a session
     */
    static getScheduledMatchesForSession(sessionId: string): Promise<ScheduledMatch[]>;
    /**
     * Get scheduled matches for a specific player
     */
    static getScheduledMatchesForPlayer(playerId: string): Promise<ScheduledMatch[]>;
    /**
     * Update a scheduled match
     */
    static updateScheduledMatch(matchId: string, data: UpdateScheduledMatchData, updatedBy: string): Promise<ScheduledMatch>;
    /**
     * Cancel a scheduled match
     */
    static cancelScheduledMatch(matchId: string, cancelledBy: string): Promise<ScheduledMatch>;
    /**
     * Check for scheduling conflicts
     */
    static checkScheduleConflicts(data: CreateScheduledMatchData): Promise<MatchScheduleConflict[]>;
    /**
     * Schedule reminders for a match
     */
    private static scheduleReminders;
    /**
     * Cancel reminders for a match
     */
    private static cancelReminders;
    /**
     * Get upcoming matches that need reminders sent
     */
    static getUpcomingReminders(): Promise<MatchReminder[]>;
    /**
     * Mark reminder as sent
     */
    static markReminderSent(reminderId: string): Promise<void>;
    /**
     * Create calendar event for a match
     */
    static createCalendarEvent(matchId: string, calendarId: string, userId: string): Promise<CalendarEvent>;
    /**
     * Get calendar events for a user
     */
    static getCalendarEvents(userId: string): Promise<CalendarEvent[]>;
}
//# sourceMappingURL=matchSchedulingService.d.ts.map