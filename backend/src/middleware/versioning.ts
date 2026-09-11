/**
 * versioning.ts — Story 6.5 optimistic-concurrency middleware.
 *
 * Implements the server half of the conflict contract described in
 * `docs/stories/6.5.design.md` §5.2 / §5.3. The client (offline replay) sends an
 * advisory `X-Entity-Version: <n>` header carrying the last version it saw for
 * the target entity. This middleware:
 *
 *   1. Reads the entity's current `version`.
 *   2. If the client sent `X-Entity-Version` **and** it is strictly `<` the
 *      server's version, it does **not** apply the write and responds `409`:
 *        { success:false, error:{code:'VERSION_CONFLICT', ...},
 *          data:{ current:<authoritative>, serverVersion:<n> }, timestamp }
 *      `current` is the authoritative entity, so the client can apply
 *      last-writer-wins (server wins) and surface a conflict record.
 *   3. On a successful (`2xx`) write, increments `version` and injects it into
 *      the response body (`data.session.version` / `data.player.version`).
 *
 * ## Back-compatibility (AC 6)
 * When no `X-Entity-Version` header is present the request proceeds exactly as
 * before: the conflict check is skipped. The `version` field is still advanced
 * on the write so the token stays monotonic for clients that do send it, and the
 * extra `version` field is additive on the `2xx` body.
 *
 * ## Failure policy
 *  - Entity not found  → `next()` (the route returns its normal 404).
 *  - Internal error    → `next()` (never turn a transient DB hiccup into a fake
 *    conflict; the route's own error handling still applies). This is a
 *    deliberate *fail-open to the route*, not a silent data-loss path: the
 *    request is never dropped, it is simply handled by the route unchanged.
 *
 * The `X-Client-Timestamp` header is accepted but advisory only (the design
 * keeps `timestamp` as display/audit metadata; ordering and arbitration are
 * server-side). It is never used to reject a write.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../config/database';

export type VersionEntityType = 'session' | 'player';

/** The response envelope reused by the existing 409s in `mvpSessions.ts`. */
export interface ConflictBody {
  success: false;
  error: { code: 'VERSION_CONFLICT'; message: string };
  data: { current: unknown; serverVersion: number };
  timestamp: string;
}

export interface VersioningOptions {
  /** Which entity the `X-Entity-Version` header refers to. */
  entity: VersionEntityType;
  /**
   * Resolve the entity's storage identifier from the request. For a session
   * this is normally the `shareCode` (or the session id); for a player it is
   * the `playerId`.
   */
  resolveId: (req: Request) => string | undefined;
}

/** Read the header as an integer, or `null` when absent / non-numeric. */
export function parseEntityVersionHeader(req: Request): number | null {
  const raw = req.header('X-Entity-Version');
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Keys that must never leave the server in a conflict body (or any response).
 * `MvpSession.organizerSecretHash` is the organizer claim credential — leaking
 * it in `data.current` would let any client that can trigger a version conflict
 * capture it (it is stored in the client's `ConflictRecord.authoritative`).
 */
const SENSITIVE_ENTITY_KEYS = new Set([
  'organizerSecretHash',
  'organizerSecretUpdatedAt',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'tokenHash',
]);

/**
 * Return a shallow-safe copy of an entity with sensitive fields removed. The
 * entity is a scalar Prisma row (no nested writes), so a single-level strip is
 * sufficient and keeps the rest of the authoritative object intact for LWW.
 */
export function sanitizeEntity<T>(entity: T): T {
  if (!entity || typeof entity !== 'object') return entity;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity as Record<string, unknown>)) {
    if (SENSITIVE_ENTITY_KEYS.has(key)) continue;
    output[key] = value;
  }
  return output as unknown as T;
}

/**
 * Look up the authoritative version + entity. Returns `null` when the entity
 * does not exist (caller then defers to the route).
 */
async function readCurrent(
  entity: VersionEntityType,
  id: string,
): Promise<{ version: number; current: unknown } | null> {
  if (entity === 'session') {
    // Session routes key on `shareCode`; accept a raw id as a fallback.
    const session = await prisma.mvpSession.findFirst({
      where: { OR: [{ shareCode: id }, { id }] },
    });
    if (!session) return null;
    return { version: session.version ?? 0, current: session };
  }

  const player = await prisma.mvpPlayer.findUnique({ where: { id } });
  if (!player) return null;
  return { version: player.version ?? 0, current: player };
}

/**
 * Increment the entity version and return the new value, or `null` on failure.
 * `{ increment: 1 }` is atomic, so concurrent writers cannot both land on the
 * same value.
 */
async function incrementVersion(entity: VersionEntityType, id: string): Promise<number | null> {
  try {
    if (entity === 'session') {
      const updated = await prisma.mvpSession.updateMany({
        where: { OR: [{ shareCode: id }, { id }] },
        data: { version: { increment: 1 } },
      });
      if (updated.count === 0) return null;
      const fresh = await prisma.mvpSession.findFirst({
        where: { OR: [{ shareCode: id }, { id }] },
        select: { version: true },
      });
      return fresh?.version ?? null;
    }

    const updated = await prisma.mvpPlayer.update({
      where: { id },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    return updated.version ?? null;
  } catch {
    return null;
  }
}

/** Inject the new version into the response body additively. */
function injectVersion(body: unknown, entity: VersionEntityType, version: number): unknown {
  if (!body || typeof body !== 'object') return body;
  const record = body as Record<string, any>;
  if (record.data && typeof record.data === 'object') {
    if (record.data[entity] && typeof record.data[entity] === 'object') {
      record.data[entity].version = version;
    } else {
      record.data.version = version;
    }
  } else {
    record.version = version;
  }
  return record;
}

/**
 * Build the versioning middleware for a route.
 *
 * @example
 *   router.put('/:shareCode', versioning({ entity: 'session',
 *     resolveId: (req) => req.params.shareCode }), handler);
 */
export function versioning(options: VersioningOptions): RequestHandler {
  const { entity, resolveId } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientVersion = parseEntityVersionHeader(req);
    const id = resolveId(req);

    // No header (legacy client) or no id resolvable → behave exactly as today,
    // but still advance the token on a successful write so it stays monotonic.
    if (clientVersion === null || !id) {
      hookSuccess(res, entity, id);
      next();
      return;
    }

    let current: { version: number; current: unknown } | null = null;
    try {
      current = await readCurrent(entity, id);
    } catch {
      // Never fabricate a conflict from a lookup error — defer to the route.
      hookSuccess(res, entity, id);
      next();
      return;
    }

    // Entity cannot be found → let the route produce its normal 404.
    if (!current) {
      hookSuccess(res, entity, id);
      next();
      return;
    }

    if (clientVersion < current.version) {
      const body: ConflictBody = {
        success: false,
        error: {
          code: 'VERSION_CONFLICT',
          message: `The ${entity} was modified by another client (you have v${clientVersion}, server has v${current.version}).`,
        },
        // Never expose server-side secrets (e.g. organizerSecretHash) in the
        // authoritative entity — it is echoed to the client and retained there.
        data: { current: sanitizeEntity(current.current), serverVersion: current.version },
        timestamp: new Date().toISOString(),
      };
      res.status(409).json(body);
      return;
    }

    hookSuccess(res, entity, id);
    next();
  };
}

/**
 * Wrap `res.json` so that, on a `2xx` response, the entity version is
 * incremented in the database and injected into the body before it is sent.
 * Non-`2xx` responses are passed through untouched.
 */
function hookSuccess(res: Response, entity: VersionEntityType, id: string | undefined): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    if (!isSuccess || !id) {
      return originalJson(body as any);
    }

    // Fire the increment, then emit the (possibly patched) body. Express does
    // not await `res.json`, so completing asynchronously is safe.
    incrementVersion(entity, id)
      .then((newVersion) => {
        if (newVersion !== null) {
          originalJson(injectVersion(body, entity, newVersion) as any);
        } else {
          originalJson(body as any);
        }
      })
      .catch(() => {
        originalJson(body as any);
      });

    return res;
  }) as typeof res.json;
}

export default versioning;
