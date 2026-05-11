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

// ── User detail & edit ──
router.get('/api/v1/admin/users/:userId', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, avatarUrl: true,
        bio: true, location: true, skillLevel: true, deviceId: true,
        createdAt: true, updatedAt: true,
        _count: { select: { ownedSessions: true, sessionPlayers: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    res.json({ success: true, data: { user }, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to get user' } });
  }
});

router.put('/api/v1/admin/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { name, email, phone, role } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    // Prevent removing last admin
    if (user.role === 'ADMIN' && role && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: { message: 'Cannot remove the last admin' } });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(role !== undefined && { role }),
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    res.json({ success: true, data: { user: updated }, message: 'User updated', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update user' } });
  }
});

router.delete('/api/v1/admin/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    // Prevent deleting last admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: { message: 'Cannot delete the last admin' } });
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    console.log(`🗑️  Admin deleted user: ${user.name} (${user.email})`);
    res.json({ success: true, message: `User ${user.name} deleted`, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete user' } });
  }
});

// ── Session management ──
router.get('/api/v1/admin/sessions', async (req: Request, res: Response) => {
  try {
    const { search, status, limit = '50', offset = '0' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { ownerName: { contains: search as string, mode: 'insensitive' } },
        { shareCode: { contains: search as string, mode: 'insensitive' } },
        { location: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [sessions, total] = await Promise.all([
      prisma.mvpSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: {
          _count: { select: { players: true, games: true } },
        },
      }),
      prisma.mvpSession.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        sessions: sessions.map(s => ({
          id: s.id, name: s.name, shareCode: s.shareCode, status: s.status,
          ownerName: s.ownerName, ownerDeviceId: s.ownerDeviceId,
          location: s.location, sport: s.sport, courtCount: s.courtCount,
          maxPlayers: s.maxPlayers, scheduledAt: s.scheduledAt.toISOString(),
          playerCount: s._count.players, gameCount: s._count.games,
          createdAt: s.createdAt.toISOString(),
        })),
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to list sessions' } });
  }
});

router.get('/api/v1/admin/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await prisma.mvpSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        players: { select: { id: true, name: true, deviceId: true, status: true, gamesPlayed: true, wins: true, losses: true, checkedIn: true } },
        games: { orderBy: { createdAt: 'desc' }, take: 50 },
        _count: { select: { players: true, games: true, matches: true } },
      },
    });
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });

    res.json({ success: true, data: { session }, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to get session' } });
  }
});

router.put('/api/v1/admin/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { name, location, maxPlayers, courtCount, status, description } = req.body;

    const session = await prisma.mvpSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });

    const updated = await prisma.mvpSession.update({
      where: { id: sessionId },
      data: {
        ...(name !== undefined && { name }),
        ...(location !== undefined && { location }),
        ...(maxPlayers !== undefined && { maxPlayers }),
        ...(courtCount !== undefined && { courtCount }),
        ...(status !== undefined && { status }),
        ...(description !== undefined && { description }),
      },
    });

    res.json({ success: true, data: { session: { id: updated.id, name: updated.name, status: updated.status } }, message: 'Session updated', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update session' } });
  }
});

router.delete('/api/v1/admin/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.mvpSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });

    // Soft-delete: mark as CANCELLED
    await prisma.mvpSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED' },
    });

    console.log(`🗑️  Admin cancelled session: ${session.name} (${session.shareCode})`);
    res.json({ success: true, message: `Session "${session.name}" cancelled`, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to cancel session' } });
  }
});

// ── Club oversight ──
router.get('/api/v1/admin/clubs', async (_req: Request, res: Response) => {
  try {
    const clubs = await prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, sessions: true } },
      },
    });

    res.json({
      success: true,
      data: {
        clubs: clubs.map(c => ({
          id: c.id, name: c.name, description: c.description,
          ownerDeviceId: c.ownerDeviceId,
          memberCount: c._count.members, sessionCount: c._count.sessions,
          createdAt: c.createdAt.toISOString(),
        })),
        total: clubs.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to list clubs' } });
  }
});

router.get('/api/v1/admin/clubs/:clubId', async (req: Request, res: Response) => {
  try {
    const club = await prisma.club.findUnique({
      where: { id: req.params.clubId },
      include: {
        members: { select: { id: true, name: true, deviceId: true, role: true, joinedAt: true } },
        sessions: { select: { id: true, name: true, shareCode: true, status: true, scheduledAt: true }, orderBy: { scheduledAt: 'desc' }, take: 20 },
        _count: { select: { members: true, sessions: true } },
      },
    });
    if (!club) return res.status(404).json({ success: false, error: { message: 'Club not found' } });

    res.json({ success: true, data: { club }, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to get club' } });
  }
});

router.put('/api/v1/admin/clubs/:clubId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { clubId, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ success: false, error: { message: 'Role must be ADMIN or MEMBER' } });
    }

    const member = await prisma.clubMember.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) return res.status(404).json({ success: false, error: { message: 'Member not found' } });

    const updated = await prisma.clubMember.update({
      where: { id: memberId },
      data: { role },
      select: { id: true, name: true, role: true },
    });

    res.json({ success: true, data: { member: updated }, message: `${updated.name} role changed to ${role}`, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update member role' } });
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
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-box { background: #fff; border-radius: 12px; padding: 24px; width: 90%; max-width: 450px; max-height: 80vh; overflow-y: auto; }
    .modal-box h3 { margin-bottom: 16px; font-size: 18px; }
    .modal-box label { display: block; font-size: 13px; font-weight: 600; color: #555; margin-bottom: 4px; margin-top: 10px; }
    .modal-input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 4px; }
    .modal-actions { margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end; }
    .btn-primary { background: #1a237e; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-secondary { background: #f5f5f5; color: #333; border: 1px solid #ddd; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-danger { background: #c62828; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
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
    <button onclick="showTab('users')" id="tabUsers">👥 Users</button>
    <button onclick="showTab('sessions')" id="tabSessions">📋 Sessions</button>
    <button onclick="showTab('clubs')" id="tabClubs">🏛️ Clubs</button>
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
      <div style="margin-bottom:12px">
        <input id="userSearch" placeholder="Search users..." style="padding:8px 12px;border:1px solid #ddd;border-radius:6px;width:250px;font-size:14px" oninput="loadUsers()">
      </div>
      <div id="usersTable"><div class="loading">Loading...</div></div>
    </div>
    <!-- Edit User Modal -->
    <div id="userEditModal" class="modal hidden">
      <div class="modal-box">
        <h3>Edit User</h3>
        <input id="editUserId" type="hidden">
        <label>Name</label><input id="editUserName" class="modal-input">
        <label>Email</label><input id="editUserEmail" class="modal-input">
        <label>Phone</label><input id="editUserPhone" class="modal-input">
        <label>Role</label><select id="editUserRole" class="modal-input"><option value="PLAYER">PLAYER</option><option value="OWNER">OWNER</option><option value="ADMIN">ADMIN</option></select>
        <div class="modal-actions">
          <button onclick="saveUserEdit()" class="btn-primary">Save</button>
          <button onclick="closeModal('userEditModal')" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Sessions Tab -->
  <div id="sessionsTab" class="hidden">
    <div class="section">
      <h2>📋 All Sessions</h2>
      <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
        <input id="sessionSearch" placeholder="Search sessions..." style="padding:8px 12px;border:1px solid #ddd;border-radius:6px;width:250px;font-size:14px" oninput="loadSessions()">
        <select id="sessionStatusFilter" onchange="loadSessions()" style="padding:8px;border:1px solid #ddd;border-radius:6px">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div id="sessionsTable"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <!-- Clubs Tab -->
  <div id="clubsTab" class="hidden">
    <div class="section">
      <h2>🏛️ All Clubs</h2>
      <div id="clubsTable"><div class="loading">Loading...</div></div>
    </div>
    <!-- Club Detail Modal -->
    <div id="clubDetailModal" class="modal hidden">
      <div class="modal-box" style="max-width:600px">
        <h3 id="clubDetailTitle">Club Details</h3>
        <div id="clubDetailContent"></div>
        <div class="modal-actions">
          <button onclick="closeModal('clubDetailModal')" class="btn-secondary">Close</button>
        </div>
      </div>
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
      document.getElementById('sessionsTab').classList.toggle('hidden', tab !== 'sessions');
      document.getElementById('clubsTab').classList.toggle('hidden', tab !== 'clubs');
      document.getElementById('tabDashboard').classList.toggle('active', tab === 'dashboard');
      document.getElementById('tabUsers').classList.toggle('active', tab === 'users');
      document.getElementById('tabSessions').classList.toggle('active', tab === 'sessions');
      document.getElementById('tabClubs').classList.toggle('active', tab === 'clubs');
      if (tab === 'dashboard') loadStats();
      if (tab === 'users') loadUsers();
      if (tab === 'sessions') loadSessions();
      if (tab === 'clubs') loadClubs();
    }

    function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
    function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

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

    function editUser(id, name, email, phone, role) {
      document.getElementById('editUserId').value = id;
      document.getElementById('editUserName').value = name;
      document.getElementById('editUserEmail').value = email;
      document.getElementById('editUserPhone').value = phone || '';
      document.getElementById('editUserRole').value = role;
      openModal('userEditModal');
    }

    async function saveUserEdit() {
      const id = document.getElementById('editUserId').value;
      const res = await api('/api/v1/admin/users/' + id, 'PUT', {
        name: document.getElementById('editUserName').value,
        email: document.getElementById('editUserEmail').value,
        phone: document.getElementById('editUserPhone').value,
        role: document.getElementById('editUserRole').value,
      });
      if (res?.success) { closeModal('userEditModal'); loadUsers(); }
      else alert(res?.error?.message || 'Failed');
    }

    async function deleteUser(id, name) {
      if (!confirm('Permanently delete user "' + name + '"? This cannot be undone.')) return;
      const res = await api('/api/v1/admin/users/' + id, 'DELETE');
      if (res?.success) { alert(res.message); loadUsers(); }
      else alert(res?.error?.message || 'Failed');
    }

    async function promoteUser(userId, name) {
      if (!confirm('Promote ' + name + ' to admin?')) return;
      const res = await api('/api/v1/admin/users/' + userId + '/promote', 'PUT');
      if (res?.success) { alert(res.message); loadUsers(); }
    }

    async function demoteUser(userId, name) {
      if (!confirm('Remove admin privileges from ' + name + '?')) return;
      const res = await api('/api/v1/admin/users/' + userId + '/demote', 'PUT');
      if (res?.success) { alert(res.message); loadUsers(); }
    }

    async function loadSessions() {
      try {
        const search = document.getElementById('sessionSearch')?.value || '';
        const status = document.getElementById('sessionStatusFilter')?.value || '';
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        const { data } = await api('/api/v1/admin/sessions?' + params.toString());
        if (!data) return;

        const badge = s => ({ ACTIVE: 'badge-active', COMPLETED: 'badge-completed', CANCELLED: 'badge-cancelled' }[s.status] || '');
        document.getElementById('sessionsTable').innerHTML =
          '<p style="margin-bottom:12px;color:#666;font-size:13px">Total: ' + data.total + ' sessions</p>' +
          '<table><thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Owner</th><th>Players</th><th>Games</th><th>Sport</th><th>Created</th><th>Actions</th></tr></thead><tbody>' +
          data.sessions.map(s => '<tr>' +
            '<td><strong>' + s.name + '</strong></td>' +
            '<td><code>' + s.shareCode + '</code></td>' +
            '<td><span class="badge ' + badge(s) + '">' + s.status + '</span></td>' +
            '<td>' + s.ownerName + '</td>' +
            '<td>' + s.playerCount + '</td>' +
            '<td>' + s.gameCount + '</td>' +
            '<td>' + (s.sport || '-') + '</td>' +
            '<td>' + new Date(s.createdAt).toLocaleDateString() + '</td>' +
            '<td>' +
              (s.status !== 'CANCELLED' ? '<button class="action-btn demote" onclick="cancelSession(\'' + s.id + '\',\'' + s.name.replace(/'/g, "\\'") + '\')">Cancel</button>' : '') +
            '</td>' +
          '</tr>').join('') +
          '</tbody></table>';
      } catch(e) { console.error(e); }
    }

    async function cancelSession(id, name) {
      if (!confirm('Cancel session "' + name + '"? This marks it as CANCELLED.')) return;
      const res = await api('/api/v1/admin/sessions/' + id, 'DELETE');
      if (res?.success) { alert(res.message); loadSessions(); }
      else alert(res?.error?.message || 'Failed');
    }

    async function loadClubs() {
      try {
        const { data } = await api('/api/v1/admin/clubs');
        if (!data) return;

        document.getElementById('clubsTable').innerHTML =
          '<p style="margin-bottom:12px;color:#666;font-size:13px">Total: ' + data.total + ' clubs</p>' +
          '<table><thead><tr><th>Name</th><th>Owner</th><th>Members</th><th>Sessions</th><th>Created</th><th>Actions</th></tr></thead><tbody>' +
          data.clubs.map(c => '<tr>' +
            '<td><strong>' + c.name + '</strong></td>' +
            '<td><code>' + (c.ownerDeviceId || '-').substring(0,12) + '</code></td>' +
            '<td>' + c.memberCount + '</td>' +
            '<td>' + c.sessionCount + '</td>' +
            '<td>' + new Date(c.createdAt).toLocaleDateString() + '</td>' +
            '<td><button class="action-btn promote" onclick="viewClub(\'' + c.id + '\')">View</button></td>' +
          '</tr>').join('') +
          '</tbody></table>';
      } catch(e) { console.error(e); }
    }

    async function viewClub(clubId) {
      try {
        const { data } = await api('/api/v1/admin/clubs/' + clubId);
        if (!data) return;
        const c = data.club;

        const roleBadge = r => r === 'ADMIN' ? 'badge-admin' : 'badge-player';
        document.getElementById('clubDetailTitle').textContent = c.name;
        document.getElementById('clubDetailContent').innerHTML =
          '<p style="color:#666;margin-bottom:12px">' + (c.description || 'No description') + '</p>' +
          '<p style="margin-bottom:8px"><strong>Members:</strong> ' + c._count.members + ' | <strong>Sessions:</strong> ' + c._count.sessions + '</p>' +
          '<h4 style="margin-top:16px;margin-bottom:8px">Club Members</h4>' +
          '<table><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead><tbody>' +
          c.members.map(m => '<tr>' +
            '<td>' + m.name + '</td>' +
            '<td><span class="badge ' + roleBadge(m.role) + '">' + m.role + '</span></td>' +
            '<td>' + new Date(m.joinedAt).toLocaleDateString() + '</td>' +
            '<td>' +
              (m.role === 'ADMIN'
                ? '<button class="action-btn demote" onclick="changeMemberRole(\'' + clubId + '\',\'' + m.id + '\',\'MEMBER\')">Demote to Member</button>'
                : '<button class="action-btn promote" onclick="changeMemberRole(\'' + clubId + '\',\'' + m.id + '\',\'ADMIN\')">Promote to Admin</button>') +
            '</td>' +
          '</tr>').join('') +
          '</tbody></table>' +
          '<h4 style="margin-top:16px;margin-bottom:8px">Club Sessions</h4>' +
          '<table><thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
          c.sessions.map(s => '<tr>' +
            '<td>' + s.name + '</td>' +
            '<td><code>' + s.shareCode + '</code></td>' +
            '<td>' + s.status + '</td>' +
            '<td>' + new Date(s.scheduledAt).toLocaleDateString() + '</td>' +
          '</tr>').join('') +
          '</tbody></table>';

        openModal('clubDetailModal');
      } catch(e) { console.error(e); }
    }

    async function changeMemberRole(clubId, memberId, role) {
      const res = await api('/api/v1/admin/clubs/' + clubId + '/members/' + memberId, 'PUT', { role });
      if (res?.success) { alert(res.message); viewClub(clubId); }
      else alert(res?.error?.message || 'Failed');
    }

    // Initial load
    loadStats();
    setInterval(() => {
      if (currentTab === 'dashboard') loadStats();
      if (currentTab === 'sessions') loadSessions();
    }, 30000);
    document.getElementById('updateTime').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  </script>
</body>
</html>`);
});

export default router;
