import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Authentication middleware on ALL admin routes ──
router.use('/api/v1/admin', authenticateToken, requireRole(['ADMIN']));
router.use('/admin', authenticateToken, requireRole(['ADMIN']));

// ── First-admin seed: auto-promote user matching ADMIN_SEED_EMAIL ──
const seedAdminUser = async () => {
  const seedEmail = process.env.ADMIN_SEED_EMAIL;
  if (!seedEmail) return;

  try {
    const user = await prisma.user.findUnique({ where: { email: seedEmail } });
    if (user && user.role !== 'ADMIN') {
      await prisma.user.update({
        where: { email: seedEmail },
        data: { role: 'ADMIN' },
      });
      console.log(`🔑 Admin role granted to ${seedEmail} via ADMIN_SEED_EMAIL`);
    }
    if (!user) {
      console.log(`⚠️  ADMIN_SEED_EMAIL set but user "${seedEmail}" not found — register first`);
    }
  } catch (err) {
    console.warn('Admin seed check failed:', err);
  }
};
seedAdminUser();

// ── Stats API (admin only) ──
router.get('/api/v1/admin/stats', async (_req: Request, res: Response) => {
  try {
    const [sessionCount, activeSessionCount, playerCount, gameCount, userCount] = await Promise.all([
      prisma.mvpSession.count(),
      prisma.mvpSession.count({ where: { status: 'ACTIVE' } }),
      prisma.mvpPlayer.count(),
      prisma.mvpGame.count(),
      prisma.user.count(),
    ]);

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

// ── Admin Management APIs ──

// List all users (admin only)
router.get('/api/v1/admin/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        _count: { select: { ownedSessions: true } },
      },
    });

    res.json({
      success: true,
      data: {
        users,
        total: users.length,
        admins: users.filter(u => u.role === 'ADMIN').length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to list users' } });
  }
});

// List admin users
router.get('/api/v1/admin/admins', async (_req: Request, res: Response) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: { admins },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin list error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to list admins' } });
  }
});

// Promote a user to admin
router.put('/api/v1/admin/users/:userId/promote', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (user.role === 'ADMIN') {
      return res.status(400).json({ success: false, error: { message: 'User is already an admin' } });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, role: true },
    });

    console.log(`🔑 ${updated.name} (${updated.email}) promoted to ADMIN`);

    res.json({
      success: true,
      data: { user: updated },
      message: `${updated.name} promoted to admin`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to promote user' } });
  }
});

// Demote an admin to player
router.put('/api/v1/admin/users/:userId/demote', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (user.role !== 'ADMIN') {
      return res.status(400).json({ success: false, error: { message: 'User is not an admin' } });
    }

    // Prevent demoting the last admin
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot remove the last admin. Promote another user first.' },
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: 'PLAYER' },
      select: { id: true, name: true, email: true, role: true },
    });

    console.log(`⬇️  ${updated.name} (${updated.email}) demoted to PLAYER`);

    res.json({
      success: true,
      data: { user: updated },
      message: `${updated.name} demoted to player`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Demote user error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to demote user' } });
  }
});

// ── Admin Dashboard HTML (authenticated) ──
router.get('/admin', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rally — Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
    .header { background: linear-gradient(135deg, #1a237e, #0d47a1); color: #fff; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header .user-info { font-size: 13px; opacity: 0.85; }
    .header button { background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .header button:hover { background: rgba(255,255,255,0.25); }
    .nav { background: #fff; border-bottom: 1px solid #e0e0e0; padding: 0 32px; display: flex; gap: 0; }
    .nav button { padding: 12px 20px; border: none; background: none; font-size: 14px; font-weight: 600; color: #666; cursor: pointer; border-bottom: 3px solid transparent; }
    .nav button.active { color: #1a237e; border-bottom-color: #1a237e; }
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
    .badge-admin { background: #fff3e0; color: #e65100; }
    .badge-player { background: #f5f5f5; color: #666; }
    .badge-owner { background: #e8eaf6; color: #283593; }
    .action-btn { background: none; border: 1px solid #ddd; padding: 5px 12px; border-radius: 5px; font-size: 12px; cursor: pointer; margin-right: 4px; }
    .action-btn.promote { color: #2e7d32; border-color: #2e7d32; }
    .action-btn.demote { color: #c62828; border-color: #c62828; }
    .action-btn:hover { opacity: 0.7; }
    .refresh { color: #888; font-size: 12px; text-align: right; padding: 8px 32px; }
    .loading { text-align: center; padding: 40px; color: #888; }
    .hidden { display: none; }
    @media (prefers-color-scheme: dark) {
      body { background: #121212; color: #e0e0e0; }
      .header { background: linear-gradient(135deg, #0d1b2a, #1a237e); }
      .nav { background: #1e1e1e; border-color: #333; }
      .nav button { color: #aaa; }
      .nav button.active { color: #90caf9; border-color: #90caf9; }
      .stat-card { background: #1e1e1e; }
      .stat-card .label { color: #888; }
      .stat-card .value { color: #64b5f6; }
      .stat-card.active .value { color: #66bb6a; }
      .section h2 { color: #e0e0e0; }
      table { background: #1e1e1e; }
      th { background: #252525; color: #aaa; }
      td { border-color: #333; color: #ddd; }
      tr:hover { background: #2a2a2a; }
      .refresh { color: #666; }
      .badge-player { background: #333; color: #aaa; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🏸 Rally Admin</h1>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <span class="user-info" id="currentUser">Loading...</span>
      <button onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="nav">
    <button class="active" onclick="showTab('dashboard')" id="tabDashboard">📊 Dashboard</button>
    <button onclick="showTab('users')" id="tabUsers">👥 User Management</button>
  </div>

  <!-- Dashboard Tab -->
  <div id="dashboardTab">
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
  </div>

  <!-- Users Tab -->
  <div id="usersTab" class="hidden">
    <div class="section">
      <h2>👥 All Registered Users</h2>
      <div id="usersTable"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <div class="refresh">Auto-refreshes every 30s · <span id="updateTime"></span></div>

  <script>
    const token = localStorage.getItem('admin_token');
    if (!token) {
      document.body.innerHTML = \`<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
        <h1>🔐 Admin Access</h1>
        <p style="color:#666">Sign in with an admin account to continue</p>
        <form onsubmit="login(event)" style="display:flex;flex-direction:column;gap:12px;width:300px">
          <input id="email" type="email" placeholder="Email" required style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
          <input id="password" type="password" placeholder="Password" required style="padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
          <button type="submit" style="padding:12px;background:#1a237e;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Sign In</button>
          <p id="loginError" style="color:#c62828;font-size:13px;text-align:center"></p>
        </form>
      </div>\`;
    }

    async function login(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('admin_token', data.data.tokens.accessToken);
          location.reload();
        } else {
          document.getElementById('loginError').textContent = data.error?.message || 'Login failed';
        }
      } catch (err) {
        document.getElementById('loginError').textContent = 'Network error';
      }
    }

    function logout() {
      localStorage.removeItem('admin_token');
      location.reload();
    }

    async function api(path, method = 'GET', body = null) {
      const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      if (res.status === 401 || res.status === 403) { logout(); return null; }
      return res.json();
    }

    let currentTab = 'dashboard';
    function showTab(tab) {
      currentTab = tab;
      document.getElementById('dashboardTab').classList.toggle('hidden', tab !== 'dashboard');
      document.getElementById('usersTab').classList.toggle('hidden', tab !== 'users');
      document.getElementById('tabDashboard').classList.toggle('active', tab === 'dashboard');
      document.getElementById('tabUsers').classList.toggle('active', tab === 'users');
      if (tab === 'dashboard') loadStats();
      if (tab === 'users') loadUsers();
    }

    async function loadStats() {
      try {
        const { data } = await api('/api/v1/admin/stats');
        if (!data) return;
        document.getElementById('totalSessions').textContent = data.overview.totalSessions;
        document.getElementById('activeSessions').textContent = data.overview.activeSessions;
        document.getElementById('totalPlayers').textContent = data.overview.totalPlayers;
        document.getElementById('totalGames').textContent = data.overview.totalGames;
        document.getElementById('registeredUsers').textContent = data.overview.registeredUsers;

        const badge = s => ({ ACTIVE: 'badge-active', COMPLETED: 'badge-completed', CANCELLED: 'badge-cancelled' }[s.status] || '');
        document.getElementById('sessionTable').innerHTML = \`
          <table><thead><tr>
            <th>Name</th><th>Share Code</th><th>Status</th><th>Owner</th><th>Players</th><th>Games</th><th>Created</th>
          </tr></thead><tbody>\${
            data.sessions.map(s => \`<tr>
              <td><strong>\${s.name}</strong></td>
              <td><code>\${s.shareCode}</code></td>
              <td><span class="badge \${badge(s)}">\${s.status}</span></td>
              <td>\${s.ownerName}</td>
              <td>\${s.playerCount}</td>
              <td>\${s.gameCount}</td>
              <td>\${new Date(s.createdAt).toLocaleDateString()}</td>
            </tr>\`).join('')
          }</tbody></table>\`;

        document.getElementById('playerTable').innerHTML = \`
          <table><thead><tr>
            <th>Name</th><th>Session</th><th>Games</th><th>Wins</th><th>Losses</th><th>Win %</th>
          </tr></thead><tbody>\${
            data.topPlayers.map(p => \`<tr>
              <td><strong>\${p.name}</strong></td>
              <td>\${p.sessionName} <code style="font-size:11px">\${p.shareCode}</code></td>
              <td>\${p.gamesPlayed}</td>
              <td>\${p.wins}</td>
              <td>\${p.losses}</td>
              <td>\${(p.winRate * 100).toFixed(0)}%</td>
            </tr>\`).join('')
          }</tbody></table>\`;
      } catch(e) { console.error(e); }
      document.getElementById('updateTime').textContent = 'Updated: ' + new Date().toLocaleTimeString();
    }

    async function loadUsers() {
      try {
        const { data } = await api('/api/v1/admin/users');
        if (!data) return;

        const roleBadge = r => ({ ADMIN: 'badge-admin', OWNER: 'badge-owner', PLAYER: 'badge-player' }[r] || 'badge-player');
        document.getElementById('usersTable').innerHTML = \`
          <p style="margin-bottom:12px;color:#666;font-size:13px">Total: \${data.total} users · \${data.admins} admins</p>
          <table><thead><tr>
            <th>Name</th><th>Email</th><th>Role</th><th>Sessions</th><th>Joined</th><th>Actions</th>
          </tr></thead><tbody>\${
            data.users.map(u => \`<tr>
              <td><strong>\${u.name}</strong></td>
              <td>\${u.email || '-'}</td>
              <td><span class="badge \${roleBadge(u.role)}">\${u.role}</span></td>
              <td>\${u._count?.ownedSessions || 0}</td>
              <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                \${u.role !== 'ADMIN'
                  ? \`<button class="action-btn promote" onclick="promoteUser('\${u.id}','\${u.name}')">Promote to Admin</button>\`
                  : \`<button class="action-btn demote" onclick="demoteUser('\${u.id}','\${u.name}')">Demote</button>\`}
              </td>
            </tr>\`).join('')
          }</tbody></table>\`;
      } catch(e) { console.error(e); }
    }

    async function promoteUser(userId, name) {
      if (!confirm(\`Promote \${name} to admin?\`)) return;
      const res = await api(\`/api/v1/admin/users/\${userId}/promote\`, 'PUT');
      if (res?.success) { alert(res.message); loadUsers(); }
    }

    async function demoteUser(userId, name) {
      if (!confirm(\`Remove admin privileges from \${name}?\`)) return;
      const res = await api(\`/api/v1/admin/users/\${userId}/demote\`, 'PUT');
      if (res?.success) { alert(res.message); loadUsers(); }
    }

    // Initial load
    loadStats();
    setInterval(() => {
      if (currentTab === 'dashboard') loadStats();
    }, 30000);
  </script>
</body>
</html>`);
});

export default router;
