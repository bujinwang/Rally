import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateDeviceFingerprint, CLIENT_FINGERPRINT_SCRIPT } from '../utils/deviceFingerprint';

const router = Router();
const prisma = new PrismaClient();

/**
 * Web interface for session management
 * GET /session/:shareCode
 */
router.get('/:shareCode', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const clientFingerprint = req.query.fp as string;

    // Find the session
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            deviceId: true,
            status: true,
            joinedAt: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Session Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
            .error { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1 class="error">Session Not Found</h1>
          <p>The session link you're looking for doesn't exist or has been removed.</p>
        </body>
        </html>
      `);
    }

    // Generate device fingerprint
    const deviceId = generateDeviceFingerprint(req, clientFingerprint);
    
    // Check if this device has already joined the session
    const existingPlayer = session.players.find(p => p.deviceId === deviceId && p.status === 'ACTIVE');

    // Generate the HTML response
    const html = generateSessionHTML(session, existingPlayer, deviceId);
    
    res.send(html);
  } catch (error) {
    console.error('Error serving web session:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          .error { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1 class="error">Something went wrong</h1>
        <p>Please try refreshing the page or contact the session organizer.</p>
      </body>
      </html>
    `);
  }
});

/**
 * API endpoint for device-based player lookup
 * GET /session/:shareCode/player-status
 */
router.get('/:shareCode/player-status', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const clientFingerprint = req.query.fp as string;
    
    if (!clientFingerprint) {
      return res.status(400).json({
        success: false,
        error: 'Client fingerprint required'
      });
    }

    // Generate device fingerprint
    const deviceId = generateDeviceFingerprint(req, clientFingerprint);

    // Find the session and player
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode },
      include: {
        players: {
          where: { deviceId },
          select: {
            id: true,
            name: true,
            status: true,
            joinedAt: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const player = session.players[0];

    res.json({
      success: true,
      session: {
        name: session.name,
        scheduledAt: session.scheduledAt,
        location: session.location,
        maxPlayers: session.maxPlayers,
        shareCode: session.shareCode
      },
      player: player ? {
        id: player.id,
        name: player.name,
        status: player.status,
        joinedAt: player.joinedAt
      } : null,
      deviceId
    });
  } catch (error) {
    console.error('Error getting player status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * API endpoint to join session
 * POST /session/:shareCode/join
 */
router.post('/:shareCode/join', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const { name, deviceId } = req.body;
    
    if (!name || !deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Name and device ID are required'
      });
    }

    // Find the session
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if player already exists
    const existingPlayer = await prisma.mvpPlayer.findFirst({
      where: {
        sessionId: session.id,
        deviceId,
        status: 'ACTIVE'
      }
    });

    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        error: 'You are already registered for this session'
      });
    }

    // Create new player
    const newPlayer = await prisma.mvpPlayer.create({
      data: {
        sessionId: session.id,
        name,
        deviceId,
        status: 'ACTIVE'
      }
    });

    res.json({
      success: true,
      message: 'Successfully joined the session',
      player: {
        id: newPlayer.id,
        name: newPlayer.name,
        status: newPlayer.status
      }
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * API endpoint to leave session
 * DELETE /session/:shareCode/leave
 */
router.delete('/:shareCode/leave', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const clientFingerprint = req.body.deviceFingerprint || req.query.fp as string;
    
    if (!clientFingerprint) {
      return res.status(400).json({
        success: false,
        error: 'Device fingerprint required'
      });
    }

    // Generate device fingerprint
    const deviceId = generateDeviceFingerprint(req, clientFingerprint);

    // Find the session and player
    const session = await prisma.mvpSession.findUnique({
      where: { shareCode }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const player = await prisma.mvpPlayer.findFirst({
      where: {
        sessionId: session.id,
        deviceId,
        status: 'ACTIVE'
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'You are not currently registered for this session'
      });
    }

    // Update player status to LEFT
    await prisma.mvpPlayer.update({
      where: { id: player.id },
      data: { status: 'LEFT' }
    });

    res.json({
      success: true,
      message: 'Successfully left the session',
      playerName: player.name
    });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Generate HTML for the session management interface
 */
function generateSessionHTML(session: any, existingPlayer: any, deviceId: string): string {
  const playerCount = session.players.filter((p: any) => p.status === 'ACTIVE').length;
  const isJoined = !!existingPlayer;
  const shareCode = session.shareCode;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${session.name} - BadmintonGroup</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
          color: #333;
        }
        
        .container {
          max-width: 400px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          overflow: hidden;
          animation: slideUp 0.5s ease-out;
        }
        
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 24px 20px;
          text-align: center;
        }
        
        .header h1 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .header p {
          opacity: 0.9;
          font-size: 14px;
        }
        
        .content {
          padding: 24px 20px;
        }
        
        .session-info {
          margin-bottom: 24px;
        }
        
        .info-item {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          color: #666;
        }
        
        .info-icon {
          width: 16px;
          height: 16px;
          margin-right: 12px;
          opacity: 0.7;
        }
        
        .status-card {
          background: ${isJoined ? '#d4edda' : '#e3f2fd'};
          border: 1px solid ${isJoined ? '#c3e6cb' : '#bbdefb'};
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .status-title {
          font-weight: 600;
          color: ${isJoined ? '#155724' : '#1565c0'};
          margin-bottom: 8px;
        }
        
        .status-subtitle {
          color: ${isJoined ? '#155724' : '#1565c0'};
          font-size: 14px;
          opacity: 0.8;
        }
        
        .button {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 12px;
        }
        
        .button-primary {
          background: #e74c3c;
          color: white;
        }
        
        .button-primary:hover {
          background: #c0392b;
          transform: translateY(-2px);
        }
        
        .button-secondary {
          background: #f8f9fa;
          color: #666;
          border: 1px solid #dee2e6;
        }
        
        .button-secondary:hover {
          background: #e9ecef;
        }
        
        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }
        
        .loading {
          display: none;
          text-align: center;
          color: #666;
        }
        
        .error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          display: none;
        }
        
        .success {
          background: #d1ecf1;
          border: 1px solid #bee5eb;
          color: #0c5460;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          display: none;
        }
        
        .footer {
          padding: 16px 20px;
          background: #f8f9fa;
          border-top: 1px solid #dee2e6;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        
        @media (max-width: 480px) {
          .container {
            margin: 10px;
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏸 ${session.name}</h1>
          <p>Badminton Session</p>
        </div>
        
        <div class="content">
          <div class="session-info">
            <div class="info-item">
              <span class="info-icon">📅</span>
              ${new Date(session.scheduledAt).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            ${session.location ? `
            <div class="info-item">
              <span class="info-icon">📍</span>
              ${session.location}
            </div>
            ` : ''}
            <div class="info-item">
              <span class="info-icon">👥</span>
              ${playerCount} / ${session.maxPlayers} players registered
            </div>
          </div>
          
          <div id="status-card" class="status-card">
            ${isJoined ? `
            <div class="status-title">✅ You're registered!</div>
            <div class="status-subtitle">Registered as: <strong>${existingPlayer.name}</strong></div>
            ` : `
            <div class="status-title">👋 Join this session</div>
            <div class="status-subtitle">Enter your name to register</div>
            `}
          </div>
          
          <div class="error" id="error-message"></div>
          <div class="success" id="success-message"></div>
          
          <div id="action-section">
            ${isJoined ? `
            <button class="button button-primary" onclick="leaveSession()">
              Leave Session
            </button>
            <button class="button button-secondary" onclick="refreshStatus()">
              Refresh Status
            </button>
            ` : `
            <div style="margin-bottom: 16px;">
              <input type="text" id="player-name" placeholder="Enter your name" 
                     style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;">
            </div>
            <button class="button button-primary" onclick="joinSession()" id="join-btn">
              Join Session
            </button>
            `}
          </div>
          
          <div class="loading" id="loading">
            <p>⏳ Processing...</p>
          </div>
        </div>
        
        <div class="footer">
          Powered by BadmintonGroup
        </div>
      </div>
      
      <script>
        // Force redirect to HTTP if accessed via HTTPS (development only)
        if (window.location.protocol === 'https:' && window.location.hostname === 'localhost') {
          window.location.replace('http://localhost:3001' + window.location.pathname);
        }
        
        ${CLIENT_FINGERPRINT_SCRIPT}
        
        let deviceFingerprint = null;
        
        // Generate device fingerprint on page load
        window.onload = function() {
          try {
            deviceFingerprint = generateDeviceFingerprint();
            console.log('Device fingerprint generated');
          } catch (error) {
            console.error('Error generating device fingerprint:', error);
            deviceFingerprint = 'fallback-' + Date.now();
          }
        };
        
        function showLoading(show) {
          document.getElementById('loading').style.display = show ? 'block' : 'none';
          document.getElementById('action-section').style.display = show ? 'none' : 'block';
        }
        
        function showError(message) {
          const errorEl = document.getElementById('error-message');
          errorEl.textContent = message;
          errorEl.style.display = 'block';
          document.getElementById('success-message').style.display = 'none';
        }
        
        function showSuccess(message) {
          const successEl = document.getElementById('success-message');
          successEl.textContent = message;
          successEl.style.display = 'block';
          document.getElementById('error-message').style.display = 'none';
        }
        
        function hideMessages() {
          document.getElementById('error-message').style.display = 'none';
          document.getElementById('success-message').style.display = 'none';
        }
        
        async function leaveSession() {
           if (!deviceFingerprint) {
             showError('Device identification failed. Please refresh the page.');
             return;
           }

           if (!confirm('Are you sure you want to leave this session?')) {
             return;
           }

           showLoading(true);
           hideMessages();

           try {
             const response = await fetch('./leave', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                deviceFingerprint: deviceFingerprint
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              showSuccess('Successfully left the session!');
              setTimeout(() => {
                location.reload();
              }, 1500);
            } else {
              showError(data.error || 'Failed to leave session');
            }
          } catch (error) {
            showError('Network error. Please try again.');
          } finally {
            showLoading(false);
          }
        }
        
        async function joinSession() {
          const playerName = document.getElementById('player-name').value.trim();
          
          if (!playerName) {
            showError('Please enter your name');
            return;
          }
          
          if (!deviceFingerprint) {
            showError('Device identification failed. Please refresh the page.');
            return;
          }
          
          showLoading(true);
          hideMessages();
          
          try {
            const response = await fetch('./join', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: playerName,
                deviceId: deviceFingerprint
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              showSuccess('Successfully joined the session!');
              setTimeout(() => {
                location.reload();
              }, 1500);
            } else {
              showError(data.error || 'Failed to join session');
            }
          } catch (error) {
            showError('Network error. Please try again.');
          } finally {
            showLoading(false);
          }
        }
        
        async function refreshStatus() {
          if (!deviceFingerprint) {
            showError('Device identification failed. Please refresh the page.');
            return;
          }
          
          showLoading(true);
          hideMessages();
          
          try {
            const response = await fetch('./player-status?fp=' + deviceFingerprint);
            const data = await response.json();
            
            if (data.success) {
              location.reload();
            } else {
              showError(data.error || 'Failed to refresh status');
            }
          } catch (error) {
            showError('Network error. Please try again.');
          } finally {
            showLoading(false);
          }
        }
      </script>
    </body>
    </html>
  `;
}

export default router;