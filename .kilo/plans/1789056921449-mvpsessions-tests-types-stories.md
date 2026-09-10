# Plan: Resolve mvpSessions test OOM/coverage, stale story statuses, and frontend `@ts-nocheck`

## Goal

Address the two remaining follow-ups from the coverage push:

- **Workstream A** — Fix the `mvpSessions.test.ts` OOM at the root cause, re-enable it in the default suite, and add real coverage for `backend/src/routes/mvpSessions.ts`.
- **Workstream B** — Reconcile stale story statuses against actual code, remove the 21 frontend `// @ts-nocheck` directives, and fix a broken root test script.

This plan is for an implementation-capable agent. No application behavior should change except where a test uncovers a genuine bug (see Risks).

## Locked decisions

1. **OOM fix:** enable ts-jest `isolatedModules: true` (transpile-only), re-enable `mvpSessions.test.ts` in the default suite, and add a separate `typecheck` script so type safety is still enforced.
2. **Story rigor:** verify each story's acceptance criteria against actual code/tests, then set status honestly (`Done` only where genuinely met).
3. **`@ts-nocheck`:** remove all 21 directives in batches, fixing real errors; use per-line `@ts-expect-error` only where a real fix is not feasible.

## Current state (verified)

- `backend/src/routes/mvpSessions.ts` = **4,383 lines, 42 handlers**; test at `backend/src/__tests__/mvpSessions.test.ts` (438 lines) covers only 3.
- `backend/jest.config.js` excludes the file with comment "causes OOM — run separately with `NODE_OPTIONS=--max-old-space-size=8192`". Cause is ts-jest full type-check of the module graph (default `isolatedModules: false`).
- Backend coverage after the last session: **37% lines / 20% branches / 33% functions** (52 suites, 498 passing).
- Draft stories: `2.1`, `5.2`, `5.3`, `5.4`, `5.5`. Features appear implemented for 2.1/5.2/5.3/5.5; **5.4 (community engagement/NPS/retention) has no implementation** found in `backend/src`.
- Frontend root is `frontend/Rally` (not `frontend/BadmintonGroup`). `tsconfig.json` is `strict: true`. 21 files carry `// @ts-nocheck`.
- Root `package.json` `test:all` references the non-existent `frontend/BadmintonGroup` path — broken.

## Workstream A — Backend test infra + mvpSessions

### A1. Add a typecheck script
- File: `backend/package.json`
- Add `"typecheck": "tsc --noEmit"` to `scripts`.
- Confirm it runs clean before/after (record any pre-existing errors separately; do not fix unrelated ones in this plan).

### A2. Fix ts-jest config
- File: `backend/jest.config.js`
- Change transform to:
  ```js
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
  ```
- Remove `'mvpSessions\\.test\\.ts'` from `testPathIgnorePatterns` (keep `/node_modules/`).
- Replace the stale OOM comment.

### A3. Make the existing mvpSessions tests run and pass
- Fix stale mocks/assertions in `backend/src/__tests__/mvpSessions.test.ts`. Known issues:
  - Share-code-collision test sets `findUnique` with `mockResolvedValueOnce` then immediately overrides with `mockResolvedValue`, breaking the collision sequence. Rewrite with an explicit ordered mock (`mockResolvedValueOnce(...).mockResolvedValueOnce(...)`).
- Add mocks so organizer-protected endpoints are reachable, following the pattern in `backend/src/routes/__tests__/pairings.test.ts`:
  - `../middleware/permissions` (`requireOrganizer`, `requireOrganizerOrSelf` → pass-through)
  - `../middleware/rateLimit` (`createRateLimiters` → pass-through)
  - `../services/messagingService`, `../socket/notificationHandlers`, `../utils/notificationHelper`, `../utils/statisticsService` as needed.
- Run `npx jest src/__tests__/mvpSessions.test.ts` and then full `npm test`.

### A4. Extend coverage (high value first)
Add `describe` blocks for the highest-value uncovered handlers in `mvpSessions.ts`:
- `PUT /:shareCode` (update session)
- `PUT /terminate/:shareCode`, `PUT /reactivate/:shareCode`
- `POST /:shareCode/games` (generate pairings)
- `PUT /:shareCode/games/:gameId/score`
- `GET /:shareCode/rotation`
- `GET /:shareCode/statistics`, `GET /:shareCode/leaderboard`, `GET /:shareCode/players/:playerName/stats`
- `POST /:shareCode/matches` and match scoring
- `PUT /:shareCode/courts`
- `POST /claim`
Cover success + auth-denied + validation-error paths. Prefer testing unique live handlers only.

### A5. Re-measure
- Run `npm run test:coverage`, record the before/after for `mvpSessions.ts` (currently 15% lines, 762 uncovered).

## Workstream B — Frontend type-safety + docs reconciliation

### B1. Fix the broken root script
- File: `package.json` (root)
- Change `frontend/BadmintonGroup` → `frontend/Rally` in `test:all`.

### B2. Establish a frontend baseline
- `cd frontend/Rally && npx tsc --noEmit` (with `@ts-nocheck` in place) and `npm test`. Record current pass/fail so regressions are attributable.

### B3. Remove `@ts-nocheck` in batches
Remove the directive, run `npx tsc --noEmit`, fix errors, then proceed. Order lowest-risk first:

1. **Tests:** `src/__tests__/QuickScoreRecordingScreen.test.tsx`, `src/hooks/__tests__/usePermissions.test.tsx`, `src/components/__tests__/GameTimer.test.tsx`
2. **Design-system:** `src/components/design-system/Layout/PlayerCountIndicator.tsx`, `src/components/design-system/Layout/SessionHeader.tsx`
3. **Feature components:** `src/components/PredictionDashboardScreen.tsx`, `src/components/TournamentAnalyticsScreen.tsx`
4. **Smaller screens:** `src/screens/GolfScorecardScreen.tsx`, `src/screens/FriendsListScreen.tsx`, `src/screens/SessionSettingsScreen.tsx`, `src/screens/SessionDiscoveryScreen.tsx`, `src/screens/MySessionsScreen.tsx`, `src/screens/UserProfileScreen.tsx`
5. **Larger screens:** `src/screens/SessionHistoryScreen.tsx`, `src/screens/SessionOverviewScreen.tsx`, `src/screens/PlayerProfileScreen.tsx`, `src/screens/StatisticsDashboardScreen.tsx`, `src/screens/SessionDetailScreen.tsx`, `src/screens/LiveGameScreen.tsx`, `src/screens/MatchScoreRecordingScreen.tsx`, `src/screens/rotation/RotationScreen.tsx`

Rules:
- Prefer correct types over suppressions.
- Use `// @ts-expect-error <reason>` on a single line only when a typed fix is not feasible (e.g., untyped third-party module); never re-add file-level `@ts-nocheck`.
- Keep runtime behavior identical.

### B4. Verify frontend
- `npx tsc --noEmit` clean with **zero** `@ts-nocheck` remaining under `src/` (`rg "@ts-nocheck" src`).
- `npm test` still green.

### B5. Reconcile story statuses
For each Draft story, verify acceptance criteria against code/tests, then update `Status` plus `Dev Agent Record`/`Change Log` with evidence:
- `docs/stories/2.1.story.md` — permission system (middleware, routes, UI). Expected: `Done`.
- `docs/stories/5.2.story.md` — player performance (`routes/analytics.ts`, `analyticsService`, `PlayerProfileScreen`). Expected: `Done`.
- `docs/stories/5.3.story.md` — tournament analytics (`tournamentAnalyticsService`, `TournamentAnalyticsScreen`). Expected: `Done`.
- `docs/stories/5.5.story.md` — predictive analytics (`predictiveAnalyticsService`, `PredictionDashboardScreen`). Expected: `Done`, with a note that the model is mocked (see `predictiveAnalyticsService.ts` "Mock churn probability").
- `docs/stories/5.4.story.md` — community engagement/NPS/retention. No implementation found. Expected: **leave `Draft`** and add a note listing missing ACs (do not mark Done).

### B6. Refresh stale summary docs
- `FEATURE_ROADMAP.md`: update the `@ts-nocheck` count (was "2/37") and the tracked-debt note to reflect the final count.
- `PRODUCTION_READY_SUMMARY.md`: "27 files remaining with @ts-nocheck" is stale — update to actual.
Only adjust the specific stale numbers; do not rewrite these docs.

## Validation

- Backend: `npm run typecheck`; `npm test` (green, no OOM, `mvpSessions.test.ts` included); `npm run test:coverage` (record delta).
- Frontend: `cd frontend/Rally && npx tsc --noEmit` (clean); `npm test` (green); `rg "@ts-nocheck" src` returns nothing.
- Root: `npm run test:all` completes end-to-end (script path fixed).

## Risks

- **isolatedModules semantics:** const enums / type-only re-exports can change. Verified none of `const enum`/`export =` exist in `backend/src`, so risk is low; the full suite run is the guard.
- **Large route test scope:** 42 handlers is a lot; prioritize unique handlers and accept partial coverage rather than chasing 100%.
- **Type cleanup surface area:** some screens may surface many errors. Timebox per file; use targeted `@ts-expect-error` rather than blocking.
- **Test may expose real bugs:** if a handler is genuinely broken, fix the code and note it, or mark the test `it.skip` with a referenced issue — do not silently loosen assertions.

## Out of scope

- Splitting `mvpSessions.ts` into sub-routers.
- Removing duplicate/dead route definitions (`POST /:shareCode/games` at lines 1821 and 3699; `GET /:shareCode/players/me/:deviceId` at 3239 and 3635). Flag them; leave behavior unchanged.
- Adding coverage thresholds or CI gating.
- Implementing story 5.4.
- Fixing unrelated pre-existing `typecheck` errors beyond what these changes surface.

## Open questions

- None blocking. Decide later whether to add Jest `coverageThreshold` once `mvpSessions.ts` coverage is meaningful.
