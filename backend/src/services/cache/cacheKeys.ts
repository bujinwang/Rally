/**
 * Cache key builders, TTL constants and digests (Story 6.2, AC 16).
 *
 * Key discipline (AC 16 — no PII in keys):
 *  - Keys are namespaced with `rally:cache:` (applied by the store layer).
 *  - The *variable* part of every key is SHA-1 hashed so raw user input, email,
 *    phone numbers or free-text never appear in a key.
 *  - Each domain embeds its current generation (`g<gen>`) so invalidation is an
 *    O(1) `INCR` rather than a `KEYS`/`SCAN`.
 */

import crypto from 'crypto';

/** Default namespace prepended to every key by the store layer. */
export const CACHE_KEY_PREFIX = 'rally:cache:';

/**
 * Single source of truth for TTLs (seconds). Documented in
 * `docs/perf/6.2-caching.md`.
 */
export const TTL = {
  discovery: 300, // 5 min  — mutable list
  session: 600, // 10 min — session detail
  popular: 900, // 15 min
  location: 1800, // 30 min — location-based queries
  nearby: 300, // 5 min  — nearby list
  stats: 3600, // 60 min — aggregate statistics
  analytics: 300, // 5 min  — analytics reads
  http: 300, // 5 min  — default for HTTP middleware
} as const;

export type CacheDomain = keyof typeof TTL;

/** SHA-1 hex digest (40 chars) of a string. */
export function digest(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

/** Recursively sort object keys so structurally-equal inputs hash identically. */
function sortValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Deterministic JSON serialization (stable key order). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value) ?? null);
}

/** Key holding a domain's generation counter: `gen:<domain>`. */
export function generationKey(domain: string): string {
  return `gen:${domain}`;
}

/** Domain-scoped, generation-stamped key: `<domain>:g<gen>:<part>`. */
export function domainKey(domain: string, generation: number, part: string): string {
  return `${domain}:g${generation}:${part}`;
}

/**
 * HTTP middleware key: `<domain>:g<gen>:http:<METHOD>:<path>:<sha1(query)>`.
 * No identity is embedded for public reads (AC 16 / assumption A5).
 */
export function httpKey(
  domain: string,
  generation: number,
  method: string,
  path: string,
  queryDigest: string
): string {
  return `${domain}:g${generation}:http:${method.toUpperCase()}:${path}:${queryDigest}`;
}

/** Digest for a discovery query (filters + optional rounded user location). */
export function discoveryDigest(
  filters: Record<string, any>,
  userLocation?: { latitude: number; longitude: number }
): string {
  const filterParts = Object.entries(filters ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value instanceof Date ? value.toISOString() : String(value)}`)
    .join('|');

  const locationPart = userLocation
    ? `loc:${userLocation.latitude.toFixed(2)}:${userLocation.longitude.toFixed(2)}`
    : 'loc:none';

  return digest(`${locationPart}|${filterParts}`);
}

/** Digest for a nearby query (coordinates rounded to 2 dp to bound key space). */
export function nearbyDigest(latitude: number, longitude: number, radius: number): string {
  return digest(`${latitude.toFixed(2)},${longitude.toFixed(2)},${radius}`);
}
