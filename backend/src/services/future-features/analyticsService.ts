import { DatabaseUtils } from '../utils/databaseUtils';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AnalyticsService {
  /**
   * Calculate and update player analytics for a specific player
   */
  static async updatePlayerAnalytics(playerId: string): Promise<void> {
    try {
      // Get all match data for the player
      const matchesQuery = `
        SELECT m.*, p1.name as player1_name, p2.name as player2_name, w.name as winner_name
        FROM matches m
        LEFT JOIN mvp_players p1 ON m.player1_id = p1.id
        LEFT JOIN mvp_players p2 ON m.player2_id = p2.id
        LEFT JOIN mvp_players w ON m.winner_id = w.id
        WHERE m.player1_id = $1 OR m.player2_id = $1
        ORDER BY m.recorded_at DESC
      `;
      const matches = await DatabaseUtils.executeRawQuery(matchesQuery, [playerId]);

      // Calculate basic stats
      const totalMatches = matches.length;
      const wins = matches.filter((match: any) => match.winner_id === playerId).length;
      const losses = totalMatches - wins;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

      // Get session participation
      const sessionsQuery = `
        SELECT COUNT(*) as count FROM mvp_players
        WHERE id = $1 AND status = 'ACTIVE'
      `;
      const sessionsResult = await DatabaseUtils.executeRawQuery(sessionsQuery, [playerId]);
      const sessionsPlayed = parseInt(sessionsResult[0].count) || 0;

      // Get player name for tournament queries
      const playerNameQuery = `SELECT name FROM mvp_players WHERE id = $1`;
      const playerNameResult = await DatabaseUtils.executeRawQuery(playerNameQuery, [playerId]);
      const playerName = playerNameResult[0]?.name || 'Unknown';

      // Get tournament participation
      const tournamentsQuery = `
        SELECT COUNT(*) as count FROM tournament_players
        WHERE player_name = $1
      `;
      const tournamentsResult = await DatabaseUtils.executeRawQuery(tournamentsQuery, [playerName]);
      const tournamentsEntered = parseInt(tournamentsResult[0].count) || 0;

      // Get social metrics
      const friendsQuery = `
        SELECT COUNT(*) as count FROM friends
        WHERE (player_id = $1 OR friend_id = $1) AND status = 'ACCEPTED'
      `;
      const friendsResult = await DatabaseUtils.executeRawQuery(friendsQuery, [playerId]);
      const friendsCount = parseInt(friendsResult[0].count) || 0;

      const challengesSentQuery = `
        SELECT COUNT(*) as count FROM challenges WHERE challenger_id = $1
      `;
      const challengesSentResult = await DatabaseUtils.executeRawQuery(challengesSentQuery, [playerId]);
      const challengesSent = parseInt(challengesSentResult[0].count) || 0;

      const challengesAcceptedQuery = `
        SELECT COUNT(*) as count FROM challenges
        WHERE challenged_id = $1 AND status = 'ACCEPTED'
      `;
      const challengesAcceptedResult = await DatabaseUtils.executeRawQuery(challengesAcceptedQuery, [playerId]);
      const challengesAccepted = parseInt(challengesAcceptedResult[0].count) || 0;

      // Get achievement metrics
      const achievementsQuery = `
        SELECT COUNT(*) as count FROM player_achievements
        WHERE player_id = $1 AND is_completed = true
      `;
      const achievementsResult = await DatabaseUtils.executeRawQuery(achievementsQuery, [playerId]);
      const achievementsUnlocked = parseInt(achievementsResult[0].count) || 0;

      const badgesQuery = `
        SELECT COUNT(*) as count FROM player_badges WHERE player_id = $1
      `;
      const badgesResult = await DatabaseUtils.executeRawQuery(badgesQuery, [playerId]);
      const badgesEarned = parseInt(badgesResult[0].count) || 0;

      const totalPointsQuery = `
        SELECT COALESCE(SUM(progress), 0) as total FROM player_achievements
        WHERE player_id = $1 AND is_completed = true
      `;
      const totalPointsResult = await DatabaseUtils.executeRawQuery(totalPointsQuery, [playerId]);
      const totalPoints = parseInt(totalPointsResult[0].total) || 0;

      // Calculate skill rating (simple ELO-like system)
      const skillRating = this.calculateSkillRating(matches, playerId);

      // Calculate current streak
      const currentStreak = this.calculateCurrentStreak(matches, playerId);

      // Get best streak
      const bestStreak = await this.getBestStreak(playerId);

      // Calculate average game duration
      const averageGameDuration = await this.calculateAverageGameDuration(playerId);

      // Calculate hours played
      const hoursPlayed = await this.calculateHoursPlayed(playerId);

      // Get engagement metrics
      const notificationsReadQuery = `
        SELECT COUNT(*) as count FROM notifications
        WHERE player_id = $1 AND is_read = true
      `;
      const notificationsResult = await DatabaseUtils.executeRawQuery(notificationsReadQuery, [playerId]);
      const notificationsRead = parseInt(notificationsResult[0].count) || 0;

      const messagesQuery = `
        SELECT COUNT(*) as count FROM messages WHERE sender_id = $1
      `;
      const messagesResult = await DatabaseUtils.executeRawQuery(messagesQuery, [playerId]);
      const messagesSent = parseInt(messagesResult[0].count) || 0;

      // Update or create analytics record using raw SQL
      const upsertQuery = `
        INSERT INTO player_analytics (
          player_id, total_matches, total_wins, total_losses, win_rate,
          sessions_played, tournaments_entered, friends_count, challenges_sent,
          challenges_accepted, achievements_unlocked, badges_earned, total_points,
          skill_rating, current_streak, best_streak, average_game_duration,
          hours_played, notifications_read, messages_sent, last_active_date,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, NOW(), NOW()
        )
        ON CONFLICT (player_id)
        DO UPDATE SET
          total_matches = EXCLUDED.total_matches,
          total_wins = EXCLUDED.total_wins,
          total_losses = EXCLUDED.total_losses,
          win_rate = EXCLUDED.win_rate,
          sessions_played = EXCLUDED.sessions_played,
          tournaments_entered = EXCLUDED.tournaments_entered,
          friends_count = EXCLUDED.friends_count,
          challenges_sent = EXCLUDED.challenges_sent,
          challenges_accepted = EXCLUDED.challenges_accepted,
          achievements_unlocked = EXCLUDED.achievements_unlocked,
          badges_earned = EXCLUDED.badges_earned,
          total_points = EXCLUDED.total_points,
          skill_rating = EXCLUDED.skill_rating,
          current_streak = EXCLUDED.current_streak,
          best_streak = EXCLUDED.best_streak,
          average_game_duration = EXCLUDED.average_game_duration,
          hours_played = EXCLUDED.hours_played,
          notifications_read = EXCLUDED.notifications_read,
          messages_sent = EXCLUDED.messages_sent,
          last_active_date = EXCLUDED.last_active_date,
          updated_at = NOW()
      `;

      await DatabaseUtils.executeRawQuery(upsertQuery, [
        playerId, totalMatches, wins, losses, winRate, sessionsPlayed, tournamentsEntered,
        friendsCount, challengesSent, challengesAccepted, achievementsUnlocked, badgesEarned,
        totalPoints, skillRating, currentStreak, bestStreak, averageGameDuration, hoursPlayed,
        notificationsRead, messagesSent, new Date()
      ]);

    } catch (error) {
      console.error('Error updating player analytics:', error);
      throw new Error('Failed to update player analytics');
    }
  }

  /**
   * Calculate and update session analytics
   */
  static async updateSessionAnalytics(sessionId: string): Promise<void> {
    try {
      // Get session data with related information
      const sessionQuery = `
        SELECT s.*, COUNT(DISTINCT p.id) as total_players, COUNT(DISTINCT g.id) as total_games
        FROM mvp_sessions s
        LEFT JOIN mvp_players p ON s.id = p.session_id
        LEFT JOIN mvp_games g ON s.id = g.session_id
        WHERE s.id = $1
        GROUP BY s.id
      `;
      const sessionResult = await DatabaseUtils.executeRawQuery(sessionQuery, [sessionId]);

      if (sessionResult.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult[0];
      const totalPlayers = parseInt(session.total_players) || 0;
      const totalGames = parseInt(session.total_games) || 0;

      // Get match data
      const matchesQuery = `
        SELECT m.*, COUNT(DISTINCT g.id) as total_games
        FROM mvp_matches m
        LEFT JOIN mvp_games g ON m.id = g.match_id
        WHERE m.session_id = $1
        GROUP BY m.id
      `;
      const matches = await DatabaseUtils.executeRawQuery(matchesQuery, [sessionId]);
      const totalMatches = matches.length;

      // Calculate completion rate
      const completedMatches = matches.filter((match: any) => match.status === 'COMPLETED').length;
      const completionRate = totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;

      // Calculate average match duration
      const matchDurations = matches
        .filter((match: any) => match.start_time && match.end_time)
        .map((match: any) => {
          const duration = new Date(match.end_time).getTime() - new Date(match.start_time).getTime();
          return duration / (1000 * 60); // Convert to minutes
        });

      const averageMatchDuration = matchDurations.length > 0
        ? matchDurations.reduce((sum: number, duration: number) => sum + duration, 0) / matchDurations.length
        : 0;

      // Calculate player retention rate
      const activePlayersQuery = `
        SELECT COUNT(*) as count FROM mvp_players
        WHERE session_id = $1 AND status = 'ACTIVE'
      `;
      const activePlayersResult = await DatabaseUtils.executeRawQuery(activePlayersQuery, [sessionId]);
      const activePlayers = parseInt(activePlayersResult[0].count) || 0;
      const playerRetentionRate = totalPlayers > 0 ? (activePlayers / totalPlayers) * 100 : 0;

      // Extract timing information
      const scheduledAt = new Date(session.scheduled_at);
      const scheduledHour = scheduledAt.getHours();
      const dayOfWeek = scheduledAt.getDay();

      // Update or create analytics record
      const upsertQuery = `
        INSERT INTO session_analytics (
          session_id, total_players, total_matches, total_games, completion_rate,
          average_match_duration, player_retention_rate, location, scheduled_hour,
          day_of_week, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        )
        ON CONFLICT (session_id)
        DO UPDATE SET
          total_players = EXCLUDED.total_players,
          total_matches = EXCLUDED.total_matches,
          total_games = EXCLUDED.total_games,
          completion_rate = EXCLUDED.completion_rate,
          average_match_duration = EXCLUDED.average_match_duration,
          player_retention_rate = EXCLUDED.player_retention_rate,
          location = EXCLUDED.location,
          scheduled_hour = EXCLUDED.scheduled_hour,
          day_of_week = EXCLUDED.day_of_week,
          updated_at = NOW()
      `;

      await DatabaseUtils.executeRawQuery(upsertQuery, [
        sessionId, totalPlayers, totalMatches, totalGames, completionRate,
        averageMatchDuration, playerRetentionRate, session.location,
        scheduledHour, dayOfWeek
      ]);

    } catch (error) {
      console.error('Error updating session analytics:', error);
      throw new Error('Failed to update session analytics');
    }
  }

  /**
   * Calculate and update tournament analytics
   */
  static async updateTournamentAnalytics(tournamentId: string): Promise<void> {
    try {
      // Get tournament data with related information
      const tournamentQuery = `
        SELECT t.*, COUNT(DISTINCT tp.id) as total_participants
        FROM tournaments t
        LEFT JOIN tournament_players tp ON t.id = tp.tournament_id
        WHERE t.id = $1
        GROUP BY t.id
      `;
      const tournamentResult = await DatabaseUtils.executeRawQuery(tournamentQuery, [tournamentId]);

      if (tournamentResult.length === 0) {
        throw new Error('Tournament not found');
      }

      const tournament = tournamentResult[0];
      const totalParticipants = parseInt(tournament.total_participants) || 0;

      // Get match data
      const matchesQuery = `
        SELECT tm.*, COUNT(DISTINCT tg.id) as total_games
        FROM tournament_matches tm
        LEFT JOIN tournament_games tg ON tm.id = tg.match_id
        WHERE tm.tournament_id = $1
        GROUP BY tm.id
      `;
      const matches = await DatabaseUtils.executeRawQuery(matchesQuery, [tournamentId]);
      const totalMatches = matches.length;

      // Calculate completion rate
      const completedMatches = matches.filter((match: any) => match.status === 'COMPLETED').length;
      const completionRate = totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;

      // Calculate average match duration
      const matchDurations = matches
        .filter((match: any) => match.start_time && match.end_time)
        .map((match: any) => {
          const duration = new Date(match.end_time).getTime() - new Date(match.start_time).getTime();
          return duration / (1000 * 60); // Convert to minutes
        });

      const averageMatchDuration = matchDurations.length > 0
        ? matchDurations.reduce((sum: number, duration: number) => sum + duration, 0) / matchDurations.length
        : 0;

      // Calculate registration rate
      const maxPlayers = tournament.max_players;
      const registrationRate = maxPlayers > 0 ? (totalParticipants / maxPlayers) * 100 : 0;

      // Calculate no-show rate
      const confirmedPlayersQuery = `
        SELECT COUNT(*) as count FROM tournament_players
        WHERE tournament_id = $1 AND status = 'CONFIRMED'
      `;
      const confirmedPlayersResult = await DatabaseUtils.executeRawQuery(confirmedPlayersQuery, [tournamentId]);
      const confirmedPlayers = parseInt(confirmedPlayersResult[0].count) || 0;

      const activePlayersQuery = `
        SELECT COUNT(*) as count FROM tournament_players
        WHERE tournament_id = $1 AND status != 'WITHDRAWN'
      `;
      const activePlayersResult = await DatabaseUtils.executeRawQuery(activePlayersQuery, [tournamentId]);
      const activePlayers = parseInt(activePlayersResult[0].count) || 0;

      const noShowRate = confirmedPlayers > 0
        ? ((confirmedPlayers - activePlayers) / confirmedPlayers) * 100
        : 0;

      // Update or create analytics record
      const upsertQuery = `
        INSERT INTO tournament_analytics (
          tournament_id, total_participants, total_matches, completion_rate,
          average_match_duration, registration_rate, no_show_rate,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        )
        ON CONFLICT (tournament_id)
        DO UPDATE SET
          total_participants = EXCLUDED.total_participants,
          total_matches = EXCLUDED.total_matches,
          completion_rate = EXCLUDED.completion_rate,
          average_match_duration = EXCLUDED.average_match_duration,
          registration_rate = EXCLUDED.registration_rate,
          no_show_rate = EXCLUDED.no_show_rate,
          updated_at = NOW()
      `;

      await DatabaseUtils.executeRawQuery(upsertQuery, [
        tournamentId, totalParticipants, totalMatches, completionRate,
        averageMatchDuration, registrationRate, noShowRate
      ]);

    } catch (error) {
      console.error('Error updating tournament analytics:', error);
      throw new Error('Failed to update tournament analytics');
    }
  }

  /**
   * Get session analytics dashboard data
   */
  static async getSessionAnalyticsDashboard(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      } : {};

      // Get session trends over time
      const sessionTrends = await this.getSessionTrends(startDate, endDate, filters);

      // Get participation analysis
      const participationAnalysis = await this.getParticipationAnalysis(startDate, endDate, filters);

      // Get geographic distribution
      const geographicDistribution = await this.getGeographicDistribution(startDate, endDate, filters);

      // Get session type popularity
      const sessionTypeAnalytics = await this.getSessionTypeAnalytics(startDate, endDate, filters);

      // Get peak usage patterns
      const peakUsagePatterns = await this.getPeakUsagePatterns(startDate, endDate, filters);

      return {
        summary: {
          totalSessions: sessionTrends.totalSessions,
          totalPlayers: participationAnalysis.totalUniquePlayers,
          avgAttendance: participationAnalysis.avgAttendance,
          popularTimes: peakUsagePatterns.popularTimes,
          topLocations: geographicDistribution.topLocations
        },
        trends: sessionTrends.data,
        participation: participationAnalysis,
        geography: geographicDistribution,
        sessionTypes: sessionTypeAnalytics,
        peakUsage: peakUsagePatterns,
        generatedAt: new Date()
      };

    } catch (error) {
      console.error('Error getting session analytics dashboard:', error);
      throw new Error('Failed to get session analytics dashboard');
    }
  }

  /**
   * Get session attendance trends over time
   */
  static async getSessionTrends(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? `AND s.created_at >= $1 AND s.created_at <= $2` : '';
      const params = startDate && endDate ? [startDate, endDate] : [];

      const trendsQuery = `
        SELECT
          DATE(s.created_at) as date,
          COUNT(*) as session_count,
          AVG(sa.total_players) as avg_attendance,
          SUM(sa.total_players) as total_players
        FROM mvp_sessions s
        LEFT JOIN session_analytics sa ON s.id = sa.session_id
        WHERE s.status = 'COMPLETED' ${dateFilter}
        GROUP BY DATE(s.created_at)
        ORDER BY DATE(s.created_at)
      `;

      const trends = await DatabaseUtils.executeRawQuery(trendsQuery, params);

      const totalSessions = trends.reduce((sum: number, day: any) => sum + parseInt(day.session_count), 0);

      return {
        totalSessions,
        data: trends.map((day: any) => ({
          date: day.date,
          sessions: parseInt(day.session_count),
          avgAttendance: parseFloat(day.avg_attendance) || 0,
          totalPlayers: parseInt(day.total_players) || 0
        }))
      };

    } catch (error) {
      console.error('Error getting session trends:', error);
      throw new Error('Failed to get session trends');
    }
  }

  /**
   * Get participation analysis
   */
  static async getParticipationAnalysis(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? `AND s.created_at >= $1 AND s.created_at <= $2` : '';
      const params = startDate && endDate ? [startDate, endDate] : [];

      // Get player participation frequency distribution
      const participationQuery = `
        SELECT
          CASE
            WHEN player_sessions = 1 THEN '1 session'
            WHEN player_sessions BETWEEN 2 AND 5 THEN '2-5 sessions'
            WHEN player_sessions BETWEEN 6 AND 10 THEN '6-10 sessions'
            WHEN player_sessions BETWEEN 11 AND 20 THEN '11-20 sessions'
            ELSE '20+ sessions'
          END as frequency_range,
          COUNT(*) as player_count
        FROM (
          SELECT p.id, COUNT(DISTINCT s.id) as player_sessions
          FROM mvp_players p
          JOIN mvp_sessions s ON p.session_id = s.id
          WHERE s.status = 'COMPLETED' ${dateFilter}
          GROUP BY p.id
        ) player_stats
        GROUP BY
          CASE
            WHEN player_sessions = 1 THEN '1 session'
            WHEN player_sessions BETWEEN 2 AND 5 THEN '2-5 sessions'
            WHEN player_sessions BETWEEN 6 AND 10 THEN '6-10 sessions'
            WHEN player_sessions BETWEEN 11 AND 20 THEN '11-20 sessions'
            ELSE '20+ sessions'
          END
        ORDER BY MIN(player_sessions)
      `;

      const participationData = await DatabaseUtils.executeRawQuery(participationQuery, params);

      // Get total unique players
      const uniquePlayersQuery = `
        SELECT COUNT(DISTINCT p.id) as total_unique_players
        FROM mvp_players p
        JOIN mvp_sessions s ON p.session_id = s.id
        WHERE s.status = 'COMPLETED' ${dateFilter}
      `;

      const uniquePlayersResult = await DatabaseUtils.executeRawQuery(uniquePlayersQuery, params);
      const totalUniquePlayers = parseInt(uniquePlayersResult[0].total_unique_players) || 0;

      // Calculate average attendance
      const avgAttendanceQuery = `
        SELECT AVG(sa.total_players) as avg_attendance
        FROM session_analytics sa
        JOIN mvp_sessions s ON sa.session_id = s.id
        WHERE s.status = 'COMPLETED' ${dateFilter}
      `;

      const avgAttendanceResult = await DatabaseUtils.executeRawQuery(avgAttendanceQuery, params);
      const avgAttendance = parseFloat(avgAttendanceResult[0].avg_attendance) || 0;

      return {
        totalUniquePlayers,
        avgAttendance,
        frequencyDistribution: participationData.map((row: any) => ({
          range: row.frequency_range,
          count: parseInt(row.player_count),
          percentage: totalUniquePlayers > 0 ? (parseInt(row.player_count) / totalUniquePlayers) * 100 : 0
        }))
      };

    } catch (error) {
      console.error('Error getting participation analysis:', error);
      throw new Error('Failed to get participation analysis');
    }
  }

  /**
   * Get geographic distribution of sessions and players
   */
  static async getGeographicDistribution(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? `AND s.created_at >= $1 AND s.created_at <= $2` : '';
      const params = startDate && endDate ? [startDate, endDate] : [];

      const geoQuery = `
        SELECT
          COALESCE(sa.aggregated_location, s.location, 'Unknown') as location,
          COUNT(DISTINCT s.id) as session_count,
          SUM(sa.total_players) as total_players,
          AVG(sa.latitude) as avg_lat,
          AVG(sa.longitude) as avg_lng
        FROM mvp_sessions s
        LEFT JOIN session_analytics sa ON s.id = sa.session_id
        WHERE s.status = 'COMPLETED' ${dateFilter}
          AND (sa.aggregated_location IS NOT NULL OR s.location IS NOT NULL)
        GROUP BY COALESCE(sa.aggregated_location, s.location, 'Unknown')
        ORDER BY total_players DESC
        LIMIT 20
      `;

      const geoData = await DatabaseUtils.executeRawQuery(geoQuery, params);

      return {
        topLocations: geoData.map((row: any) => ({
          location: row.location,
          sessions: parseInt(row.session_count),
          players: parseInt(row.total_players) || 0,
          coordinates: row.avg_lat && row.avg_lng ? {
            lat: parseFloat(row.avg_lat),
            lng: parseFloat(row.avg_lng)
          } : null
        }))
      };

    } catch (error) {
      console.error('Error getting geographic distribution:', error);
      throw new Error('Failed to get geographic distribution');
    }
  }

  /**
   * Get session type popularity analytics
   */
  static async getSessionTypeAnalytics(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? `AND s.created_at >= $1 AND s.created_at <= $2` : '';
      const params = startDate && endDate ? [startDate, endDate] : [];

      const typeQuery = `
        SELECT
          COALESCE(sa.session_type, 'casual') as session_type,
          COUNT(*) as session_count,
          AVG(sa.total_players) as avg_players,
          AVG(sa.completion_rate) as avg_completion_rate
        FROM mvp_sessions s
        LEFT JOIN session_analytics sa ON s.id = sa.session_id
        WHERE s.status = 'COMPLETED' ${dateFilter}
        GROUP BY COALESCE(sa.session_type, 'casual')
        ORDER BY session_count DESC
      `;

      const typeData = await DatabaseUtils.executeRawQuery(typeQuery, params);

      return typeData.map((row: any) => ({
        type: row.session_type,
        sessions: parseInt(row.session_count),
        avgPlayers: parseFloat(row.avg_players) || 0,
        avgCompletionRate: parseFloat(row.avg_completion_rate) || 0
      }));

    } catch (error) {
      console.error('Error getting session type analytics:', error);
      throw new Error('Failed to get session type analytics');
    }
  }

  /**
   * Get peak usage patterns
   */
  static async getPeakUsagePatterns(startDate?: Date, endDate?: Date, filters?: any): Promise<any> {
    try {
      const dateFilter = startDate && endDate ? `AND s.created_at >= $1 AND s.created_at <= $2` : '';
      const params = startDate && endDate ? [startDate, endDate] : [];

      const peakHoursQuery = `
        SELECT
          sa.scheduled_hour as hour,
          COUNT(*) as session_count,
          AVG(sa.total_players) as avg_players
        FROM session_analytics sa
        JOIN mvp_sessions s ON sa.session_id = s.id
        WHERE s.status = 'COMPLETED' ${dateFilter}
          AND sa.scheduled_hour IS NOT NULL
        GROUP BY sa.scheduled_hour
        ORDER BY session_count DESC
        LIMIT 5
      `;

      const peakHoursData = await DatabaseUtils.executeRawQuery(peakHoursQuery, params);

      const popularTimes = peakHoursData.map((row: any) => ({
        hour: parseInt(row.hour),
        time: `${row.hour}:00`,
        sessions: parseInt(row.session_count),
        avgPlayers: parseFloat(row.avg_players) || 0
      }));

      return {
        popularTimes,
        peakHour: popularTimes.length > 0 ? popularTimes[0].hour : null
      };

    } catch (error) {
      console.error('Error getting peak usage patterns:', error);
      throw new Error('Failed to get peak usage patterns');
    }
  }

  /**
   * Export analytics data
   */
  static async exportAnalyticsData(startDate?: Date, endDate?: Date, format: 'json' | 'csv' = 'json'): Promise<any> {
    try {
      const dashboardData = await this.getSessionAnalyticsDashboard(startDate, endDate);

      if (format === 'csv') {
        // Convert to CSV format
        return this.convertToCSV(dashboardData);
      }

      return dashboardData;

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      throw new Error('Failed to export analytics data');
    }
  }

  /**
   * Convert analytics data to CSV format with injection protection
   */
  private static convertToCSV(data: any): string {
    // Convert dashboard data to CSV format with CSV injection protection
    let csv = 'Date,Sessions,Avg Attendance,Total Players\n';

    data.trends.forEach((trend: any) => {
      // Sanitize each field to prevent CSV injection attacks
      const sanitizedDate = this.sanitizeCSVField(trend.date);
      const sanitizedSessions = this.sanitizeCSVField(trend.sessions);
      const sanitizedAvgAttendance = this.sanitizeCSVField(trend.avgAttendance);
      const sanitizedTotalPlayers = this.sanitizeCSVField(trend.totalPlayers);

      csv += `${sanitizedDate},${sanitizedSessions},${sanitizedAvgAttendance},${sanitizedTotalPlayers}\n`;
    });

    return csv;
  }

  /**
   * Sanitize CSV field to prevent injection attacks
   */
  private static sanitizeCSVField(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // Check for potential formula injection patterns
    const dangerousPatterns = [
      /^=/,      // Excel formulas
      /^\+/,     // Excel formulas
      /^-/,      // Excel formulas
      /^@/,      // Excel formulas
      /^\t/,     // Tab character that could be used for injection
      /^"/,      // Quote that could be used for injection
      /[\r\n]/,  // Line breaks that could break CSV structure
    ];

    // If value starts with dangerous characters, prefix with single quote to neutralize
    for (const pattern of dangerousPatterns) {
      if (pattern.test(stringValue)) {
        return `'${stringValue}`;
      }
    }

    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Track analytics event
   */
  static async trackAnalyticsEvent(
    type: string,
    entityId: string,
    userId?: string,
    data?: any
  ): Promise<void> {
    try {
      const eventData = {
        type,
        entityId,
        userId,
        data: data || {},
        timestamp: new Date()
      };

      // Insert event (using raw SQL for performance)
      const insertQuery = `
        INSERT INTO analytics_events (type, entity_id, user_id, data, timestamp)
        VALUES ($1, $2, $3, $4, $5)
      `;

      await DatabaseUtils.executeRawQuery(insertQuery, [
        eventData.type,
        eventData.entityId,
        eventData.userId,
        JSON.stringify(eventData.data),
        eventData.timestamp
      ]);

    } catch (error) {
      console.error('Error tracking analytics event:', error);
      // Don't throw error for event tracking failures
    }
  }

  /**
   * Generate system-wide analytics for a specific date
   */
  static async generateSystemAnalytics(date: Date = new Date()): Promise<void> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // User engagement metrics
      const activeUsersQuery = `
        SELECT COUNT(*) as count FROM mvp_players
        WHERE updated_at >= $1
      `;
      const activeUsersResult = await DatabaseUtils.executeRawQuery(activeUsersQuery, [thirtyDaysAgo]);
      const totalActiveUsers = parseInt(activeUsersResult[0].count) || 0;

      // Session activity
      const totalSessionsQuery = `
        SELECT COUNT(*) as count FROM mvp_sessions
        WHERE status = 'ACTIVE'
      `;
      const totalSessionsResult = await DatabaseUtils.executeRawQuery(totalSessionsQuery, []);
      const totalSessions = parseInt(totalSessionsResult[0].count) || 0;

      const sessionsCreatedTodayQuery = `
        SELECT COUNT(*) as count FROM mvp_sessions
        WHERE created_at >= $1 AND created_at <= $2
      `;
      const sessionsCreatedResult = await DatabaseUtils.executeRawQuery(sessionsCreatedTodayQuery, [startOfDay, endOfDay]);
      const sessionsCreatedToday = parseInt(sessionsCreatedResult[0].count) || 0;

      // Match activity
      const matchesTodayQuery = `
        SELECT COUNT(*) as count FROM matches
        WHERE recorded_at >= $1 AND recorded_at <= $2
      `;
      const matchesResult = await DatabaseUtils.executeRawQuery(matchesTodayQuery, [startOfDay, endOfDay]);
      const totalMatchesToday = parseInt(matchesResult[0].count) || 0;

      // Social activity
      const friendRequestsQuery = `
        SELECT COUNT(*) as count FROM friend_requests
        WHERE sent_at >= $1 AND sent_at <= $2
      `;
      const friendRequestsResult = await DatabaseUtils.executeRawQuery(friendRequestsQuery, [startOfDay, endOfDay]);
      const friendRequestsSent = parseInt(friendRequestsResult[0].count) || 0;

      const challengesQuery = `
        SELECT COUNT(*) as count FROM challenges
        WHERE sent_at >= $1 AND sent_at <= $2
      `;
      const challengesResult = await DatabaseUtils.executeRawQuery(challengesQuery, [startOfDay, endOfDay]);
      const challengesCreated = parseInt(challengesResult[0].count) || 0;

      const messagesQuery = `
        SELECT COUNT(*) as count FROM messages
        WHERE sent_at >= $1 AND sent_at <= $2
      `;
      const messagesResult = await DatabaseUtils.executeRawQuery(messagesQuery, [startOfDay, endOfDay]);
      const messagesSent = parseInt(messagesResult[0].count) || 0;

      // Achievement activity
      const achievementsQuery = `
        SELECT COUNT(*) as count FROM player_achievements
        WHERE completed_at >= $1 AND completed_at <= $2
      `;
      const achievementsResult = await DatabaseUtils.executeRawQuery(achievementsQuery, [startOfDay, endOfDay]);
      const achievementsUnlocked = parseInt(achievementsResult[0].count) || 0;

      // Insert or update system analytics
      const upsertQuery = `
        INSERT INTO system_analytics (
          date, total_active_users, total_sessions, sessions_created_today,
          total_matches_today, friend_requests_sent, challenges_created,
          messages_sent, achievements_unlocked
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (date)
        DO UPDATE SET
          total_active_users = EXCLUDED.total_active_users,
          total_sessions = EXCLUDED.total_sessions,
          sessions_created_today = EXCLUDED.sessions_created_today,
          total_matches_today = EXCLUDED.total_matches_today,
          friend_requests_sent = EXCLUDED.friend_requests_sent,
          challenges_created = EXCLUDED.challenges_created,
          messages_sent = EXCLUDED.messages_sent,
          achievements_unlocked = EXCLUDED.achievements_unlocked
      `;

      await DatabaseUtils.executeRawQuery(upsertQuery, [
        startOfDay, totalActiveUsers, totalSessions, sessionsCreatedToday,
        totalMatchesToday, friendRequestsSent, challengesCreated,
        messagesSent, achievementsUnlocked
      ]);

    } catch (error) {
      console.error('Error generating system analytics:', error);
      throw new Error('Failed to generate system analytics');
    }
  }

  /**
   * Get player leaderboard
   */
  static async getPlayerLeaderboard(limit: number = 10): Promise<any[]> {
    try {
      const leaderboardQuery = `
        SELECT pa.*, p.name as player_name
        FROM player_analytics pa
        JOIN mvp_players p ON pa.player_id = p.id
        ORDER BY pa.skill_rating DESC
        LIMIT $1
      `;
      const leaderboard = await DatabaseUtils.executeRawQuery(leaderboardQuery, [limit]);

      return leaderboard.map((entry: any, index: number) => ({
        rank: index + 1,
        playerName: entry.player_name,
        skillRating: parseFloat(entry.skill_rating) || 0,
        winRate: parseFloat(entry.win_rate) || 0,
        totalMatches: parseInt(entry.total_matches) || 0,
        currentStreak: parseInt(entry.current_streak) || 0
      }));

    } catch (error) {
      console.error('Error getting player leaderboard:', error);
      throw new Error('Failed to get player leaderboard');
    }
  }

  /**
   * Get player performance trends
   */
  static async getPlayerPerformanceTrends(playerId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const matches = await prisma.match.findMany({
        where: {
          OR: [
            { player1Id: playerId },
            { player2Id: playerId }
          ],
          recordedAt: {
            gte: startDate
          }
        },
        orderBy: { recordedAt: 'asc' }
      });

      // Calculate daily performance
      const dailyStats = new Map<string, { wins: number; losses: number; total: number }>();

      matches.forEach(match => {
        const date = match.recordedAt.toISOString().split('T')[0];
        const isWin = match.winnerId === playerId;

        if (!dailyStats.has(date)) {
          dailyStats.set(date, { wins: 0, losses: 0, total: 0 });
        }

        const stats = dailyStats.get(date)!;
        if (isWin) {
          stats.wins++;
        } else {
          stats.losses++;
        }
        stats.total++;
      });

      return {
        playerId,
        period: `${days} days`,
        dailyPerformance: Array.from(dailyStats.entries()).map(([date, stats]) => ({
          date,
          wins: stats.wins,
          losses: stats.losses,
          total: stats.total,
          winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0
        }))
      };

    } catch (error) {
      console.error('Error getting player performance trends:', error);
      throw new Error('Failed to get player performance trends');
    }
  }

  // Helper methods

  private static async getPlayerName(playerId: string): Promise<string> {
    const playerQuery = `SELECT name FROM mvp_players WHERE id = $1`;
    const result = await DatabaseUtils.executeRawQuery(playerQuery, [playerId]);
    return result[0]?.name || 'Unknown Player';
  }

  private static calculateSkillRating(matches: any[], playerId: string): number {
    // Simple ELO-like rating system
    let rating = 1000; // Starting rating

    matches.forEach(match => {
      const isWinner = match.winnerId === playerId;
      const kFactor = 32; // K-factor for rating changes

      // Simplified expected score calculation
      const expectedScore = 1 / (1 + Math.pow(10, (1200 - rating) / 400));
      const actualScore = isWinner ? 1 : 0;

      rating += kFactor * (actualScore - expectedScore);
    });

    return Math.max(0, Math.round(rating));
  }

  private static calculateCurrentStreak(matches: any[], playerId: string): number {
    if (matches.length === 0) return 0;

    // Sort matches by date (most recent first)
    const sortedMatches = matches.sort((a, b) =>
      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );

    let streak = 0;
    let currentResult = sortedMatches[0]?.winnerId === playerId;

    for (const match of sortedMatches) {
      const isWin = match.winnerId === playerId;

      if (isWin === currentResult) {
        streak++;
      } else {
        break;
      }
    }

    return currentResult ? streak : -streak;
  }

  private static async getBestStreak(playerId: string): Promise<number> {
    // This would require tracking historical streaks
    // For now, return current streak as best
    const analyticsQuery = `SELECT current_streak FROM player_analytics WHERE player_id = $1`;
    const result = await DatabaseUtils.executeRawQuery(analyticsQuery, [playerId]);

    return Math.abs(parseInt(result[0]?.current_streak) || 0);
  }

  private static async calculateAverageGameDuration(playerId: string): Promise<number> {
    const playerName = await this.getPlayerName(playerId);

    const gamesQuery = `
      SELECT start_time, end_time FROM mvp_games
      WHERE (team1_player1 = $1 OR team1_player2 = $1 OR team2_player1 = $1 OR team2_player2 = $1)
      AND start_time IS NOT NULL AND end_time IS NOT NULL
    `;
    const games = await DatabaseUtils.executeRawQuery(gamesQuery, [playerName]);

    const durations = games
      .filter((game: any) => game.start_time && game.end_time)
      .map((game: any) => {
        const duration = new Date(game.end_time).getTime() - new Date(game.start_time).getTime();
        return duration / (1000 * 60); // Convert to minutes
      });

    return durations.length > 0
      ? durations.reduce((sum: number, duration: number) => sum + duration, 0) / durations.length
      : 0;
  }

  private static async calculateHoursPlayed(playerId: string): Promise<number> {
    const totalDuration = await this.calculateAverageGameDuration(playerId);
    const playerName = await this.getPlayerName(playerId);

    const totalGamesQuery = `
      SELECT COUNT(*) as count FROM mvp_games
      WHERE team1_player1 = $1 OR team1_player2 = $1 OR team2_player1 = $1 OR team2_player2 = $1
    `;
    const result = await DatabaseUtils.executeRawQuery(totalGamesQuery, [playerName]);
    const totalGames = parseInt(result[0].count) || 0;

    return (totalDuration * totalGames) / 60; // Convert to hours
  }
}