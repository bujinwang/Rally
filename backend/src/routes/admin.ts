import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';

const router = Router();

// Admin stats API
router.get('/api/v1/admin/stats', async (_req: Request, res: Response) => {
  try {
    const [sessionCount, activeSessionCount, playerCount, gameCount, userCount] = await Promise.all([
      prisma.mvpSession.count(),
      prisma.mvpSession.count({ where: { status: 'ACTIVE' } }),
      prisma.mvpPlayer.count(),
      prisma.mvpGame.count(),
      prisma.user.count(),
    ]);

    // Top 10 sessions by player count
    const sessions = await prisma.mvpSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { players: true, games: true } },
      },
    });

    const sessionList = sessions.map(s => ({
      id: s.id,
      name: s.name,
      shareCode: s.shareCode,
      status: s.status,
      ownerName: s.ownerName,
      playerCount: s._count.players,
      gameCount: s._count.games,
      createdAt: s.createdAt.toISOString(),
    }));

    // Top players by games
    const topPlayers = await prisma.mvpPlayer.findMany({
      orderBy: { gamesPlayed: 'desc' },
      take: 20,
      select: {
        id: true, name: true, gamesPlayed: true, wins: true, losses: true,
        winRate: true, matchesPlayed: true, matchWins: true,
        session: { select: { shareCode: true, name: true } },
      },
    });

    const playerList = topPlayers.map(p => ({
      name: p.name,
      sessionName: p.session.name,
      shareCode: p.session.shareCode,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      losses: p.losses,
      winRate: p.winRate,
    }));

    res.json({
      success: true,
      data: {
        overview: {
          totalSessions: sessionCount,
          activeSessions: activeSessionCount,
          totalPlayers: playerCount,
          totalGames: gameCount,
          registeredUsers: userCount,
        },
        sessions: sessionList,
        topPlayers: playerList,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch stats' } });
  }
});

// Admin dashboard HTML page
router.get('/admin', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BadmintonGroup — Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
    .header { background: linear-gradient(135deg, #1a237e, #0d47a1); color: #fff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header a { color: rgba(255,255,255,0.8); text-decoration: none; font-size: 14px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; padding: 24px 32px; }
    .stat-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-card .label { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-card .value { font-size: 32px; font-weight: 700; color: #1a237e; }
    .stat-card.active .value { color: #2e7d32; }
    .section { padding: 0 32px 24px; }
    .section h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #333; }
    table { width: 100%; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
    th { background: #fafafa; font-weight: 600; color: #555; }
    tr:hover { background: #f8f9ff; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-active { background: #e8f5e9; color: #2e7d32; }
    .badge-completed { background: #e3f2fd; color: #1565c0; }
    .badge-cancelled { background: #fce4ec; color: #c62828; }
    .refresh { color: #888; font-size: 12px; text-align: right; padding: 8px 32px; }
    .loading { text-align: center; padding: 40px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🏸 BadmintonGroup Admin</h1>
      <div style="font-size:13px;opacity:0.7;margin-top:4px">Dashboard</div>
    </div>
    <div>
      <a href="/">← Web App</a>
    </div>
  </div>

  <div class="stats-grid" id="overview">
    <div class="stat-card"><div class="label">Total Sessions</div><div class="value" id="totalSessions">-</div></div>
    <div class="stat-card active"><div class="label">Active Sessions</div><div class="value" id="activeSessions">-</div></div>
    <div class="stat-card"><div class="label">Total Players</div><div class="value" id="totalPlayers">-</div></div>
    <div class="stat-card"><div class="label">Total Games</div><div class="value" id="totalGames">-</div></div>
    <div class="stat-card"><div class="label">Registered Users</div><div class="value" id="registeredUsers">-</div></div>
  </div>

  <div class="section">
    <h2>📋 All Sessions</h2>
    <div id="sessionTable"><div class="loading">Loading...</div></div>
  </div>

  <div class="section">
    <h2>🏅 Top Players</h2>
    <div id="playerTable"><div class="loading">Loading...</div></div>
  </div>

  <div class="refresh">Auto-refreshes every 30s · <span id="updateTime"></span></div>

  <script>
    async function loadStats() {
      try {
        const res = await fetch('/api/v1/admin/stats');
        const { data } = await res.json();
        
        // Overview
        document.getElementById('totalSessions').textContent = data.overview.totalSessions;
        document.getElementById('activeSessions').textContent = data.overview.activeSessions;
        document.getElementById('totalPlayers').textContent = data.overview.totalPlayers;
        document.getElementById('totalGames').textContent = data.overview.totalGames;
        document.getElementById('registeredUsers').textContent = data.overview.registeredUsers;
        
        // Sessions table
        const badge = (s) => ({ ACTIVE: 'badge-active', COMPLETED: 'badge-completed', CANCELLED: 'badge-cancelled' }[s.status] || '');
        const sessionRows = data.sessions.map(s => \`
          <tr>
            <td><strong>\${s.name}</strong></td>
            <td><code>\${s.shareCode}</code></td>
            <td><span class="badge \${badge(s)}">\${s.status}</span></td>
            <td>\${s.ownerName}</td>
            <td>\${s.playerCount}</td>
            <td>\${s.gameCount}</td>
            <td>\${new Date(s.createdAt).toLocaleDateString()}</td>
          </tr>\`).join('');
        document.getElementById('sessionTable').innerHTML = \`
          <table><thead><tr>
            <th>Name</th><th>Share Code</th><th>Status</th><th>Owner</th><th>Players</th><th>Games</th><th>Created</th>
          </tr></thead><tbody>\${sessionRows}</tbody></table>\`;
        
        // Players table
        const playerRows = data.topPlayers.map(p => \`
          <tr>
            <td><strong>\${p.name}</strong></td>
            <td>\${p.sessionName} <code style="font-size:11px">\${p.shareCode}</code></td>
            <td>\${p.gamesPlayed}</td>
            <td>\${p.wins}</td>
            <td>\${p.losses}</td>
            <td>\${(p.winRate * 100).toFixed(0)}%</td>
          </tr>\`).join('');
        document.getElementById('playerTable').innerHTML = \`
          <table><thead><tr>
            <th>Name</th><th>Session</th><th>Games</th><th>Wins</th><th>Losses</th><th>Win %</th>
          </tr></thead><tbody>\${playerRows}</tbody></table>\`;
        
        document.getElementById('updateTime').textContent = 'Updated: ' + new Date().toLocaleTimeString();
      } catch(e) { console.error(e); }
    }
    loadStats();
    setInterval(loadStats, 30000);
  </script>
</body>
</html>`);
});

export default router;
