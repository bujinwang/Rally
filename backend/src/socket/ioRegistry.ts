/**
 * Shared Socket.io instance registry + bounded event replay buffer
 * (Story 6.4, AC 4 / AC 8 / AC 10 / AC 11).
 *
 * The domain event emitters (`events/sessionEvents.ts`,
 * `events/tournamentAnalytics.ts`) emit through this registry so that both
 * the HTTP route layer and the socket layer agree on a single authoritative
 * `io` instance.
 *
 * The replay buffer gives reconnect recovery (AC 11): every broadcast that
 * goes to a room is recorded with a monotonic `eventId`. On reconnect a
 * client hands back the last `eventId` it saw; if the gap is small we replay
 * the missed events, and if it is large we tell the client to refetch.
 */

import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env';

let ioInstance: SocketServer | null = null;

/** Register the Socket.io server. Called once from `setupSocket`. */
export function setIo(io: SocketServer): void {
  ioInstance = io;
}

/** Retrieve the registered Socket.io server, or null before startup. */
export function getIoOrNull(): SocketServer | null {
  return ioInstance;
}

/** Retrieve the registered Socket.io server, throwing if not yet wired. */
export function getIo(): SocketServer {
  if (!ioInstance) {
    throw new Error('[socket] io instance has not been initialised');
  }
  return ioInstance;
}

/** Test helper — reset the registry between suites. */
export function resetIo(): void {
  ioInstance = null;
}

// ---------------------------------------------------------------------------
// Canonical room names (Story 6.4, AC 14 — isolation by construction)
// ---------------------------------------------------------------------------

/** Session room. A socket must be a participant to receive these events. */
export function sessionRoom(shareCode: string): string {
  return `session:${shareCode}`;
}

/** Tournament room. */
export function tournamentRoom(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}

/** Authenticated-user room (direct messaging). Guests never join one. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// ---------------------------------------------------------------------------
// Event sequencing + replay buffer
// ---------------------------------------------------------------------------

export interface BufferedEvent {
  eventId: number;
  event: string;
  payload: unknown;
  room: string;
  timestamp: string;
}

// Monotonic, process-local sequence. With the Redis adapter this is unique
// per instance, which is sufficient for ordered replay within a room.
let sequence = 0;

// room -> ordered ring of recent events.
const buffers = new Map<string, BufferedEvent[]>();

/** Next monotonic event id (AC 10 — ordering). */
export function nextEventId(): number {
  sequence += 1;
  return sequence;
}

/** Current sequence value (test/recon helper). */
export function currentEventId(): number {
  return sequence;
}

/**
 * Record a broadcast in the room's replay ring. The ring is bounded by
 * `SOCKET_EVENT_BUFFER_SIZE` so memory stays flat under load (AC 16).
 */
export function recordEvent(
  room: string,
  event: string,
  payload: unknown,
  eventId: number,
  timestamp: string
): void {
  const size = env.socket.eventBufferSize;
  let ring = buffers.get(room);
  if (!ring) {
    ring = [];
    buffers.set(room, ring);
  }
  ring.push({ eventId, event, payload, room, timestamp });
  if (ring.length > size) {
    ring.splice(0, ring.length - size);
  }
}

/**
 * Emit an authoritative event to a room, stamping it with an `eventId`
 * and recording it for replay. This is the single emission path used by
 * the domain emitters (AC 4, AC 10).
 *
 * `payload` must already reflect persisted state — callers write to the
 * database first and only then emit.
 */
export function emitToRoom(
  room: string,
  event: string,
  payload: Record<string, unknown>
): BufferedEvent {
  const io = getIo();
  const eventId = nextEventId();
  const timestamp = new Date().toISOString();

  const body = { ...payload, eventId, timestamp };
  io.to(room).emit(event, body);
  recordEvent(room, event, body, eventId, timestamp);

  return { eventId, event, payload: body, room, timestamp };
}

/**
 * Resolve the events a reconnecting client missed (AC 11).
 *
 * Returns `{ mode: 'replay', events }` when the gap fits within the buffer,
 * or `{ mode: 'refetch' }` when the client should re-read full state.
 */
export function resolveMissedEvents(
  room: string,
  lastEventId: number
): { mode: 'replay'; events: BufferedEvent[] } | { mode: 'refetch' } {
  const ring = buffers.get(room) || [];
  const missed = ring.filter((e) => e.eventId > lastEventId);

  if (missed.length === 0) {
    return { mode: 'replay', events: [] };
  }

  // Too far behind, or the oldest buffered event is newer than what the
  // client last saw (meaning events were evicted) — refetch instead.
  const oldest = ring[0]?.eventId;
  const evicted = oldest !== undefined && lastEventId < oldest - 1;

  if (missed.length > env.socket.maxReplayEvents || evicted) {
    return { mode: 'refetch' };
  }

  return { mode: 'replay', events: missed };
}

/** Test helper — clear the replay buffer. */
export function clearEventBuffer(): void {
  buffers.clear();
  sequence = 0;
}
