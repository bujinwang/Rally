/**
 * Socket handshake authentication tests (Story 6.4, AC 2 / AC 13 / AC 14).
 *
 * Covers: valid JWT accepted, invalid/expired rejected, guest accepted,
 * auth identity attached to socket.data, and no cross-user room joins.
 */
import jwt from 'jsonwebtoken';
import { socketAuthMiddleware, AuthenticatedSocket } from '../auth';
import { env } from '../../config/env';

/** Minimal fake socket capturing joins + data. */
function makeSocket(auth: Record<string, unknown> = {}) {
  const joined: string[] = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    handshake: { auth },
    data: {} as any,
    joined,
    emitted,
    join: (room: string) => {
      joined.push(room);
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
  };
  return socket as unknown as AuthenticatedSocket & {
    joined: string[];
    emitted: Array<{ event: string; payload: unknown }>;
  };
}

/** Run the middleware and resolve with the error (or null). */
function run(socket: any): Promise<Error | null> {
  return new Promise((resolve) => {
    socketAuthMiddleware(socket, (err?: Error) => resolve(err ?? null));
  });
}

function signToken(payload: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
  return jwt.sign(payload, env.jwt.secret, { algorithm: 'HS256', expiresIn: '15m', ...opts });
}

describe('socketAuthMiddleware (Story 6.4, AC 2)', () => {
  it('accepts a valid access token and attaches the verified identity', async () => {
    const token = signToken({ id: 'user-123', email: 'a@b.com', role: 'USER' });
    const socket = makeSocket({ token: `Bearer ${token}` });

    const err = await run(socket);

    expect(err).toBeNull();
    expect(socket.data.isAuthenticated).toBe(true);
    expect(socket.data.user).toEqual({ id: 'user-123', email: 'a@b.com', role: 'USER' });
  });

  it('accepts a raw token without the Bearer prefix', async () => {
    const token = signToken({ id: 'user-456', role: 'USER' });
    const socket = makeSocket({ token });

    expect(await run(socket)).toBeNull();
    expect(socket.data.user?.id).toBe('user-456');
  });

  it('rejects an invalid token (AC 2 / AC 14 — no unauthenticated room access)', async () => {
    const socket = makeSocket({ token: 'Bearer not-a-real-token' });

    const err = await run(socket);

    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/invalid or expired token/i);
    expect(socket.joined).toHaveLength(0);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ id: 'user-789' }, env.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: '-1h',
    });
    const socket = makeSocket({ token: `Bearer ${token}` });

    const err = await run(socket);

    expect(err).toBeInstanceOf(Error);
    expect(socket.data.isAuthenticated).toBeFalsy();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ id: 'attacker' }, 'a-different-secret-entirely', {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    const socket = makeSocket({ token: `Bearer ${token}` });

    expect(await run(socket)).toBeInstanceOf(Error);
  });

  it('rejects a token with no id claim', async () => {
    const token = signToken({ role: 'USER' });
    const socket = makeSocket({ token: `Bearer ${token}` });

    expect(await run(socket)).toBeInstanceOf(Error);
  });

  it('accepts a guest connection with no token (AC 2 — guests supported)', async () => {
    const socket = makeSocket({ deviceId: 'device-abc' });

    const err = await run(socket);

    expect(err).toBeNull();
    expect(socket.data.isAuthenticated).toBe(false);
    expect(socket.data.deviceId).toBe('device-abc');
    expect(socket.data.user).toBeUndefined();
  });

  it('accepts a guest with no token and no deviceId', async () => {
    const socket = makeSocket({});

    expect(await run(socket)).toBeNull();
    expect(socket.data.isAuthenticated).toBe(false);
  });

  it('does NOT join a user room for guests (AC 14 — isolation)', async () => {
    const socket = makeSocket({ deviceId: 'device-abc' });

    await run(socket);

    expect(socket.joined.filter((r) => r.startsWith('user'))).toHaveLength(0);
  });

  it('joins the authenticated user own room only (AC 14)', async () => {
    const token = signToken({ id: 'user-777', role: 'USER' });
    const socket = makeSocket({ token: `Bearer ${token}` });

    await run(socket);

    expect(socket.joined).toContain('user:user-777');
  });
});
