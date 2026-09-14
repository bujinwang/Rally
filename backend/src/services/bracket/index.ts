/**
 * Story 6.7 — canonical bracket module barrel (design §3).
 *
 * Import from `services/bracket` rather than reaching into individual files, so
 * the module's surface stays stable as `engine.ts` (T02) and `persistence.ts`
 * (T03) land next to `types.ts`.
 *
 *   import type { TournamentBracket } from '../bracket';
 *
 * `types.ts` is type-only plus the `as const` runtime mirrors of its string
 * unions, so this barrel adds no runtime side effects — importing it can never
 * pull a Prisma client or a socket emitter into a test.
 */

export * from './types';
