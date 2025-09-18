import request from 'supertest';
import express from 'express';
import analyticsRouter from '../analytics';
import { AnalyticsService } from '../../services/analyticsService';

// Mock the AnalyticsService
jest.mock('../../services/analyticsService');
const mockAnalyticsService = AnalyticsService as jest.Mocked<typeof AnalyticsService>;

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRouter);

describe('Analytics Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/sessions', () => {
    it('should return session analytics dashboard data', async () => {
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

      mockAnalyticsService.getSessionAnalyticsDashboard.mockResolvedValue(mockDashboardData);

      const response = await request(app)
        .get('/api/analytics/sessions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalSessions).toBe(10);
      expect(response.body.data.summary.totalPlayers).toBe(50);
      expect(mockAnalyticsService.getSessionAnalyticsDashboard).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle date range parameters', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-31T23:59:59.999Z';

      mockAnalyticsService.getSessionAnalyticsDashboard.mockResolvedValue({
        summary: { totalSessions: 5, totalPlayers: 25, avgAttendance: 5.0 },
        trends: { totalSessions: 5, data: [] },
        participation: { totalUniquePlayers: 25, avgAttendance: 5.0, frequencyDistribution: [] },
        geography: { topLocations: [] },
        sessionTypes: [],
        peakUsage: { popularTimes: [] },
        generatedAt: new Date().toISOString()
      });

      const response = await request(app)
        .get('/api/analytics/sessions')
        .query({ startDate, endDate })
        .expect(200);

      expect(mockAnalyticsService.getSessionAnalyticsDashboard).toHaveBeenCalledWith(
        new Date(startDate),
        new Date(endDate),
        undefined
      );
    });

    it('should handle service errors', async () => {
      mockAnalyticsService.getSessionAnalyticsDashboard.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/analytics/sessions')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch session analytics dashboard');
    });
  });

  describe('GET /api/analytics/trends', () => {
    it('should return session trends data', async () => {
      const mockTrendsData = {
        totalSessions: 15,
        data: [
          { date: '2024-01-01', sessions: 5, avgAttendance: 4.2, totalPlayers: 21 },
          { date: '2024-01-02', sessions: 10, avgAttendance: 5.1, totalPlayers: 51 }
        ]
      };

      mockAnalyticsService.getSessionTrends.mockResolvedValue(mockTrendsData);

      const response = await request(app)
        .get('/api/analytics/trends')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalSessions).toBe(15);
      expect(response.body.data.data).toHaveLength(2);
    });
  });

  describe('GET /api/analytics/geography', () => {
    it('should return geographic distribution data', async () => {
      const mockGeoData = {
        topLocations: [
          {
            location: 'New York',
            sessions: 10,
            players: 45,
            coordinates: { lat: 40.7128, lng: -74.0060 }
          }
        ]
      };

      mockAnalyticsService.getGeographicDistribution.mockResolvedValue(mockGeoData);

      const response = await request(app)
        .get('/api/analytics/geography')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.topLocations).toHaveLength(1);
      expect(response.body.data.topLocations[0].location).toBe('New York');
    });
  });

  describe('GET /api/analytics/participation', () => {
    it('should return participation analysis data', async () => {
      const mockParticipationData = {
        totalUniquePlayers: 100,
        avgAttendance: 4.8,
        frequencyDistribution: [
          { range: '1 session', count: 20, percentage: 20 },
          { range: '2-5 sessions', count: 50, percentage: 50 },
          { range: '6-10 sessions', count: 30, percentage: 30 }
        ]
      };

      mockAnalyticsService.getParticipationAnalysis.mockResolvedValue(mockParticipationData);

      const response = await request(app)
        .get('/api/analytics/participation')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalUniquePlayers).toBe(100);
      expect(response.body.data.frequencyDistribution).toHaveLength(3);
    });
  });

  describe('GET /api/analytics/session-types', () => {
    it('should return session type analytics', async () => {
      const mockSessionTypes = [
        { type: 'casual', sessions: 20, avgPlayers: 4.2, avgCompletionRate: 85.5 },
        { type: 'competitive', sessions: 15, avgPlayers: 6.8, avgCompletionRate: 92.3 }
      ];

      mockAnalyticsService.getSessionTypeAnalytics.mockResolvedValue(mockSessionTypes);

      const response = await request(app)
        .get('/api/analytics/session-types')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].type).toBe('casual');
      expect(response.body.data[1].type).toBe('competitive');
    });
  });

  describe('GET /api/analytics/peak-usage', () => {
    it('should return peak usage patterns', async () => {
      const mockPeakUsage = {
        popularTimes: [
          { hour: 18, time: '18:00', sessions: 12, avgPlayers: 5.8 },
          { hour: 19, time: '19:00', sessions: 15, avgPlayers: 6.2 }
        ],
        peakHour: 19
      };

      mockAnalyticsService.getPeakUsagePatterns.mockResolvedValue(mockPeakUsage);

      const response = await request(app)
        .get('/api/analytics/peak-usage')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.popularTimes).toHaveLength(2);
      expect(response.body.data.peakHour).toBe(19);
    });
  });

  describe('POST /api/analytics/export', () => {
    it('should export data in JSON format by default', async () => {
      const mockExportData = {
        summary: { totalSessions: 10, totalPlayers: 50, avgAttendance: 5.0 },
        trends: { totalSessions: 10, data: [] },
        participation: { totalUniquePlayers: 50, avgAttendance: 5.0, frequencyDistribution: [] },
        geography: { topLocations: [] },
        sessionTypes: [],
        peakUsage: { popularTimes: [] },
        generatedAt: new Date().toISOString()
      };

      mockAnalyticsService.exportAnalyticsData.mockResolvedValue(mockExportData);

      const response = await request(app)
        .post('/api/analytics/export')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalSessions).toBe(10);
    });

    it('should export data in CSV format when specified', async () => {
      const csvData = 'Date,Sessions,Avg Attendance,Total Players\n2024-01-01,5,4.2,21\n';
      mockAnalyticsService.exportAnalyticsData.mockResolvedValue(csvData);

      const response = await request(app)
        .post('/api/analytics/export')
        .send({ format: 'csv' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment; filename="session-analytics.csv"');
    });

    it('should handle date range in export', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-31T23:59:59.999Z';

      mockAnalyticsService.exportAnalyticsData.mockResolvedValue({
        summary: { totalSessions: 5, totalPlayers: 25, avgAttendance: 5.0 }
      });

      const response = await request(app)
        .post('/api/analytics/export')
        .send({ startDate, endDate, format: 'json' })
        .expect(200);

      expect(mockAnalyticsService.exportAnalyticsData).toHaveBeenCalledWith(
        new Date(startDate),
        new Date(endDate),
        'json'
      );
    });
  });

  describe('POST /api/analytics/track-event', () => {
    it('should track analytics events successfully', async () => {
      mockAnalyticsService.trackAnalyticsEvent.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/analytics/track-event')
        .send({
          type: 'session_created',
          entityId: 'session-123',
          userId: 'user-456',
          data: { location: 'New York' }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Event tracked successfully');
      expect(mockAnalyticsService.trackAnalyticsEvent).toHaveBeenCalledWith(
        'session_created',
        'session-123',
        'user-456',
        { location: 'New York' }
      );
    });

    it('should handle events without user ID', async () => {
      mockAnalyticsService.trackAnalyticsEvent.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/analytics/track-event')
        .send({
          type: 'session_ended',
          entityId: 'session-123'
        })
        .expect(200);

      expect(mockAnalyticsService.trackAnalyticsEvent).toHaveBeenCalledWith(
        'session_ended',
        'session-123',
        undefined,
        undefined
      );
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/analytics/track-event')
        .send({ type: 'session_created' }) // Missing entityId
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('entityId are required');
    });
  });

  describe('GET /api/analytics/player/:playerId', () => {
    it('should return player analytics', async () => {
      const mockPlayerData = {
        id: 'player-123',
        playerId: 'player-123',
        totalMatches: 20,
        totalWins: 15,
        totalLosses: 5,
        winRate: 75.0,
        sessionsPlayed: 10
      };

      // Mock the database query for existing analytics
      const mockQueryResult = [mockPlayerData];

      // Import and mock the database utils
      const { DatabaseUtils } = require('../../utils/databaseUtils');
      jest.mock('../../utils/databaseUtils');
      DatabaseUtils.executeRawQuery = jest.fn().mockResolvedValue(mockQueryResult);

      const response = await request(app)
        .get('/api/analytics/player/player-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalMatches).toBe(20);
      expect(response.body.data.winRate).toBe(75.0);
    });
  });

  describe('GET /api/analytics/leaderboard', () => {
    it('should return player leaderboard', async () => {
      const mockLeaderboard = [
        { rank: 1, playerName: 'John Doe', skillRating: 1850, winRate: 75.5, totalMatches: 20, currentStreak: 5 },
        { rank: 2, playerName: 'Jane Smith', skillRating: 1820, winRate: 72.3, totalMatches: 18, currentStreak: 3 }
      ];

      mockAnalyticsService.getPlayerLeaderboard.mockResolvedValue(mockLeaderboard);

      const response = await request(app)
        .get('/api/analytics/leaderboard?limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].rank).toBe(1);
      expect(mockAnalyticsService.getPlayerLeaderboard).toHaveBeenCalledWith(10);
    });
  });

  describe('POST /api/analytics/refresh/player/:playerId', () => {
    it('should refresh player analytics', async () => {
      mockAnalyticsService.updatePlayerAnalytics.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/analytics/refresh/player/player-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Player analytics refreshed successfully');
      expect(mockAnalyticsService.updatePlayerAnalytics).toHaveBeenCalledWith('player-123');
    });
  });

  describe('POST /api/analytics/refresh/session/:sessionId', () => {
    it('should refresh session analytics', async () => {
      mockAnalyticsService.updateSessionAnalytics.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/analytics/refresh/session/session-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session analytics refreshed successfully');
      expect(mockAnalyticsService.updateSessionAnalytics).toHaveBeenCalledWith('session-123');
    });
  });
});