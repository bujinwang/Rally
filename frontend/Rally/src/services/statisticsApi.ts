import { API_BASE_URL } from '../config/api';

const BASE = `${API_BASE_URL}/statistics`;

const headers = {
  'Content-Type': 'application/json',
};

const statisticsApi = {
  /**
   * Get player performance trends over time.
   * GET /statistics/trends/:playerId?days=30
   */
  async getTrends(playerId: string, days = 30) {
    const res = await fetch(`${BASE}/trends/${playerId}?days=${days}`, { headers });
    return res.json();
  },

  /**
   * Get player streaks (current, best win/loss, recent form).
   * GET /statistics/player/:playerId/streaks
   */
  async getPlayerStreaks(playerId: string) {
    const res = await fetch(`${BASE}/player/${playerId}/streaks`, { headers });
    return res.json();
  },

  /**
   * Get player percentile rankings.
   * GET /statistics/player/:playerId/percentiles
   */
  async getPlayerPercentiles(playerId: string) {
    const res = await fetch(`${BASE}/player/${playerId}/percentiles`, { headers });
    return res.json();
  },

  /**
   * Get leaderboard.
   * GET /statistics/leaderboard?limit=10
   */
  async getLeaderboard(params: { limit?: number; sessionId?: string } = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.sessionId) query.set('sessionId', params.sessionId);
    const res = await fetch(`${BASE}/leaderboard?${query}`, { headers });
    return res.json();
  },

  /**
   * Get session activity heatmap.
   * GET /statistics/session/:sessionId/heatmap
   */
  async getSessionHeatmap(sessionId: string) {
    const res = await fetch(`${BASE}/session/${sessionId}/heatmap`, { headers });
    return res.json();
  },
};

export default statisticsApi;
