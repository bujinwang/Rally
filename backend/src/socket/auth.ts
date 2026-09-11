/**
 * Socket.io handshake authentication (Story 6.4, AC 2 / AC 13 / AC 14).
 *
 * Authenticates socket connections during the handshake using the same JWT
 * model as REST (Story 6.1). Rejects connections with invalid tokens.
 * Allows guest connections (no token) with an optional deviceId.
 *
 * After auth, socket.data contains:
 *   - user?: { id, email, role }  (for authenticated sockets)
 *   - deviceId?: string            (for guest sockets)
 *   - isAuthenticated: boolean
 */

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface SocketAuthData {
  user?: {
    id: string;
    email: string | null;
    role: string;
  };
  deviceId?: string;
  isAuthenticated: boolean;
}

export interface AuthenticatedSocket extends Socket {
  data: SocketAuthData;
}

/**
 * Verify a JWT access token and return the payload.
 * Returns null if invalid or expired.
 */
function verifyToken(token: string): { id: string; email: string | null; role: string } | null {
  try {
    const payload = jwt.verify(token, env.jwt.secret, {
      algorithms: ['HS256'],
      clockTolerance: 10,
    }) as any;

    if (!payload.id) return null;

    return {
      id: payload.id,
      email: payload.email ?? null,
      role: payload.role ?? 'USER',
    };
  } catch {
    return null;
  }
}

/**
 * Socket.io auth middleware for the handshake.
 *
 * Usage: `io.use(socketAuthMiddleware)`
 */
export function socketAuthMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
  const auth = socket.handshake.auth as {
    token?: string;
    deviceId?: string;
  };

  // Guest connection (no token)
  if (!auth.token) {
    socket.data = {
      deviceId: auth.deviceId,
      isAuthenticated: false,
    };
    return next();
  }

  // Extract Bearer token if present
  const token = auth.token.replace(/^Bearer\s+/i, '');
  const user = verifyToken(token);

  if (!user) {
    return next(new Error('Authentication error: invalid or expired token'));
  }

  socket.data = {
    user,
    isAuthenticated: true,
  };

  // Join user's personal room for direct messaging
  socket.join(`user:${user.id}`);

  next();
}
