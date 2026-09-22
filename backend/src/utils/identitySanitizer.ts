/**
 * Outbound identity sanitizer (device-token design §4.3 item 1).
 *
 * The single recursive, deny-list stripper used at the serialization boundary.
 * The root cause of the tournament takeover chain (and of the 22-site session
 * disclosure before it) is that a Prisma `include` returns *parent scalars*
 * (`organizerDeviceId` is a column on `Tournament`, not on the nested player
 * rows), so a curated nested select is never sufficient on its own. This module
 * acts on the SERIALIZED OUTPUT, which is the only place that can remove a
 * parent scalar the data layer legitimately needs.
 *
 * Two surfaces, two key sets:
 *   - SESSION snapshot surfaces (HTTP GET /:shareCode, /join/:shareCode + every
 *     socket broadcast) still carry `deviceId`/`ownerDeviceId` for the client
 *     until the client-coupled cutover, so only the ACCOUNT identity is stripped
 *     there (`stripUserIdentity`).
 *   - PUBLIC tournament read surfaces must carry NO identity at all, because the
 *     leaked `organizerDeviceId` IS the authorization factor the takeover chain
 *     replays (`stripTournamentIdentity`).
 *
 * Extending either set is a one-line change; the guard test
 * (`socket/events/__tests__/session-payload-identity.test.ts`) fails if a
 * stripped key reappears on a covered surface.
 */

/** Account-identity keys — the JWT / account link. Never public. */
export const ACCOUNT_IDENTITY_KEYS = ['userId', 'ownerUserId'] as const;

/**
 * Device-identity keys. `deviceId` / `ownerDeviceId` are the generic pair;
 * `organizerUserId` / `organizerDeviceId` are the tournament-scoped organizer
 * identity columns written at tournament creation.
 */
export const DEVICE_IDENTITY_KEYS = [
  'deviceId',
  'ownerDeviceId',
  'organizerUserId',
  'organizerDeviceId',
] as const;

/** Every identity key that must be absent from a PUBLIC / broadcast surface. */
export const PUBLIC_IDENTITY_KEYS = [
  ...ACCOUNT_IDENTITY_KEYS,
  ...DEVICE_IDENTITY_KEYS,
] as const;

/** Recursive worker. Dates are preserved by reference; arrays are rebuilt. */
function strip(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => strip(entry, keys));
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys.has(key)) continue;
      out[key] = strip(entry, keys);
    }
    return out;
  }
  return value;
}

/** Recursively delete `keys` from `value`, returning a new structure. */
export function stripIdentityKeys<T>(value: T, keys: readonly string[]): T {
  return strip(value, new Set(keys)) as T;
}

/** Strip only the account-identity keys (session snapshot surfaces). */
export function stripUserIdentity<T>(value: T): T {
  return stripIdentityKeys(value, ACCOUNT_IDENTITY_KEYS);
}

/** Strip every identity key (public tournament read surfaces). */
export function stripTournamentIdentity<T>(value: T): T {
  return stripIdentityKeys(value, PUBLIC_IDENTITY_KEYS);
}
