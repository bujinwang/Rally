import { Server as SocketServer } from 'socket.io';
import { prisma } from './database';

export const setupSocket = (io: SocketServer): void => {
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Join session room
    socket.on('join-session', async (data: string | { shareCode: string; deviceId: string }) => {
      const sessionId = typeof data === 'string' ? data : data.shareCode;
      socket.join(`session-${sessionId}`);
      console.log(`👤 User ${socket.id} joined session ${sessionId}`);

      // Notify others in the session
      socket.to(`session-${sessionId}`).emit('user-joined', {
        socketId: socket.id,
        sessionId: sessionId,
        timestamp: new Date().toISOString()
      });
    });

    // Leave session room
    socket.on('leave-session', (data: string | { shareCode: string }) => {
      const sessionId = typeof data === 'string' ? data : data.shareCode;
      socket.leave(`session-${sessionId}`);
      console.log(`👤 User ${socket.id} left session ${sessionId}`);
    });

    // MVP Player status updates
    socket.on('mvp-player-status-update', async (data) => {
      const { shareCode, playerId, status } = data;

      try {
        // Update MVP player status in database
        await prisma.mvpPlayer.update({
          where: { id: playerId },
          data: { status }
        });

        // Get updated session data
        const session = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: { players: true }
        });

        if (session) {
          // Broadcast to session room using shareCode
          io.to(`session-${shareCode}`).emit('mvp-session-updated', {
            session,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error updating MVP player status:', error);
        socket.emit('error', { message: 'Failed to update player status' });
      }
    });

    // MVP Player joined session
    socket.on('mvp-player-joined', async (data) => {
      const { shareCode, player } = data;
      
      try {
        // Get updated session data
        // Fix for line ~40 (mvp-player-status-updated)
        const session = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: { 
            players: {
              select: {
                id: true,
                name: true,
                deviceId: true,  // ✅ Add this
                status: true,
                gamesPlayed: true,
                wins: true,
                losses: true,
                joinedAt: true
              }
            }
          }
        });
        
        // Fix for line ~65 (mvp-player-joined)
        const updatedSession = await prisma.mvpSession.findUnique({
          where: { shareCode },
          include: { 
            players: {
              select: {
                id: true,
                name: true,
                deviceId: true,  // ✅ Add this
                status: true,
                gamesPlayed: true,
                wins: true,
                losses: true,
                joinedAt: true
              }
            }
          }
        });

        if (updatedSession) {
          // Broadcast to session room
          io.to(`session-${shareCode}`).emit('mvp-session-updated', {
            session: updatedSession,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling player joined:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 User disconnected:', socket.id);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('📡 Socket.io server initialized');
};