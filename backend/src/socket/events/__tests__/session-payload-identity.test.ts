/**
 * Identity-disclosure GUARD — Story 6.9 Phase 0 (session surfaces) and Phase 2
 * (tournament read surfaces) — device-token design §4.2 / §4.3 item 3 / §8.4.
 *
 * THE CONTRACT THIS FILE PINS: no identity key may appear in
 *   (a) a session HTTP response body,
 *   (b) any emitted session socket payload, or
 *   (c) either public tournament read response (`GET /tournaments`, `/:id`).
 *
 * It is written as a *guard*, not a spot-check. It enumerates the surfaces in
 * independent ways so that a NEW emitter or serializer trips it:
 *
 *   1. RUNTIME / HTTP  — mounts the real `routes/mvpSessions` router against a
 *      POISONED Prisma fixture (the session row carries `ownerUserId`; every
 *      player carries `userId`), hits the two canonical session snapshot
 *      endpoints, and recursively asserts no forbidden key survives.
 *   2. RUNTIME / SOCKET — drives the real domain emitters (`sessionEvents.ts`)
 *      with poisoned fixtures through the real `ioRegistry`, capturing BOTH the
 *      live `io.to(room).emit(...)` calls AND the reconnect replay buffer, then
 *      asserts no forbidden key survives in either.
 *   2b. RUNTIME / HTTP (tournament) — mounts the real `routes/tournaments`
 *      router with a POISONED service row and asserts both anonymous reads
 *      carry no organizer/player identity, then replays whatever the read
 *      yielded against the REAL `requireTournamentOrganizer` gate (end-to-end:
 *      the takeover chain's read step is dead).
 *   3. STATIC / SOURCE — scans the enumerated session-surface files so a new
 *      emitter or serializer is caught before it ships:
 *        • the set of files that reference the session-snapshot event is
 *          discovered from disk and must equal `SESSION_EMITTER_FILES`;
 *        • `PLAYER_SELECT` must not select a forbidden key;
 *        • every `mvp-session-updated` emit whose payload carries a `session`
 *          key must wrap it in `socketSessionPayload(...)`;
 *        • `routes/mvpSessions.ts` may only name `ownerUserId` as an object key
 *          in the create/claim WRITE (`ownerUserId: userId`);
 *        • both tournament read handlers must route through the sanitizer, and
 *          the sanitizer's key set must cover every forbidden tournament key.
 *
 * STEP B — EXTENDING THE SESSION SURFACES TO `deviceId` / `ownerDeviceId` IS A
 * ONE-LINE CHANGE. Add those keys to `FORBIDDEN_IDENTITY_KEYS` below (and, for
 * the static `PLAYER_SELECT` / route-key scans, to `STATIC_FORBIDDEN_KEYS`). The
 * recursive walkers, the emit-wrap scan and the discovery scan are all driven
 * off those lists, so no other edit is required. `deviceId` / `ownerDeviceId`
 * are deliberately NOT listed for SESSIONS yet: Phase 0 keeps them for the
 * client (the client-coupled removal is a separate, later step — design §4.2).
 * The TOURNAMENT surfaces, by contrast, already forbid them (see
 * `TOURNAMENT_FORBIDDEN_IDENTITY_KEYS`): the takeover chain reads the parent
 * `organizerDeviceId` anonymously, so the device identity must be gone there.
 */

jest.mock('../../../server', () => ({
  io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
}));

jest.mock('../../../config/database', () => ({
  prisma: {
    mvpSession: { findFirst: jest.fn(), findUnique: jest.fn() },
    mvpPlayer: { findUnique: jest.fn() },
    mvpGame: { findUnique: jest.fn() },
    // Read by the REAL `requireTournamentOrganizer` gate in the end-to-end test.
    tournament: { findUnique: jest.fn() },
  },
}));

// The tournament read service is mocked so the guard can hand the serializers a
// POISONED row (full identity columns); the tournament PERMISSIONS gate is left
// REAL so the end-to-end replay test exercises the production authorization.
jest.mock('../../../services/tournamentService', () => ({
  getTournaments: jest.fn(),
  getTournamentById: jest.fn(),
  getTournamentStats: jest.fn(),
  createTournament: jest.fn(),
  updateTournament: jest.fn(),
  deleteTournament: jest.fn(),
  registerPlayer: jest.fn(),
  unregisterPlayer: jest.fn(),
  startTournament: jest.fn(),
}));

jest.mock('../../../services/tournamentBracketService', () => ({
  BracketError: class BracketError extends Error {},
  tournamentBracketService: {},
}));

jest.mock('../../../middleware/rateLimit', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    createRateLimiters: () => ({
      auth: passthrough,
      api: passthrough,
      public: passthrough,
      sensitive: passthrough,
      custom: () => passthrough,
    }),
  };
});

jest.mock('../../../middleware/caching', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    cachingMiddleware: () => passthrough,
    cacheInvalidationMiddleware: () => passthrough,
  };
});

jest.mock('../../../middleware/versioning', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { versioning: () => passthrough };
});

jest.mock('../../../services/messagingService', () => ({
  messagingService: {
    createThread: jest.fn(),
    sendMessage: jest.fn(),
    getThreadsForUser: jest.fn(),
    getOrCreateSessionChat: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../notificationHandlers', () => ({ emitPlayerJoined: jest.fn() }));

jest.mock('../../../utils/notificationHelper', () => ({
  notifySessionSubscribers: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../../utils/statisticsService', () => ({
  updatePlayerGameStatistics: jest.fn().mockResolvedValue(undefined),
  updatePlayerMatchStatistics: jest.fn().mockResolvedValue(undefined),
  getPlayerStatistics: jest.fn().mockResolvedValue(null),
  getSessionStatistics: jest.fn().mockResolvedValue(null),
  getSessionLeaderboard: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../utils/rotationAlgorithm', () => ({
  generateOptimalRotation: jest.fn(),
  getRotationExplanation: jest.fn().mockReturnValue(''),
}));

jest.mock('../../../utils/auditLogger', () => ({
  AuditLogger: { logAction: jest.fn() },
}));

import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

import { prisma } from '../../../config/database';
import mvpSessionsRouter from '../../../routes/mvpSessions';
import tournamentsRouter from '../../../routes/tournaments';
import * as tournamentService from '../../../services/tournamentService';
import {
  setIo,
  resetIo,
  clearEventBuffer,
  resolveMissedEvents,
  sessionRoom,
} from '../../ioRegistry';
import {
  emitSessionSnapshot,
  emitPlayerStatusChanged,
  emitScoreUpdated,
  emitPlayerJoined,
  emitPlayerLeft,
} from '../sessionEvents';

// ---------------------------------------------------------------------------
// The forbidden-key lists — the single knob for Step B (see file header).
// ---------------------------------------------------------------------------

/**
 * Account-identity keys that must never appear in an outgoing session payload.
 * Extend this list (and `STATIC_FORBIDDEN_KEYS`) with `deviceId` /
 * `ownerDeviceId` when the client-coupled removal lands (Step B).
 */
const FORBIDDEN_IDENTITY_KEYS = ['userId', 'ownerUserId'] as const;

/**
 * Identity keys forbidden on the PUBLIC tournament read surfaces
 * (`GET /tournaments`, `GET /tournaments/:id`).
 *
 * This is a SUPERSET of the session set: the tournament takeover chain reads
 * the parent `organizerDeviceId` (and `players[].deviceId`) anonymously and
 * replays it against `requireTournamentOrganizer`, so the DEVICE identity must
 * be gone here even though the session surfaces still carry it for the client
 * (the client-coupled Step B has not landed yet). Adding a key here is the
 * one-line extension the guard was built for.
 */
const TOURNAMENT_FORBIDDEN_IDENTITY_KEYS = [
  ...FORBIDDEN_IDENTITY_KEYS,
  'deviceId',
  'ownerDeviceId',
  'organizerUserId',
  'organizerDeviceId',
] as const;

/**
 * The subset of the above that must additionally never be *selected* from
 * Prisma into a serialization path, nor named as an object key in the session
 * route module. (Today it is the same set; the two lists are kept separate so
 * the static checks can diverge from the runtime ones without touching either
 * walker.)
 */
const STATIC_FORBIDDEN_KEYS = ['userId', 'ownerUserId'] as const;

const SESSION_SNAPSHOT_EVENT = 'mvp-session-updated';

/**
 * Every non-test source file that may construct a session snapshot payload.
 * The discovery scan below FAILS if a new file starts emitting the session
 * snapshot without being added here.
 */
const SESSION_EMITTER_FILES = [
  'config/socket.ts',
  'routes/mvpSessions.ts',
  'socket/events/sessionEvents.ts',
];

/**
 * The subset of the above that emit the snapshot via a DIRECT object literal
 * (`x.emit('mvp-session-updated', { … })`), which the wrap scan can parse.
 * `sessionEvents.ts` routes through `emitToRoom(room, event, payload)` with a
 * pre-built `payload` variable, so it is covered by the runtime socket guard
 * and by the dedicated hygiene-module assertion instead.
 */
const DIRECT_SNAPSHOT_EMIT_FILES = ['config/socket.ts', 'routes/mvpSessions.ts'];

const SRC_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect the dotted paths of every forbidden key in `value`. */
function findForbiddenKeys(
  value: unknown,
  keys: readonly string[],
  at: string = '$',
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenKeys(entry, keys, `${at}[${index}]`, found));
  } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys.includes(key)) {
        found.push(`${at}.${key}`);
      }
      findForbiddenKeys(entry, keys, `${at}.${key}`, found);
    }
  }
  return found;
}

/** Assert an arbitrary payload carries no forbidden identity key (recursive). */
function expectNoIdentityKeys(
  payload: unknown,
  label: string,
  keys: readonly string[] = FORBIDDEN_IDENTITY_KEYS,
): void {
  const leaked = findForbiddenKeys(payload, keys);
  if (leaked.length > 0) {
    throw new Error(`${label} leaked account identity at: ${leaked.join(', ')}`);
  }
  expect(leaked).toEqual([]);
}

/** Return the index of the `}` that closes the `{` at `openIndex` (string-aware). */
function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') i += 1;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') i += 1;
      else if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces while scanning source');
}

/** Extract the object-literal payload of every `emit('<eventName>', { ... })`. */
function extractEmitPayloads(source: string, eventName: string): string[] {
  const token = `'${eventName}'`;
  const payloads: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(token, from);
    if (at === -1) break;
    const open = source.indexOf('{', at + token.length);
    if (open === -1) break;
    // Only treat the following `{` as the payload when the event name is
    // DIRECTLY followed by a comma/whitespace then the object literal. This
    // skips call styles like `emitToRoom(room, '<event>', payloadVar)` whose
    // next `{` belongs to a different statement.
    const between = source.slice(at + token.length, open);
    if (!/^[\s,]*$/.test(between)) {
      from = at + token.length;
      continue;
    }
    const close = findMatchingBrace(source, open);
    payloads.push(source.slice(open, close + 1));
    from = close + 1;
  }
  return payloads;
}

/**
 * Blank out the contents of string / template literals so a `session:` that
 * appears inside an event name (e.g. `'session:player-joined'`) is not mistaken
 * for a payload key.
 */
function stripStringLiterals(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ' ';
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Return the `session:` values in a payload that are NOT wrapped in the
 * hygiene module. A wrapped value is `session: socketSessionPayload(...)`;
 * anything else (a bare identifier or an inline object literal) is a leak.
 */
function unwrappedSessionValues(payload: string): string[] {
  const body = stripStringLiterals(payload);
  const unwrapped: string[] = [];
  const re = /\bsession\s*:\s*(\{|[A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const value = match[1];
    if (value !== 'socketSessionPayload' && value !== 'stripUserIdentity') {
      unwrapped.push(match[0].trim());
    }
  }
  return unwrapped;
}

/** Recursively list non-test `.ts` files under `dir`. */
function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walkTsFiles(full, acc);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function readSource(relative: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relative), 'utf8');
}

// ---------------------------------------------------------------------------
// Poisoned fixtures — the data layer hands the serializers MORE than they may
// emit, so a serializer that forgets to project is caught.
// ---------------------------------------------------------------------------

const OWNER_DEVICE = 'dev-owner';
const OWNER_USER = 'user-owner';

const POISONED_PLAYER = {
  id: 'p1',
  name: 'Ann',
  deviceId: OWNER_DEVICE,
  userId: OWNER_USER, // must never be emitted
  status: 'ACTIVE',
  role: 'ORGANIZER',
  skillLevel: 'BEGINNER',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  matchWins: 0,
  matchLosses: 0,
  totalSetsWon: 0,
  totalSetsLost: 0,
  totalPlayTime: 0,
  winRate: 0,
  matchWinRate: 0,
  averageGameDuration: 0,
  restGamesRemaining: 0,
  restRequestedAt: null,
  restRequestedBy: null,
  partnershipStats: null,
};

const POISONED_GUEST = {
  ...POISONED_PLAYER,
  id: 'p2',
  name: 'Bo',
  deviceId: 'dev-2',
  userId: 'user-2',
  role: 'PLAYER',
};

const POISONED_SESSION = {
  id: 'sess-1',
  name: 'Guard session',
  shareCode: 'ABC123',
  scheduledAt: new Date('2026-02-01T10:00:00.000Z'),
  location: 'Guard Court',
  maxPlayers: 10,
  courtCount: 2,
  skillLevel: 'BEGINNER',
  cost: 0,
  description: 'guard fixture',
  ownerName: 'Owner',
  sport: 'badminton',
  ownerDeviceId: OWNER_DEVICE,
  ownerUserId: OWNER_USER, // must never be emitted
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  players: [POISONED_PLAYER, POISONED_GUEST],
  games: [],
  matches: [],
};

const mvpSessionFindFirst = prisma.mvpSession.findFirst as unknown as jest.Mock;
const mvpSessionFindUnique = prisma.mvpSession.findUnique as unknown as jest.Mock;
const mvpPlayerFindUnique = prisma.mvpPlayer.findUnique as unknown as jest.Mock;
const mvpGameFindUnique = prisma.mvpGame.findUnique as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// 1. RUNTIME / HTTP — the session snapshot endpoints must not leak identity.
// ---------------------------------------------------------------------------

const httpApp = express();
httpApp.use(express.json());
httpApp.use('/api/v1/mvp-sessions', mvpSessionsRouter);

describe('HTTP session snapshot guard (runtime, poisoned fixture)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mvpSessionFindFirst.mockResolvedValue(POISONED_SESSION);
    mvpSessionFindUnique.mockResolvedValue(POISONED_SESSION);
  });

  it('GET /:shareCode leaks no account identity and exposes the viewer signals', async () => {
    const res = await request(httpApp)
      .get('/api/v1/mvp-sessions/ABC123')
      .set('x-device-id', OWNER_DEVICE);

    expect(res.status).toBe(200);
    expectNoIdentityKeys(res.body, 'GET /:shareCode response');

    // Additive, server-computed organizer signals (design §4.2) must be present
    // so the client never has to compare a leaked id.
    expect(res.body.data.session.viewer).toEqual({
      isOrganizer: true,
      playerId: 'p1',
    });
    // Story 6.9 Phase 0 Step B — presence flag the client uses instead of
    // reading the raw owner id. It must be a BOOLEAN, never an id: this is the
    // guard that stops `ownerClaimed` regressing into an id shipment.
    expect(typeof res.body.data.session.ownerClaimed).toBe('boolean');
    expect(res.body.data.session.ownerClaimed).toBe(true);
    const [firstPlayer] = res.body.data.session.players;
    expect(firstPlayer.isYou).toBe(true);
    expect(res.body.data.session.players[1].isYou).toBe(false);
  });

  it('GET /join/:shareCode leaks no account identity and exposes the viewer signals', async () => {
    const res = await request(httpApp)
      .get('/api/v1/mvp-sessions/join/ABC123')
      .set('x-device-id', 'dev-2');

    expect(res.status).toBe(200);
    expectNoIdentityKeys(res.body, 'GET /join/:shareCode response');

    expect(res.body.data.session.viewer).toEqual({
      isOrganizer: false,
      playerId: 'p2',
    });
    // Step B presence flag — boolean, never an id (see GET /:shareCode).
    expect(typeof res.body.data.session.ownerClaimed).toBe('boolean');
    expect(res.body.data.session.ownerClaimed).toBe(true);
    expect(res.body.data.session.players[1].isYou).toBe(true);
    expect(res.body.data.session.players[0].isYou).toBe(false);
  });

  it('an anonymous viewer is reported as a non-organizer with no player id', async () => {
    const res = await request(httpApp).get('/api/v1/mvp-sessions/ABC123');

    expect(res.status).toBe(200);
    expectNoIdentityKeys(res.body, 'GET /:shareCode (anonymous) response');
    expect(res.body.data.session.viewer).toEqual({ isOrganizer: false, playerId: null });
    expect(res.body.data.session.players.every((p: { isYou: boolean }) => p.isYou === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. RUNTIME / SOCKET — every emitted session payload must be identity-free.
// ---------------------------------------------------------------------------

function makeFakeIo() {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
  };
  return { io: io as never, emitted };
}

describe('Socket session payload guard (runtime, poisoned fixture)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIo();
    clearEventBuffer();
    mvpSessionFindUnique.mockResolvedValue(POISONED_SESSION);
    mvpPlayerFindUnique.mockResolvedValue(POISONED_GUEST);
    mvpGameFindUnique.mockResolvedValue({
      id: 'g1',
      matchId: 'm1',
      gameNumber: 1,
      team1Player1: 'A',
      team1Player2: 'B',
      team2Player1: 'C',
      team2Player2: 'D',
      team1FinalScore: 21,
      team2FinalScore: 19,
      winnerTeam: 1,
    });
  });

  afterEach(() => {
    resetIo();
    clearEventBuffer();
  });

  it('no emitter leaks identity, and the snapshot carries the public organizerPlayerId', async () => {
    const { io, emitted } = makeFakeIo();
    setIo(io);

    await emitSessionSnapshot('ABC123');
    await emitPlayerJoined('ABC123', 'p2');
    await emitPlayerStatusChanged('ABC123', 'p2', 'RESTING');
    await emitScoreUpdated('ABC123', 'g1');
    await emitPlayerLeft('ABC123', 'p2');

    // Every live broadcast payload (both rooms/events) must be clean.
    expect(emitted.length).toBeGreaterThan(0);
    emitted.forEach((entry) => {
      expectNoIdentityKeys(entry.payload, `socket emit '${entry.event}'`);
    });

    // The reconnect replay buffer is the same payloads — assert it too, so the
    // replay path cannot become a separate leak.
    const replayed = resolveMissedEvents(sessionRoom('ABC123'), 0);
    expect(replayed.mode).toBe('replay');
    if (replayed.mode === 'replay') {
      replayed.events.forEach((event) => {
        expectNoIdentityKeys(event.payload, `replay '${event.event}'`);
      });
    }

    // The surrogate the client needs to self-determine organizer status is
    // present and is the PUBLIC player id (not the account id).
    const snapshot = emitted.find((e) => e.event === SESSION_SNAPSHOT_EVENT);
    expect(snapshot).toBeDefined();
    const session = (snapshot!.payload as { session: Record<string, unknown> }).session;
    expect(session.organizerPlayerId).toBe('p1');
    expect(session.ownerUserId).toBeUndefined();
  });

  it('emitPlayerJoined strips account identity from the joined player', async () => {
    const { io, emitted } = makeFakeIo();
    setIo(io);

    await emitPlayerJoined('ABC123', 'p2');

    const joined = emitted.find((e) => e.event === 'session:player-joined');
    expect(joined).toBeDefined();
    const player = (joined!.payload as { player: Record<string, unknown> }).player;
    expect(player.userId).toBeUndefined();
    expect(player.id).toBe('p2');
    expectNoIdentityKeys(joined!.payload, "socket emit 'session:player-joined'");
  });
});

// ---------------------------------------------------------------------------
// 2b. RUNTIME / HTTP (tournament) — the anonymous read must not hand out the
//     authorization factor the takeover chain replays.
// ---------------------------------------------------------------------------

const ORGANIZER_DEVICE_SECRET = 'org-dev-secret';
const ORGANIZER_USER_SECRET = 'user-org-secret';
const PLAYER_DEVICE_SECRET = 'player-dev-secret';
const PLAYER_USER_SECRET = 'user-player-secret';

const POISONED_TOURNAMENT = {
  id: 't1',
  name: 'Spring Open',
  description: 'x',
  tournamentType: 'SINGLE_ELIMINATION',
  sportType: 'BADMINTON',
  maxPlayers: 32,
  minPlayers: 4,
  startDate: new Date('2026-03-01T00:00:00.000Z'),
  endDate: null,
  registrationDeadline: new Date('2026-02-20T00:00:00.000Z'),
  venueName: 'Court',
  venueAddress: 'Addr',
  latitude: 1,
  longitude: 2,
  matchFormat: 'SINGLES',
  scoringSystem: '21_POINT',
  bestOfGames: 3,
  entryFee: 0,
  prizePool: 0,
  currency: 'USD',
  status: 'REGISTRATION_OPEN',
  organizer: 'Org',
  organizerEmail: null,
  organizerPhone: null,
  organizerUserId: ORGANIZER_USER_SECRET, // must never be emitted
  organizerDeviceId: ORGANIZER_DEVICE_SECRET, // the takeover-chain factor
  visibility: 'PUBLIC',
  accessCode: null,
  skillLevelMin: null,
  skillLevelMax: null,
  ageRestriction: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  players: [
    {
      id: 'tp1',
      tournamentId: 't1',
      playerName: 'Ann',
      email: null,
      phone: null,
      deviceId: PLAYER_DEVICE_SECRET, // must never be emitted
      userId: PLAYER_USER_SECRET, // must never be emitted
      registeredAt: new Date('2026-01-02T00:00:00.000Z'),
      seed: 1,
      status: 'REGISTERED',
      skillLevel: 'BEGINNER',
      winRate: 0,
      totalMatches: 0,
      currentRound: 0,
      isEliminated: false,
      finalRank: null,
    },
  ],
  rounds: [
    {
      id: 'r1',
      tournamentId: 't1',
      roundNumber: 1,
      roundName: 'Finals',
      roundType: 'ELIMINATION',
      matchesRequired: 1,
      playersAdvancing: 1,
      startDate: null,
      endDate: null,
      status: 'PENDING',
      matches: [
        {
          id: 'm1',
          tournamentId: 't1',
          roundId: 'r1',
          player1Id: 'tp1',
          player2Id: null,
          matchNumber: 1,
          bestOfGames: 3,
          scoringSystem: '21_POINT',
          player1GamesWon: 0,
          player2GamesWon: 0,
          winnerId: null,
          status: 'SCHEDULED',
          // Nested relation player — proves the strip recurses past the parent.
          player1: {
            id: 'tp1',
            playerName: 'Ann',
            deviceId: PLAYER_DEVICE_SECRET,
            userId: PLAYER_USER_SECRET,
          },
          player2: null,
        },
      ],
    },
  ],
};

const tournamentApp = express();
tournamentApp.use(express.json());
tournamentApp.use('/api/v1/tournaments', tournamentsRouter);

const getTournamentsMock = tournamentService.getTournaments as unknown as jest.Mock;
const getTournamentByIdMock = tournamentService.getTournamentById as unknown as jest.Mock;
const tournamentFindUnique = prisma.tournament.findUnique as unknown as jest.Mock;

describe('Tournament read-surface guard (anonymous, poisoned fixture)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTournamentsMock.mockResolvedValue({ tournaments: [POISONED_TOURNAMENT], total: 1 });
    getTournamentByIdMock.mockResolvedValue(POISONED_TOURNAMENT);
    // What the REAL gate reads when authorizing a mutation.
    tournamentFindUnique.mockResolvedValue({
      organizerUserId: ORGANIZER_USER_SECRET,
      organizerDeviceId: ORGANIZER_DEVICE_SECRET,
    });
  });

  it('GET /tournaments leaks no organizer or player identity', async () => {
    const res = await request(tournamentApp).get('/api/v1/tournaments');

    expect(res.status).toBe(200);
    expectNoIdentityKeys(res.body, 'GET /tournaments response', TOURNAMENT_FORBIDDEN_IDENTITY_KEYS);

    // The secret STRINGS must not appear anywhere in the serialized body either
    // (a value could be echoed under a different key name).
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(ORGANIZER_DEVICE_SECRET);
    expect(serialized).not.toContain(ORGANIZER_USER_SECRET);
    expect(serialized).not.toContain(PLAYER_DEVICE_SECRET);
    expect(serialized).not.toContain(PLAYER_USER_SECRET);
  });

  it('GET /tournaments/:id leaks no organizer or player identity', async () => {
    const res = await request(tournamentApp).get('/api/v1/tournaments/t1');

    expect(res.status).toBe(200);
    expectNoIdentityKeys(
      res.body,
      'GET /tournaments/:id response',
      TOURNAMENT_FORBIDDEN_IDENTITY_KEYS,
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(ORGANIZER_DEVICE_SECRET);
    expect(serialized).not.toContain(ORGANIZER_USER_SECRET);
    expect(serialized).not.toContain(PLAYER_DEVICE_SECRET);
    expect(serialized).not.toContain(PLAYER_USER_SECRET);

    // The non-identity fields the clients actually use must survive.
    expect(res.body.data.name).toBe('Spring Open');
    expect(res.body.data.players[0].playerName).toBe('Ann');
    expect(res.body.data.players[0].id).toBe('tp1');
  });

  it('END-TO-END: the anonymous read yields no value that satisfies the organizer gate', async () => {
    // The attacker's ONLY source of the gate factor is the anonymous read.
    const read = await request(tournamentApp).get('/api/v1/tournaments/t1');
    const data = (read.body?.data ?? {}) as Record<string, unknown>;
    const players = (data.players as Array<Record<string, unknown>> | undefined) ?? [];
    const attackerGuess =
      (data.organizerDeviceId as string | undefined) ??
      (players[0]?.deviceId as string | undefined) ??
      '';

    // Replay EXACTLY what the read handed back against the REAL gate. With the
    // leak present this value is the organizer device id and the mutation is
    // authorized (200); with the fix it is empty and the gate denies (403).
    const mutation = await request(tournamentApp)
      .put('/api/v1/tournaments/t1')
      .set('x-device-id', String(attackerGuess))
      .send({ name: 'pwned' });

    expect(mutation.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. STATIC / SOURCE — enumerate the surfaces so a new one trips the guard.
// ---------------------------------------------------------------------------

describe('Static session-surface guard (enumerated from disk)', () => {
  it('every file that references the session snapshot event is enumerated', () => {
    const discovered = walkTsFiles(SRC_ROOT)
      .filter((file) => fs.readFileSync(file, 'utf8').includes(SESSION_SNAPSHOT_EVENT))
      .map((file) => path.relative(SRC_ROOT, file).split(path.sep).join('/'))
      .sort();

    // A new emitter/serializer that introduces the session snapshot event (or a
    // refactor that moves it) fails here and must be added to
    // `SESSION_EMITTER_FILES` — which then subjects it to the checks below.
    expect(discovered).toEqual([...SESSION_EMITTER_FILES].sort());
  });

  it("PLAYER_SELECT selects no forbidden key", () => {
    const source = readSource('socket/events/sessionEvents.ts');
    const declAt = source.indexOf('const PLAYER_SELECT');
    expect(declAt).toBeGreaterThan(-1);
    const open = source.indexOf('{', declAt);
    const close = findMatchingBrace(source, open);
    const selectBody = source.slice(open, close + 1);

    for (const key of STATIC_FORBIDDEN_KEYS) {
      expect(selectBody).not.toMatch(new RegExp(`\\b${key}\\s*:`));
    }
  });

  it('every session snapshot emit wraps its `session` payload in the hygiene module', () => {
    for (const file of DIRECT_SNAPSHOT_EMIT_FILES) {
      const source = readSource(file);
      const payloads = extractEmitPayloads(source, SESSION_SNAPSHOT_EVENT);
      // Guard the guard: the extractor must actually find the emits.
      expect(payloads.length).toBeGreaterThan(0);
      payloads.forEach((payload, index) => {
        const unwrapped = unwrappedSessionValues(payload);
        if (unwrapped.length > 0) {
          throw new Error(
            `${file}: unwrapped session payload in emit #${index + 1} → ${unwrapped.join(', ')}`,
          );
        }
      });
    }
  });

  it('the domain emitter module routes session state through the hygiene module', () => {
    const source = readSource('socket/events/sessionEvents.ts');
    // The snapshot and the joined-player payload must both pass through the
    // single hygiene module — the behavioural proof is the runtime socket guard;
    // this pins that the wiring stays in place (a `payload` variable emit cannot
    // be parsed by the object-literal wrap scan above).
    expect(source).toMatch(/socketSessionPayload\(/);
    expect(source).toMatch(/stripUserIdentity\(/);
  });

  it('the session route module names account identity as an object key only in the create/claim write', () => {
    const source = readSource('routes/mvpSessions.ts');
    const matches = [...source.matchAll(/\b(ownerUserId|userId)\s*:\s*([^\n,}]+)/g)];

    // The only sanctioned use is the create/claim WRITE `ownerUserId: userId`.
    // A serializer that emits `ownerUserId` (read) or a bare `userId` key trips.
    matches.forEach((match) => {
      const rendered = `${match[1]}: ${match[2].trim()}`;
      expect(rendered).toBe('ownerUserId: userId');
    });
    // Sanity: the write pattern is actually present (so the assertion above is
    // not vacuously passing on a file that no longer writes the owner at all).
    expect(matches.length).toBeGreaterThan(0);
  });

  it('both tournament read handlers route their response through the identity sanitizer', () => {
    const source = readSource('routes/tournaments.ts');
    // Each of the two read handlers (`GET /` and `GET /:id`) must strip the
    // identity keys from the serialized output — a curated nested select cannot
    // remove the PARENT `organizerDeviceId` scalar.
    expect(source).toMatch(/data:\s*stripTournamentIdentity\(result\)/);
    expect(source).toMatch(/data:\s*stripTournamentIdentity\(tournament\)/);
  });

  it('the tournament sanitizer covers every device + account identity key', () => {
    // Pin the contract of the sanitizer's key set so a key cannot be silently
    // dropped from the strip list (which would re-open the takeover chain).
    const source = readSource('utils/identitySanitizer.ts');
    for (const key of TOURNAMENT_FORBIDDEN_IDENTITY_KEYS) {
      expect(source).toMatch(new RegExp(`['"]${key}['"]`));
    }
  });
});
