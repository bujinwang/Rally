import { AnalyticsService } from '../analyticsService';
import { DatabaseUtils } from '../../utils/databaseUtils';

// Mock the DatabaseUtils
jest.mock('../../utils/databaseUtils');
const mockDatabaseUtils = DatabaseUtils as jest.Mocked<typeof DatabaseUtils>;

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSessionAnalyticsDashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const mockDashboardData = {
        summary: {
          totalSessions: 10,
          totalPlayers: 50,
          avgAttendance: 5.0,
          popularTimes: [],
          topLocations: []
        },
        trends: { totalSessions: 10, data: [] },
        participation: { totalUniquePlayers: 50, avgAttendance: 5.0, frequencyDistribution: [] },
        geography: { topLocations: [] },
        sessionTypes: [],
        peakUsage: { popularTimes: [] },
        generatedAt: new Date().toISOString()
      };

      // Mock the internal methods
      jest.spyOn(AnalyticsService, 'getSessionTrends').mockResolvedValue(mockDashboardData.trends);
      jest.spyOn(AnalyticsService, 'getParticipationAnalysis').mockResolvedValue(mockDashboardData.participation);
      jest.spyOn(AnalyticsService, 'getGeographicDistribution').mockResolvedValue(mockDashboardData.geography);
      jest.spyOn(AnalyticsService, 'getSessionTypeAnalytics').mockResolvedValue(mockDashboardData.sessionTypes);
      jest.spyOn(AnalyticsService, 'getPeakUsagePatterns').mockResolvedValue(mockDashboardData.peakUsage);

      const result = await AnalyticsService.getSessionAnalyticsDashboard();

      expect(result.summary.totalSessions).toBe(10);
      expect(result.summary.totalPlayers).toBe(50);
      expect(result.summary.avgAttendance).toBe(5.0);
      expect(result.generatedAt).toBeDefined();
    });

    it('should handle date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      jest.spyOn(AnalyticsService, 'getSessionTrends').mockResolvedValue({ totalSessions: 5, data: [] });
      jest.spyOn(AnalyticsService, 'getParticipationAnalysis').mockResolvedValue({
        totalUniquePlayers: 25,
        avgAttendance: 5.0,
        frequencyDistribution: []
      });
      jest.spyOn(AnalyticsService, 'getGeographicDistribution').mockResolvedValue({ topLocations: [] });
      jest.spyOn(AnalyticsService, 'getSessionTypeAnalytics').mockResolvedValue([]);
      jest.spyOn(AnalyticsService, 'getPeakUsagePatterns').mockResolvedValue({ popularTimes: [] });

      const result = await AnalyticsService.getSessionAnalyticsDashboard(startDate, endDate);

      expect(AnalyticsService.getSessionTrends).toHaveBeenCalledWith(startDate, endDate, undefined);
      expect(result.summary.totalSessions).toBe(5);
    });
  });

  describe('getSessionTrends', () => {
    it('should return session trends data', async () => {
      const mockTrendsData = [
        { date: '2024-01-01', session_count: '5', avg_attendance: '4.2', total_players: '21' },
        { date: '2024-01-02', session_count: '3', avg_attendance: '5.1', total_players: '15' }
      ];

      mockDatabaseUtils.executeRawQuery.mockResolvedValue(mockTrendsData);

      const result = await AnalyticsService.getSessionTrends();

      expect(result.totalSessions).toBe(8); // 5 + 3
      expect(result.data).toHaveLength(2);
      expect(result.data[0].sessions).toBe(5);
      expect(result.data[0].avgAttendance).toBe(4.2);
    });

    it('should handle date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockDatabaseUtils.executeRawQuery.mockResolvedValue([]);

      await AnalyticsService.getSessionTrends(startDate, endDate);

      expect(mockDatabaseUtils.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND s.created_at >= $1 AND s.created_at <= $2'),
        [startDate, endDate]
      );
    });
  });

  describe('getParticipationAnalysis', () => {
    it('should return participation analysis data', async () => {
      const mockParticipationData = [
        { frequency_range: '2-5 sessions', player_count: '15' },
        { frequency_range: '6-10 sessions', player_count: '8' }
      ];

      const mockUniquePlayersData = [{ total_unique_players: '50' }];
      const mockAvgAttendanceData = [{ avg_attendance: '4.8' }];

      mockDatabaseUtils.executeRawQuery
        .mockResolvedValueOnce(mockParticipationData)
        .mockResolvedValueOnce(mockUniquePlayersData)
        .mockResolvedValueOnce(mockAvgAttendanceData);

      const result = await AnalyticsService.getParticipationAnalysis();

      expect(result.totalUniquePlayers).toBe(50);
      expect(result.avgAttendance).toBe(4.8);
      expect(result.frequencyDistribution).toHaveLength(2);
      expect(result.frequencyDistribution[0].range).toBe('2-5 sessions');
      expect(result.frequencyDistribution[0].count).toBe(15);
    });
  });

  describe('getGeographicDistribution', () => {
    it('should return geographic distribution data', async () => {
      const mockGeoData = [
        {
          location: 'New York',
          session_count: '10',
          total_players: '45',
          avg_lat: '40.7128',
          avg_lng: '-74.0060'
        }
      ];

      mockDatabaseUtils.executeRawQuery.mockResolvedValue(mockGeoData);

      const result = await AnalyticsService.getGeographicDistribution();

      expect(result.topLocations).toHaveLength(1);
      expect(result.topLocations[0].location).toBe('New York');
      expect(result.topLocations[0].sessions).toBe(10);
      expect(result.topLocations[0].coordinates).toEqual({
        lat: 40.7128,
        lng: -74.0060
      });
    });
  });

  describe('getSessionTypeAnalytics', () => {
    it('should return session type analytics', async () => {
      const mockTypeData = [
        {
          session_type: 'competitive',
          session_count: '8',
          avg_players: '6.2',
          avg_completion_rate: '85.5'
        }
      ];

      mockDatabaseUtils.executeRawQuery.mockResolvedValue(mockTypeData);

      const result = await AnalyticsService.getSessionTypeAnalytics();

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('competitive');
      expect(result[0].sessions).toBe(8);
      expect(result[0].avgPlayers).toBe(6.2);
    });
  });

  describe('getPeakUsagePatterns', () => {
    it('should return peak usage patterns', async () => {
      const mockPeakData = [
        { hour: '18', session_count: '12', avg_players: '5.8' },
        { hour: '19', session_count: '15', avg_players: '6.2' }
      ];

      mockDatabaseUtils.executeRawQuery.mockResolvedValue(mockPeakData);

      const result = await AnalyticsService.getPeakUsagePatterns();

      expect(result.popularTimes).toHaveLength(2);
      expect(result.popularTimes[0].hour).toBe(18);
      expect(result.popularTimes[0].time).toBe('18:00');
      expect(result.popularTimes[0].sessions).toBe(12);
      expect(result.peakHour).toBe(19);
    });
  });

  describe('exportAnalyticsData', () => {
    it('should export data in JSON format by default', async () => {
      const mockDashboardData = {
        summary: { totalSessions: 10, totalPlayers: 50, avgAttendance: 5.0 },
        trends: { totalSessions: 10, data: [] },
        participation: { totalUniquePlayers: 50, avgAttendance: 5.0, frequencyDistribution: [] },
        geography: { topLocations: [] },
        sessionTypes: [],
        peakUsage: { popularTimes: [] },
        generatedAt: new Date().toISOString()
      };

      jest.spyOn(AnalyticsService, 'getSessionAnalyticsDashboard').mockResolvedValue(mockDashboardData);

      const result = await AnalyticsService.exportAnalyticsData();

      expect(result).toEqual(mockDashboardData);
    });

    it('should export data in CSV format when specified', async () => {
      const mockDashboardData = {
        summary: { totalSessions: 10, totalPlayers: 50, avgAttendance: 5.0 },
        trends: {
          totalSessions: 10,
          data: [
            { date: '2024-01-01', sessions: 5, avgAttendance: 4.2, totalPlayers: 21 },
            { date: '2024-01-02', sessions: 3, avgAttendance: 5.1, totalPlayers: 15 }
          ]
        },
        participation: { totalUniquePlayers: 50, avgAttendance: 5.0, frequencyDistribution: [] },
        geography: { topLocations: [] },
        sessionTypes: [],
        peakUsage: { popularTimes: [] },
        generatedAt: new Date().toISOString()
      };

      jest.spyOn(AnalyticsService, 'getSessionAnalyticsDashboard').mockResolvedValue(mockDashboardData);

      const result = await AnalyticsService.exportAnalyticsData(undefined, undefined, 'csv');

      expect(typeof result).toBe('string');
      expect(result).toContain('Date,Sessions,Avg Attendance,Total Players');
      expect(result).toContain('2024-01-01,5,4.2,21');
    });
  });

  describe('trackAnalyticsEvent', () => {
    it('should track analytics events successfully', async () => {
      mockDatabaseUtils.executeRawQuery.mockResolvedValue([]);

      const result = await AnalyticsService.trackAnalyticsEvent(
        'session_created',
        'session-123',
        'user-456',
        { location: 'New York', playerCount: 10 }
      );

      expect(mockDatabaseUtils.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining(['session_created', 'session-123', 'user-456'])
      );
    });

    it('should handle events without user ID', async () => {
      mockDatabaseUtils.executeRawQuery.mockResolvedValue([]);

      await AnalyticsService.trackAnalyticsEvent('session_ended', 'session-123');

      expect(mockDatabaseUtils.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining(['session_ended', 'session-123', null])
      );
    });
  });

  describe('updatePlayerAnalytics', () => {
    it('should update player analytics successfully', async () => {
      const mockMatches = [
        { winner_id: 'player-123', recorded_at: new Date() },
        { winner_id: 'player-456', recorded_at: new Date() }
      ];

      const mockSessions = [{ count: '5' }];
      const mockTournaments = [{ count: '2' }];
      const mockFriends = [{ count: '10' }];
      const mockChallengesSent = [{ count: '3' }];
      const mockChallengesAccepted = [{ count: '2' }];
      const mockAchievements = [{ count: '5' }];
      const mockBadges = [{ count: '3' }];
      const mockTotalPoints = [{ total: '150' }];
      const mockNotifications = [{ count: '20' }];
      const mockMessages = [{ count: '15' }];

      mockDatabaseUtils.executeRawQuery
        .mockResolvedValueOnce(mockMatches)
        .mockResolvedValueOnce(mockSessions)
        .mockResolvedValueOnce(mockTournaments)
        .mockResolvedValueOnce(mockFriends)
        .mockResolvedValueOnce(mockChallengesSent)
        .mockResolvedValueOnce(mockChallengesAccepted)
        .mockResolvedValueOnce(mockAchievements)
        .mockResolvedValueOnce(mockBadges)
        .mockResolvedValueOnce(mockTotalPoints)
        .mockResolvedValueOnce(mockNotifications)
        .mockResolvedValueOnce(mockMessages)
        .mockResolvedValueOnce([]); // For best streak
        .mockResolvedValueOnce([]); // For game duration
        .mockResolvedValueOnce([]); // For hours played
        .mockResolvedValueOnce([]); // Upsert result

      await AnalyticsService.updatePlayerAnalytics('player-123');

      expect(mockDatabaseUtils.executeRawQuery).toHaveBeenCalledTimes(15);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseUtils.executeRawQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(AnalyticsService.updatePlayerAnalytics('player-123')).rejects.toThrow('Failed to update player analytics');
    });
  });

  describe('updateSessionAnalytics', () => {
    it('should update session analytics successfully', async () => {
      const mockSessionData = [{
        id: 'session-123',
        total_players: '8',
        total_games: '12',
        scheduled_at: new Date(),
        location: 'New York'
      }];

      const mockMatches = [
        { status: 'COMPLETED', start_time: new Date(), end_time: new Date(Date.now() + 30 * 60 * 1000) },
        { status: 'IN_PROGRESS' }
      ];

      mockDatabaseUtils.executeRawQuery
        .mockResolvedValueOnce(mockSessionData)
        .mockResolvedValueOnce(mockMatches)
        .mockResolvedValueOnce([{ count: '6' }]) // active players
        .mockResolvedValueOnce([]); // upsert result

      await AnalyticsService.updateSessionAnalytics('session-123');

      expect(mockDatabaseUtils.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_analytics'),
        expect.arrayContaining(['session-123', 8, 2, 12])
      );
    });
  });

  describe('getPlayerLeaderboard', () => {
    it('should return player leaderboard', async () => {
      const mockLeaderboardData = [
        { player_name: 'John Doe', skill_rating: '1850', win_rate: '75.5', total_matches: '20', current_streak: '5' },
        { player_name: 'Jane Smith', skill_rating: '1820', win_rate: '72.3', total_matches: '18', current_streak: '3' }
      ];

      mockDatabaseUtils.executeRawQuery.mockResolvedValue(mockLeaderboardData);

      const result = await AnalyticsService.getPlayerLeaderboard(10);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].playerName).toBe('John Doe');
      expect(result[0].skillRating).toBe(1850);
      expect(result[0].winRate).toBe(75.5);
    });

    it('should handle empty leaderboard', async () => {
      mockDatabaseUtils.executeRawQuery.mockResolvedValue([]);

      const result = await AnalyticsService.getPlayerLeaderboard();

      expect(result).toEqual([]);
    });
  });
});