import { Server as SocketServer } from 'socket.io';
import { prisma } from './database';

export const setupSocket = (io: SocketServer): void => {
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Join session room
    socket.on('join-session', async (sessionId: string) => {
      socket.join(`session-${sessionId}`);
      console.log(`👤 User ${socket.id} joined session ${sessionId}`);

      // Notify others in the session
      socket.to(`session-${sessionId}`).emit('user-joined', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    // Leave session room
    socket.on('leave-session', (sessionId: string) => {
      socket.leave(`session-${sessionId}`);
      console.log(`👤 User ${socket.id} left session ${sessionId}`);
    });

    // Player status updates
    socket.on('player-status-update', async (data) => {
      const { sessionId, playerId, status } = data;

      // Update player status in database
      try {
        await prisma.sessionPlayer.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: playerId
            }
          },
          data: { status }
        });

        // Broadcast to session
        io.to(`session-${sessionId}`).emit('player-status-updated', {
          playerId,
          status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error updating player status:', error);
        socket.emit('error', { message: 'Failed to update player status' });
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