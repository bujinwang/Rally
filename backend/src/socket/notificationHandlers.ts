import { Server as SocketIOServer } from 'socket.io';
import { notifySessionSubscribers, notifyPlayer } from '../utils/notificationHelper';

/**
 * Setup notification event handlers for Socket.io
 */
export function setupNotificationHandlers(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log('📱 Client connected for notifications:', socket.id);

    // Join session room for notifications
    socket.on('join_session', async (data: { shareCode: string; deviceId: string }) => {
      const { shareCode, deviceId } = data;
      socket.join(`session-${shareCode}`);
      socket.join(`device-${deviceId}`);
      
      console.log(`📱 Device ${deviceId} joined session ${shareCode} for notifications`);
    });

    // Leave session room
    socket.on('leave_session', (data: { shareCode: string; deviceId: string }) => {
      const { shareCode, deviceId } = data;
      socket.leave(`session-${shareCode}`);
      socket.leave(`device-${deviceId}`);
      
      console.log(`📱 Device ${deviceId} left session ${shareCode}`);
    });

    socket.on('disconnect', () => {
      console.log('📱 Client disconnected:', socket.id);
    });
  });
}

/**
 * Emit game ready notification
 */
export function emitGameReady(
  io: SocketIOServer,
  shareCode: string,
  data: {
    gameId: string;
    players: string[];
    courtName: string;
  }
) {
  io.to(`session-${shareCode}`).emit('game_ready', {
    type: 'GAME_READY',
    title: '🏸 Your Game is Ready!',
    body: `Court ${data.courtName}: ${data.players.join(', ')}`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted game_ready to session ${shareCode}`);
}

/**
 * Emit rest request approved notification
 */
export function emitRestApproved(
  io: SocketIOServer,
  shareCode: string,
  deviceId: string,
  data: {
    playerName: string;
    duration: number;
  }
) {
  io.to(`device-${deviceId}`).emit('rest_approved', {
    type: 'REST_APPROVED',
    title: '✅ Rest Request Approved',
    body: `${data.playerName}, your rest request (${data.duration} min) has been approved`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted rest_approved to device ${deviceId}`);
}

/**
 * Emit rest request denied notification
 */
export function emitRestDenied(
  io: SocketIOServer,
  shareCode: string,
  deviceId: string,
  data: {
    playerName: string;
    reason?: string;
  }
) {
  io.to(`device-${deviceId}`).emit('rest_denied', {
    type: 'REST_DENIED',
    title: '❌ Rest Request Denied',
    body: data.reason || `${data.playerName}, your rest request was denied`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted rest_denied to device ${deviceId}`);
}

/**
 * Emit score recorded notification
 */
export function emitScoreRecorded(
  io: SocketIOServer,
  shareCode: string,
  data: {
    matchId: string;
    matchNumber: number;
    team1Score: number;
    team2Score: number;
    players: string[];
  }
) {
  io.to(`session-${shareCode}`).emit('score_recorded', {
    type: 'SCORE_RECORDED',
    title: '🎯 Score Recorded',
    body: `Match #${data.matchNumber}: ${data.team1Score}-${data.team2Score}`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted score_recorded to session ${shareCode}`);
}

/**
 * Emit next up notification
 */
export function emitNextUp(
  io: SocketIOServer,
  shareCode: string,
  deviceId: string,
  data: {
    playerName: string;
    position: number;
  }
) {
  io.to(`device-${deviceId}`).emit('next_up', {
    type: 'NEXT_UP',
    title: "🎾 You're Up Next!",
    body: `${data.playerName}, you're #${data.position} in the queue`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted next_up to device ${deviceId}`);
}

/**
 * Emit session starting notification
 */
export function emitSessionStarting(
  io: SocketIOServer,
  shareCode: string,
  data: {
    sessionName: string;
    minutesUntilStart: number;
  }
) {
  io.to(`session-${shareCode}`).emit('session_starting', {
    type: 'SESSION_STARTING',
    title: '⏰ Session Starting Soon',
    body: `${data.sessionName} starts in ${data.minutesUntilStart} minutes`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted session_starting to session ${shareCode}`);
}

/**
 * Emit session updated notification
 */
export function emitSessionUpdated(
  io: SocketIOServer,
  shareCode: string,
  data: {
    sessionName: string;
    updateType: string;
    details: string;
  }
) {
  io.to(`session-${shareCode}`).emit('session_updated', {
    type: 'SESSION_UPDATED',
    title: `📢 ${data.sessionName} Updated`,
    body: `${data.updateType}: ${data.details}`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted session_updated to session ${shareCode}`);
}

/**
 * Emit player joined notification
 */
export function emitPlayerJoined(
  io: SocketIOServer,
  shareCode: string,
  data: {
    playerName: string;
    sessionName: string;
  }
) {
  io.to(`session-${shareCode}`).emit('player_joined', {
    type: 'PLAYER_JOINED',
    title: '👋 New Player Joined',
    body: `${data.playerName} joined ${data.sessionName}`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted player_joined to session ${shareCode}`);
}

/**
 * Emit pairing generated notification
 */
export function emitPairingGenerated(
  io: SocketIOServer,
  shareCode: string,
  data: {
    newGamesCount: number;
  }
) {
  io.to(`session-${shareCode}`).emit('pairing_generated', {
    type: 'PAIRING_GENERATED',
    title: '🎯 New Pairings Generated',
    body: `${data.newGamesCount} new ${data.newGamesCount === 1 ? 'game' : 'games'} created`,
    data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted pairing_generated to session ${shareCode}`);
}

// Export all notification emitters
export const NotificationEmitters = {
  emitGameReady,
  emitRestApproved,
  emitRestDenied,
  emitScoreRecorded,
  emitNextUp,
  emitSessionStarting,
  emitSessionUpdated,
  emitPlayerJoined,
  emitPairingGenerated,
};
