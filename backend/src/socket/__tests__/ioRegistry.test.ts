/**
 * ioRegistry tests (Story 6.4, AC 4 / AC 8 / AC 10 / AC 11 / AC 14).
 *
 * Covers monotonic event ids (ordering), the bounded replay buffer,
 * replay-vs-refetch decisions on reconnect, and canonical room names.
 */
import {
  setIo,
  resetIo,
  getIo,
  getIoOrNull,
  sessionRoom,
  tournamentRoom,
  userRoom,
  emitToRoom,
  resolveMissedEvents,
  nextEventId,
  clearEventBuffer,
  currentEventId,
} from '../ioRegistry';

/** Fake io server capturing room emissions. */
function makeFakeIo() {
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emitted.push({ room, event, payload });
      },
    }),
  };
  return { io: io as any, emitted };
}

describe('ioRegistry (Story 6.4)', () => {
  beforeEach(() => {
    resetIo();
    clearEventBuffer();
  });

  afterEach(() => {
    resetIo();
    clearEventBuffer();
  });

  describe('instance registry', () => {
    it('throws when io is accessed before it is registered', () => {
      expect(() => getIo()).toThrow(/has not been initialised/i);
    });

    it('returns null (not throw) via getIoOrNull before registration', () => {
      expect(getIoOrNull()).toBeNull();
    });

    it('returns the registered instance', () => {
      const { io } = makeFakeIo();
      setIo(io);
      expect(getIo()).toBe(io);
      expect(getIoOrNull()).toBe(io);
    });
  });

  describe('canonical room names (AC 14)', () => {
    it('namespaces each room type distinctly', () => {
      expect(sessionRoom('ABC123')).toBe('session:ABC123');
      expect(tournamentRoom('t1')).toBe('tournament:t1');
      expect(userRoom('u1')).toBe('user:u1');
    });

    it('keeps session and user rooms disjoint for the same id', () => {
      expect(sessionRoom('X')).not.toBe(userRoom('X'));
    });
  });

  describe('event sequencing (AC 10 — ordering)', () => {
    it('issues strictly increasing event ids', () => {
      const a = nextEventId();
      const b = nextEventId();
      const c = nextEventId();
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
    });

    it('stamps emitted events with an eventId and timestamp', () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);

      const result = emitToRoom(sessionRoom('S1'), 'session:score-updated', { shareCode: 'S1' });

      expect(result.eventId).toBeGreaterThan(0);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].room).toBe('session:S1');
      expect(emitted[0].event).toBe('session:score-updated');
      expect(emitted[0].payload.eventId).toBe(result.eventId);
      expect(typeof emitted[0].payload.timestamp).toBe('string');
    });

    it('preserves payload fields alongside the eventId', () => {
      const { io, emitted } = makeFakeIo();
      setIo(io);

      emitToRoom(sessionRoom('S1'), 'session:player-joined', { shareCode: 'S1', playerId: 'p1' });

      expect(emitted[0].payload).toMatchObject({ shareCode: 'S1', playerId: 'p1' });
    });
  });

  describe('reconnect recovery (AC 8 / AC 11)', () => {
    it('replays missed events when the gap is small', () => {
      const { io } = makeFakeIo();
      setIo(io);

      const first = emitToRoom(sessionRoom('S1'), 'e1', { n: 1 });
      emitToRoom(sessionRoom('S1'), 'e2', { n: 2 });
      const third = emitToRoom(sessionRoom('S1'), 'e3', { n: 3 });

      const outcome = resolveMissedEvents(sessionRoom('S1'), first.eventId);

      expect(outcome.mode).toBe('replay');
      if (outcome.mode === 'replay') {
        expect(outcome.events.map((e) => e.eventId)).toEqual([third.eventId - 1, third.eventId]);
      }
    });

    it('replays nothing when the client is already current', () => {
      const { io } = makeFakeIo();
      setIo(io);

      const last = emitToRoom(sessionRoom('S1'), 'e1', { n: 1 });

      const outcome = resolveMissedEvents(sessionRoom('S1'), last.eventId);

      expect(outcome.mode).toBe('replay');
      if (outcome.mode === 'replay') expect(outcome.events).toHaveLength(0);
    });

    it('requests a refetch when too many events were missed (AC 11)', () => {
      const { io } = makeFakeIo();
      setIo(io);

      for (let i = 0; i < 25; i++) {
        emitToRoom(sessionRoom('S1'), 'burst', { i });
      }

      const outcome = resolveMissedEvents(sessionRoom('S1'), 0);

      expect(outcome.mode).toBe('refetch');
    });

    it('requests a refetch when the needed events were evicted from the ring', () => {
      const { io } = makeFakeIo();
      setIo(io);

      // Event buffer default is 200; emit 210 so the first ones are evicted.
      for (let i = 0; i < 210; i++) {
        emitToRoom(sessionRoom('S1'), 'e', { i });
      }

      const outcome = resolveMissedEvents(sessionRoom('S1'), 1);

      expect(outcome.mode).toBe('refetch');
    });

    it('keeps rooms isolated — one room buffer cannot satisfy another (AC 14)', () => {
      const { io } = makeFakeIo();
      setIo(io);

      emitToRoom(sessionRoom('S1'), 'e1', { n: 1 });
      const other = emitToRoom(sessionRoom('S2'), 'e1', { n: 1 });

      const outcome = resolveMissedEvents(sessionRoom('S1'), other.eventId);

      // S1 has no events above S2's id, so nothing is replayed.
      expect(outcome.mode).toBe('replay');
      if (outcome.mode === 'replay') expect(outcome.events).toHaveLength(0);
    });
  });

  describe('bounded memory (AC 16)', () => {
    it('keeps the per-room buffer bounded under load', () => {
      const { io } = makeFakeIo();
      setIo(io);

      for (let i = 0; i < 500; i++) {
        emitToRoom(sessionRoom('S1'), 'e', { i });
      }

      // Asking for id 1 must now fail (evicted) rather than return 499 events.
      expect(resolveMissedEvents(sessionRoom('S1'), 1).mode).toBe('refetch');
      // The very latest event is still recoverable.
      const outcome = resolveMissedEvents(sessionRoom('S1'), currentEventId() - 3);
      expect(outcome.mode).toBe('replay');
    });

    it('clearEventBuffer resets the sequence', () => {
      const { io } = makeFakeIo();
      setIo(io);
      emitToRoom(sessionRoom('S1'), 'e', {});
      clearEventBuffer();
      expect(currentEventId()).toBe(0);
    });
  });
});
