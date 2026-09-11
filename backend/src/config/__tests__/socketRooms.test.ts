/**
 * Socket room authorization tests (Story 6.4, AC 14 / Defect-1 regression).
 *
 * Verifies that:
 *  - `join-session` authorizes the connecting identity BEFORE joining either
 *    room, and rejects unauthorized sockets with `auth:error` (no rooms joined,
 *    no catch-up snapshot).
 *  - Guests can still join their own session (participant deviceId / owner).
 *  - `sync:resume` never replays a room the socket has not actually joined.
 *  - `join-tournament` authorizes participation for non-public tournaments and
 *    serves the bracket via the shared `loadBracket` helper.
 */
import { setupSocket } from '../socket';
import { clearEventBuffer, resetIo } from '../../socket/ioRegistry';

const findUniqueSession = jest.fn();
const findUniqueTournament = jest.fn();
const findFirstTournamentPlayer = jest.fn();
const emitSessionSnapshotMock = jest.fn();
const loadBracketMock = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    mvpSession: { findUnique: (...a: unknown[]) => findUniqueSession(...a) },
    tournament: { findUnique: (...a: unknown[]) => findUniqueTournament(...a) },
    tournamentPlayer: {
      findFirst: (...a: unknown[]) => findFirstTournamentPlayer(...a),
    },
  },
}));

jest.mock('../../socket/auth', () => ({
  socketAuthMiddleware: jest.fn(),
}));

jest.mock('../../socket/events/sessionEvents', () => ({
  emitSessionSnapshot: (...a: unknown[]) => emitSessionSnapshotMock(...a),
}));

jest.mock('../../socket/events/tournamentAnalytics', () => ({
  loadBracket: (...a: unknown[]) => loadBracketMock(...a),
}));

type Listener = (...args: any[]) => any;

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  rooms: Set<string>;
  emitted: Array<{ event: string; payload: any }>;
  listeners: Record<string, Listener>;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, payload?: any) => void;
  to: (room: string) => { emit: (event: string, payload?: any) => void };
  on: (event: string, fn: Listener) => void;
}

function makeSocket(data: Record<string, unknown>): FakeSocket {
  const id = 'sock-1';
  const socket: FakeSocket = {
    id,
    data,
    // socket.io always seeds the set with the socket's own id.
    rooms: new Set<string>([id]),
    emitted: [],
    listeners: {},
    join(room) {
      this.rooms.add(room);
    },
    leave(room) {
      this.rooms.delete(room);
    },
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    to() {
      return { emit: () => undefined };
    },
    on(event, fn) {
      this.listeners[event] = fn;
    },
  };
  return socket;
}

let connectionHandler: ((socket: FakeSocket) => void) | undefined;

function wireServer(): void {
  const io = {
    use: jest.fn(),
    on: (event: string, fn: any) => {
      if (event === 'connection') connectionHandler = fn;
    },
    to: () => ({ emit: jest.fn() }),
    emit: jest.fn(),
  } as any;

  setupSocket(io);
}

/** Build a connected fake socket and return it plus its captured handlers. */
function connect(data: Record<string, unknown>): FakeSocket {
  const socket = makeSocket(data);
  connectionHandler!(socket);
  return socket;
}

function hasAuthError(socket: FakeSocket): boolean {
  return socket.emitted.some((e) => e.event === 'auth:error');
}

describe('Socket room authorization (Story 6.4, AC 14 — Defect-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIo();
    clearEventBuffer();
    connectionHandler = undefined;
    emitSessionSnapshotMock.mockResolvedValue(true);
    loadBracketMock.mockResolvedValue([]);
    wireServer();
  });

  afterEach(() => {
    resetIo();
    clearEventBuffer();
  });

  describe('join-session', () => {
    it('denies a socket that never joined anything, with NO rooms joined (P0 fix)', async () => {
      // No participant row for this identity, not the owner.
      findUniqueSession.mockResolvedValue({
        ownerUserId: null,
        ownerDeviceId: 'someone-else',
        players: [],
      });

      const socket = connect({ deviceId: 'attacker-device', isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(true);
      expect(socket.rooms.has('session:ABC123')).toBe(false);
      expect(socket.rooms.has('session-ABC123')).toBe(false);
      // No catch-up snapshot leaked.
      expect(emitSessionSnapshotMock).not.toHaveBeenCalled();
    });

    it('allows a participating GUEST (deviceId match) and joins both rooms', async () => {
      findUniqueSession.mockResolvedValue({
        ownerUserId: null,
        ownerDeviceId: 'other-owner',
        players: [{ id: 'p1' }],
      });

      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(false);
      expect(socket.rooms.has('session:ABC123')).toBe(true);
      expect(socket.rooms.has('session-ABC123')).toBe(true);
      expect(emitSessionSnapshotMock).toHaveBeenCalledWith('ABC123');
    });

    it('allows the authenticated session owner (ownerUserId match)', async () => {
      findUniqueSession.mockResolvedValue({
        ownerUserId: 'user-owner',
        ownerDeviceId: 'owner-device',
        players: [],
      });

      const socket = connect({
        user: { id: 'user-owner', email: null, role: 'USER' },
        isAuthenticated: true,
      });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(false);
      expect(socket.rooms.has('session:ABC123')).toBe(true);
    });

    it('allows the guest session owner (ownerDeviceId match)', async () => {
      findUniqueSession.mockResolvedValue({
        ownerUserId: null,
        ownerDeviceId: 'owner-device-9',
        players: [],
      });

      const socket = connect({ deviceId: 'owner-device-9', isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(false);
      expect(socket.rooms.has('session:ABC123')).toBe(true);
    });

    it('denies a socket with no identity at all', async () => {
      const socket = connect({ isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(true);
      expect(findUniqueSession).not.toHaveBeenCalled();
      expect(socket.rooms.has('session:ABC123')).toBe(false);
    });

    it('fails closed when the session lookup throws', async () => {
      findUniqueSession.mockRejectedValue(new Error('db down'));

      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      expect(hasAuthError(socket)).toBe(true);
      expect(socket.rooms.has('session:ABC123')).toBe(false);
    });
  });

  describe('sync:resume', () => {
    it('drops every room the socket has not joined (P0 fix)', async () => {
      findUniqueSession.mockResolvedValue({
        ownerUserId: null,
        ownerDeviceId: 'other',
        players: [{ id: 'p1' }],
      });

      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });
      await socket.listeners['join-session']('ABC123');

      socket.listeners['sync:resume']({
        rooms: [
          { room: 'session:ABC123', lastEventId: 0 },
          { room: 'session:OTHER', lastEventId: 0 },
        ],
      });

      const resumed = socket.emitted.find((e) => e.event === 'sync:resumed');
      expect(resumed).toBeDefined();
      const results = resumed!.payload.results;
      expect(results).toContainEqual({ room: 'session:OTHER', mode: 'unauthorized' });
      // The joined room is replayed (empty buffer → replay with 0 events).
      expect(results).toContainEqual({
        room: 'session:ABC123',
        mode: 'replay',
        replayed: 0,
      });
    });

    it('never replays a room when the socket joined nothing', async () => {
      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });

      socket.listeners['sync:resume']({
        rooms: [{ room: 'session:S1', lastEventId: 0 }],
      });

      const resumed = socket.emitted.find((e) => e.event === 'sync:resumed');
      expect(resumed!.payload.results).toEqual([
        { room: 'session:S1', mode: 'unauthorized' },
      ]);
    });
  });

  describe('join-tournament', () => {
    it('allows a public tournament and serves the bracket via loadBracket', async () => {
      findUniqueTournament.mockResolvedValue({ visibility: 'PUBLIC' });
      loadBracketMock.mockResolvedValue([{ roundNumber: 1, name: 'Final', matches: [] }]);

      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });
      await socket.listeners['join-tournament']({ tournamentId: 't1' });

      expect(hasAuthError(socket)).toBe(false);
      expect(socket.rooms.has('tournament:t1')).toBe(true);
      expect(loadBracketMock).toHaveBeenCalledWith('t1');
      const bracket = socket.emitted.find((e) => e.event === 'tournament:bracket');
      expect(bracket).toBeDefined();
      expect(bracket!.payload.rounds).toHaveLength(1);
    });

    it('denies a non-participant for a PRIVATE tournament', async () => {
      findUniqueTournament.mockResolvedValue({ visibility: 'PRIVATE' });
      findFirstTournamentPlayer.mockResolvedValue(null);

      const socket = connect({ deviceId: 'outsider', isAuthenticated: false });
      await socket.listeners['join-tournament']({ tournamentId: 't1' });

      expect(hasAuthError(socket)).toBe(true);
      expect(socket.rooms.has('tournament:t1')).toBe(false);
    });

    it('allows a registered participant for a PRIVATE tournament', async () => {
      findUniqueTournament.mockResolvedValue({ visibility: 'PRIVATE' });
      findFirstTournamentPlayer.mockResolvedValue({ id: 'tp1' });

      const socket = connect({ deviceId: 'participant-device', isAuthenticated: false });
      await socket.listeners['join-tournament']({ tournamentId: 't1' });

      expect(hasAuthError(socket)).toBe(false);
      expect(socket.rooms.has('tournament:t1')).toBe(true);
    });

    it('denies an unknown tournament', async () => {
      findUniqueTournament.mockResolvedValue(null);

      const socket = connect({ deviceId: 'guest-device-1', isAuthenticated: false });
      await socket.listeners['join-tournament']({ tournamentId: 'ghost' });

      expect(hasAuthError(socket)).toBe(true);
      expect(socket.rooms.has('tournament:ghost')).toBe(false);
    });
  });
});
