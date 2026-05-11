import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';

const router = Router();

// ── OG Image generator (for WeChat / WhatsApp rich preview) ──

router.get('/s/:shareCode/og-image', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;

    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      select: { name: true, scheduledAt: true, location: true, maxPlayers: true, players: { select: { name: true, status: true } } },
    });

    if (!session) return res.status(404).send('Session not found');

    const playerCount = session.players.length;
    const activePlayers = session.players.filter(p => p.status === 'ACTIVE');
    const date = new Date(session.scheduledAt);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dayShort = dayName.substring(0, 3);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const playerNames = activePlayers.slice(0, 4).map(p => p.name).join(', ');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a237e"/>
      <stop offset="100%" stop-color="#0d47a1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Badminton icon -->
  <text x="600" y="100" text-anchor="middle" font-size="72">🏸</text>
  
  <!-- Session name -->
  <text x="600" y="200" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white">
    ${session.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}
  </text>
  
  <!-- Date & Time -->
  <text x="600" y="275" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" fill="rgba(255,255,255,0.9)">
    ${dayShort} ${dateStr} at ${timeStr}
  </text>
  
  <!-- Location & Players -->
  <text x="600" y="335" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">
    📍 ${session.location || 'TBD'}  ·  👥 ${playerCount} players
  </text>

  ${playerNames ? `<text x="600" y="390" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">
    ${playerNames}
  </text>` : ''}
  
  <!-- Bottom bar -->
  <rect x="0" y="500" width="1200" height="130" fill="rgba(0,0,0,0.15)"/>
  <text x="600" y="565" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">
    Scan to join · ${shareCode.toUpperCase()}
  </text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (error) {
    console.error('OG image error:', error);
    res.status(500).send('Failed to generate preview');
  }
});

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

    const appUrl = (process.env.FRONTEND_URL || process.env.API_URL || 'https://badminton-group.app').replace(/\/$/, '');
    const joinUrl = `${appUrl}/join/${shareCode}`;
    const shareCardUrl = `${appUrl}/s/${shareCode}`;
    const cardTitle = `${session.name}`;
    const cardDesc = `${dayName} at ${timeStr} · ${session.location || 'Location TBD'}`;
    const playerNames = session.players.filter(p => p.status === 'ACTIVE').slice(0, 5).map(p => p.name).join(' ');
    const ogTitle = `${session.name} — ${dayName} ${timeStr} · ${session.location || ''}`;
    const ogDesc = `${playerCount} players 🔸 ${playerNames || 'Join us!'}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${cardTitle}</title>

  <!-- Open Graph for WhatsApp / WeChat / Facebook rich preview -->
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${shareCardUrl}" />
  <meta property="og:image" content="${appUrl}/s/${shareCode}/og-image" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="Rally" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDesc}" />

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
      ${playerCount > 0 ? `
      <div style="text-align:center; margin-bottom:16px;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}" 
             alt="Scan to join" width="180" height="180" style="border-radius:12px;" />
        <div style="font-size:12px; color:#999; margin-top:6px;">📱 Scan QR to join</div>
      </div>
      ` : ''}
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
    Shared via <a href="${appUrl}">Rally</a> — The easiest way to organize games
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
