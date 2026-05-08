import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';

const router = Router();

// Shareable session card — optimized for WhatsApp / WeChat sharing
router.get('/s/:shareCode', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' },
          select: { id: true, name: true, skillLevel: true, status: true, gamesPlayed: true, wins: true },
        },
        games: {
          where: { status: 'IN_PROGRESS' },
          orderBy: { gameNumber: 'desc' },
        },
      },
    });

    if (!session) {
      return res.status(404).send('Session not found');
    }

    const playerCount = session.players.length;
    const activePlayers = session.players.filter(p => p.status === 'ACTIVE');
    const restingPlayers = session.players.filter(p => p.status === 'RESTING');
    const date = new Date(session.scheduledAt);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const skillEmoji = (level: any) => {
      if (!level) return '⚪';
      if (level <= 3) return '🟢';
      if (level <= 6) return '🟡';
      return '🔴';
    };

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const joinUrl = `${appUrl}/join/${shareCode}`;
    const cardTitle = `🎯 Game Plan: ${session.name}`;
    const cardDesc = `${dayName} at ${timeStr} · ${session.location || 'Location TBD'} · ${playerCount} players`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${cardTitle}</title>

  <!-- Open Graph for WhatsApp / WeChat / Facebook rich preview -->
  <meta property="og:title" content="${cardTitle}" />
  <meta property="og:description" content="${cardDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${joinUrl}" />
  <meta property="og:site_name" content="BadmintonGroup" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${cardTitle}" />
  <meta name="twitter:description" content="${cardDesc}" />

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
    }
    .card-header {
      background: linear-gradient(135deg, #1a237e, #0d47a1);
      color: #fff;
      padding: 28px 24px 20px;
      text-align: center;
    }
    .card-header .icon { font-size: 48px; margin-bottom: 8px; }
    .card-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .card-header .subtitle { font-size: 13px; opacity: 0.8; }
    .card-body { padding: 20px 24px; }
    .info-row {
      display: flex;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 15px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-icon { font-size: 22px; margin-right: 12px; width: 28px; text-align: center; }
    .info-label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { color: #333; font-weight: 600; }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 16px 0 8px;
      padding-top: 12px;
      border-top: 2px solid #f0f0f0;
    }
    .player-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .player-tag {
      background: #f5f5f5;
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .player-tag.resting { background: #fff3e0; text-decoration: line-through; opacity: 0.6; }
    .game-card {
      background: #f8f9ff;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 8px;
      border-left: 4px solid #667eea;
    }
    .game-card .teams { font-size: 14px; font-weight: 600; color: #333; }
    .game-card .court { font-size: 12px; color: #888; margin-top: 2px; }
    .card-footer { padding: 16px 24px 24px; text-align: center; }
    .join-btn {
      display: block;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff;
      text-decoration: none;
      font-size: 18px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: transform 0.2s;
    }
    .join-btn:active { transform: scale(0.97); }
    .powered-by { text-align: center; color: rgba(255,255,255,0.6); font-size: 11px; margin-top: 16px; }
    .powered-by a { color: rgba(255,255,255,0.8); text-decoration: none; }
    .badge {
      display: inline-block;
      background: #e8f5e9;
      color: #2e7d32;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="icon">🏸</div>
      <h1>${session.name}</h1>
      <div class="subtitle">Game Plan · ${dateStr}</div>
    </div>

    <div class="card-body">
      <div class="info-row">
        <span class="info-icon">📅</span>
        <div>
          <div class="info-label">Date & Time</div>
          <div class="info-value">${dayName}, ${dateStr} at ${timeStr}</div>
        </div>
      </div>

      <div class="info-row">
        <span class="info-icon">📍</span>
        <div>
          <div class="info-label">Location</div>
          <div class="info-value">${session.location || 'To be announced'}</div>
        </div>
      </div>

      <div class="info-row">
        <span class="info-icon">👥</span>
        <div>
          <div class="info-label">Players</div>
          <div class="info-value">${playerCount} / ${session.maxPlayers} <span class="badge">${session.maxPlayers - playerCount} spots left</span></div>
        </div>
      </div>

      ${activePlayers.length > 0 ? `
      <div class="section-title">👟 Active Players (${activePlayers.length})</div>
      <div class="player-list">
        ${activePlayers.map(p => `<span class="player-tag">${skillEmoji(p.skillLevel)} ${p.name}</span>`).join('')}
      </div>
      ` : ''}

      ${restingPlayers.length > 0 ? `
      <div class="section-title">😴 Resting (${restingPlayers.length})</div>
      <div class="player-list">
        ${restingPlayers.map(p => `<span class="player-tag resting">${p.name}</span>`).join('')}
      </div>
      ` : ''}

      ${session.games.length > 0 ? `
      <div class="section-title">🏟️ Court Assignments</div>
      ${session.games.map(g => `
        <div class="game-card">
          <div class="teams">${g.team1Player1} & ${g.team1Player2} vs ${g.team2Player1} & ${g.team2Player2}</div>
          <div class="court">${g.courtName || 'Court 1'}</div>
        </div>
      `).join('')}
      </div>
      ` : ''}
    </div>

    <div class="card-footer">
      <a href="${joinUrl}" class="join-btn">🎯 Join Game</a>
    </div>
  </div>

  <div class="powered-by">
    Shared via <a href="${appUrl}">BadmintonGroup</a> — The easiest way to organize games
  </div>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    console.error('Share card error:', error);
    res.status(500).send('Failed to load session card');
  }
});

export default router;
