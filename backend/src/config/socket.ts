import { Server as SocketServer } from 'socket.io';
import { prisma } from './database';
import { cacheService } from '../services/cacheService';

// Helper function to get nearby sessions
const getNearbySessions = async (latitude: number, longitude: number, radius: number) => {
  // Calculate bounding box for rough filtering (Haversine formula approximation)
  const latDelta = radius / 111.32; // ~111.32 km per degree latitude
  const lngDelta = radius / (111.32 * Math.cos(latitude * Math.PI / 180));

  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLng = longitude - lngDelta;
  const maxLng = longitude + lngDelta;

  const sessions = await prisma.mvpSession.findMany({
    where: {
      latitude: { gte: minLat, lte: maxLat },
      longitude: { gte: minLng, lte: maxLng },
      status: 'ACTIVE',
      visibility: 'PUBLIC'
    },
    include: {
      players: {
        select: {
          id: true,
          name: true,
          status: true,
          joinedAt: true
        }
      },
      _count: {
        select: { players: true }
      }
    },
    orderBy: {
      scheduledAt: 'asc'
    },
    take: 20 // Limit results for performance
  });

  // Filter by exact distance using Haversine formula
  const EARTH_RADIUS = 6371; // km
  const sessionsWithDistance = sessions.map(session => {
    // Type assertion for latitude/longitude fields
    const sessionLat = (session as any).latitude;
    const sessionLng = (session as any).longitude;

    if (!sessionLat || !sessionLng) return null; // Skip sessions without coordinates

    const dLat = (sessionLat - latitude) * Math.PI / 180;
    const dLng = (sessionLng - longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(latitude * Math.PI / 180) * Math.cos(sessionLat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = EARTH_RADIUS * c;

    return {
      ...session,
      distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
      playerCount: (session as any)._count.players
    };
  }).filter((session): session is NonNullable<typeof session> =>
    session !== null && session.distance <= radius
  ).sort((a, b) => a.distance - b.distance);

  return sessionsWithDistance;
};

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

    // Join discovery location room for real-time updates
    socket.on('join-discovery', async (data: { latitude: number; longitude: number; radius?: number }) => {
      const { latitude, longitude, radius = 10 } = data; // Default 10km radius

      // Create location-based room key (rounded to reduce room fragmentation)
      const latKey = Math.round(latitude * 10) / 10; // Round to 1 decimal place
      const lngKey = Math.round(longitude * 10) / 10;
      const roomKey = `discovery-${latKey}-${lngKey}-${radius}`;

      socket.join(roomKey);
      console.log(`📍 User ${socket.id} joined discovery room: ${roomKey}`);

      // Send current nearby sessions
      try {
        const nearbySessions = await getNearbySessions(latitude, longitude, radius);
        socket.emit('discovery:sessions', {
          sessions: nearbySessions,
          location: { latitude, longitude },
          radius,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error sending nearby sessions:', error);
      }
    });

    // Leave discovery room
    socket.on('leave-discovery', (data: { latitude: number; longitude: number; radius?: number }) => {
      const { latitude, longitude, radius = 10 } = data;
      const latKey = Math.round(latitude * 10) / 10;
      const lngKey = Math.round(longitude * 10) / 10;
      const roomKey = `discovery-${latKey}-${lngKey}-${radius}`;

      socket.leave(roomKey);
      console.log(`📤 User ${socket.id} left discovery room: ${roomKey}`);
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
          include: {
            players: {
              select: {
                id: true,
                name: true,
                deviceId: true,
                status: true,
                gamesPlayed: true,
                wins: true,
                losses: true,
                joinedAt: true
              }
            }
          }
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
                deviceId: true,
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
                deviceId: true,
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

    // Discovery real-time events
    socket.on('session:created', async (data) => {
      const { sessionId, shareCode } = data;

      try {
        // Get the new session data
        const session = await prisma.mvpSession.findUnique({
          where: { id: sessionId },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                status: true,
                joinedAt: true
              }
            },
            _count: {
              select: { players: true }
            }
          }
        });

        if (session && (session as any).latitude && (session as any).longitude && (session as any).visibility === 'PUBLIC') {
          // Broadcast to nearby users in discovery rooms
          const nearbyUsers = await getNearbyUsers((session as any).latitude, (session as any).longitude, 10); // 10km radius
          nearbyUsers.forEach(userRoom => {
            io.to(userRoom).emit('discovery:session-created', {
              session: {
                ...session,
                playerCount: (session as any)._count.players
              },
              timestamp: new Date().toISOString()
            });
          });
        }
      } catch (error) {
        console.error('Error broadcasting session creation:', error);
      }
    });

    socket.on('session:updated', async (data) => {
      const { sessionId, shareCode } = data;

      try {
        // Get the updated session data
        const session = await prisma.mvpSession.findUnique({
          where: { id: sessionId },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                status: true,
                joinedAt: true
              }
            },
            _count: {
              select: { players: true }
            }
          }
        });

        if (session && (session as any).latitude && (session as any).longitude && (session as any).visibility === 'PUBLIC') {
          // Broadcast to nearby users in discovery rooms
          const nearbyUsers = await getNearbyUsers((session as any).latitude, (session as any).longitude, 10);
          nearbyUsers.forEach(userRoom => {
            io.to(userRoom).emit('discovery:session-updated', {
              session: {
                ...session,
                playerCount: (session as any)._count.players
              },
              timestamp: new Date().toISOString()
            });
          });
        }
      } catch (error) {
        console.error('Error broadcasting session update:', error);
      }
    });

    socket.on('session:deleted', async (data) => {
      const { sessionId, shareCode } = data;

      try {
        // Get session coordinates before deletion (if still exists)
        const session = await prisma.mvpSession.findUnique({
          where: { id: sessionId },
          select: { latitude: true, longitude: true, visibility: true }
        });

        if (session && (session as any).latitude && (session as any).longitude && (session as any).visibility === 'PUBLIC') {
          // Broadcast deletion to nearby users
          const nearbyUsers = await getNearbyUsers((session as any).latitude, (session as any).longitude, 10);
          nearbyUsers.forEach(userRoom => {
            io.to(userRoom).emit('discovery:session-deleted', {
              sessionId,
              shareCode,
              timestamp: new Date().toISOString()
            });
          });
        }
      } catch (error) {
        console.error('Error broadcasting session deletion:', error);
      }
    });
  });

  console.log('📡 Socket.io server initialized');
};

// Helper function to get nearby user rooms
const getNearbyUsers = async (latitude: number, longitude: number, radius: number) => {
  // This is a simplified version - in a real implementation,
  // you'd track which users are in which discovery rooms
  // For now, we'll broadcast to all discovery rooms within the area
  const latKey = Math.round(latitude * 10) / 10;
  const lngKey = Math.round(longitude * 10) / 10;

  // Return rooms within the radius (simplified)
  const rooms = [];
  for (let lat = latKey - 1; lat <= latKey + 1; lat += 0.1) {
    for (let lng = lngKey - 1; lng <= lngKey + 1; lng += 0.1) {
      const distance = Math.sqrt(Math.pow(lat - latKey, 2) + Math.pow(lng - lngKey, 2)) * 111; // Rough km conversion
      if (distance <= radius) {
        rooms.push(`discovery-${Math.round(lat * 10) / 10}-${Math.round(lng * 10) / 10}-${radius}`);
      }
    }
  }

  return rooms;
};