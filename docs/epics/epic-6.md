# Epic 6: Production-Grade Platform - Trust, Real-Time, and Intelligence

## Status: Draft

## Epic Goal

Harden Rally from a feature-complete MVP into a production-grade platform by closing the gap between "implemented" and "trustworthy": real user identity, measurable reliability, genuine real-time/offline consistency, real (non-mock) intelligence, and distribution to the app stores — so the platform can scale to multiple communities without the current device-based trust model and mock analytics eroding user and operator confidence.

## Epic Description

**Existing System Context:**

- Current relevant functionality: Epics 1-5 delivered session creation/joining, permission and player-status management, pairing/rotation, scoring and statistics, discovery, and an analytics surface.
- Technology stack: React Native (Expo) frontend `frontend/Rally`, Node.js/Express backend `backend`, PostgreSQL + Prisma, Socket.io, JWT (`jsonwebtoken`, `routes/auth.ts`, `routes/oauth.ts`, `utils/jwt.ts`), bcrypt (`utils/password.ts`). `redis` and `expo-server-sdk` are installed but not wired into the core flow (`cacheService.ts` is currently an in-memory cache; no push pipeline exists). `stripe` is already used by `services/paymentService.ts`/`routes/payments.ts`, outside the core session flow.
- Integration points: MVP session/player routes (device-ID based), `config/socket.ts`, analytics services (`analyticsService`, `smartInsightsService`, `tournamentAnalyticsService`), `predictiveAnalyticsService`.

**Known Gaps This Epic Closes:**

1. **No real identity in the core flow.** A `User` model and `/auth` routes (`routes/auth.ts`, `routes/oauth.ts`) exist, but MVP sessions are keyed on a client device ID and `routes/mvpSessions.ts` applies no auth middleware. Ownership, personalization, cross-device continuity, and trustworthy RBAC are therefore unenforced.
2. **Mock intelligence presented as done.** `backend/src/services/predictiveAnalyticsService.ts` returns `0.5` churn, a fixed `[0.2]` historical churn rate, and `accuracy: 0.72`; Story 5.5's AC targets (accuracy > 75%, retraining, real-time serving) are not genuinely met.
3. **Real-time is partial.** Socket.io wiring exists (`config/socket.ts`, scoring/player-status events) but analytics/tournament real-time is a placeholder (`routes/tournament-analytics.ts:157`).
4. **No production observability.** `backend/src/services/monitoringService.ts` collects in-process metrics, but there is no external metrics/tracing backend, dashboard, or alerting; failures are still discovered by users.
5. **Offline sync is unverified.** `frontend/Rally/src/services/syncManager.ts` uses NetInfo to queue operations while offline, and `AsyncStorage`/`redux-persist` persist state, but conflict resolution, ordering, and data-export guarantees are untested and undocumented.
6. **Distribution not started.** App is Expo-based with `expo-notifications` present but no store builds, push pipeline, or release process.

**Enhancement Details:**

- What's being added/changed: authenticated identity and RBAC over the MVP flow; caching and query optimization; metrics/alerting; hardened real-time and offline sync; a real, explainable prediction pipeline; tournament bracket management; community/social engagement features; and iOS/Android release with push notifications.
- How it integrates: builds on existing Express routes, Prisma schema, Socket.io server, and analytics services without breaking the no-auth share-link join flow (guest join must remain first-class).
- Success criteria: every session has an accountable identity; p95 API latency < 200 ms; 100% of critical routes instrumented; zero data loss across offline/online reconciliation; prediction accuracy > 75% from a real model; successful App Store and Play Store releases with crash-free sessions > 99.5%.

## Ranked Prioritized Items

Sorted by **business impact × implementation urgency**. `Impact` and `Urgency` are 1-5 (5 = highest); `Priority Score = Impact × Urgency`.

| Rank | Workstream | Priority | Impact | Urgency | Score | Why This Rank |
|------|-----------|----------|--------|---------|-------|---------------|
| 1 | **WS1 - Authenticated Identity & Auth** | P0 | 5 | 5 | 25 | Everything downstream (RBAC, personalization, tournaments, social, cross-device sync) is blocked by a real identity layer; also the largest trust/security gap. |
| 2 | **WS2 - Performance, Caching & Query Optimization** | P0 | 4 | 5 | 20 | Directly protects the existing UX/SLAs under growth; low-risk, high-leverage, and a prerequisite for real-time and analytics at scale. |
| 3 | **WS3 - Observability & Alerting** | P0 | 4 | 5 | 20 | You cannot safely ship WS4-WS9 without detection and rollback signals; cheapest risk reduction available. |
| 4 | **WS4 - Hardened Real-Time Sync** | P0 | 5 | 4 | 20 | Real-time rotation/scoring is the core product promise; partial/placeholder real-time is a latent correctness bug. |
| 5 | **WS5 - Offline Sync & Conflict Resolution** | P1 | 4 | 4 | 16 | Courts and venues have unreliable connectivity; unverified offline behavior risks data loss, the worst class of failure. |
| 6 | **WS6 - Real Predictive Intelligence** | P1 | 4 | 4 | 16 | Closes a known integrity debt (mock ML marked Done) and unlocks scheduling/resource decisions; currently a credibility risk. |
| 7 | **WS7 - Tournament Bracket Management** | P1 | 4 | 3 | 12 | High engagement/retention value and a natural extension of existing tournament analytics; depends on WS1. |
| 8 | **WS8 - Community & Social Engagement** | P2 | 3 | 3 | 9 | Growth and retention lever (feed, sharing, NPS) but not blocking core reliability; depends on WS1. |
| 9 | **WS9 - Mobile Release & Push Notifications** | P2 | 5 | 2 | 10 | Highest distribution impact, but urgency is lower until auth, monitoring, and sync are trustworthy; releasing earlier would ship known gaps to stores. |

> Note on ordering: WS9 has the highest raw impact but is deliberately sequenced last among the "build" workstreams because store releases are hard to recall and depend on WS1 (identity for push targeting) and WS3 (crash/telemetry signals). Within the P0 band, the order is dependency-driven: identity → performance → observability → real-time.

## Stories

Each workstream above is delivered as one story, in the ranked order. Priority and estimate are indicative for planning.

### Story 6.1: Authenticated Identity and Auth Hardening
**Priority**: Critical (P0)
**Estimate**: 3 weeks

As a Rally user,
I want to register or log in and have my session activity attributed to a real account,
So that ownership, permissions, and personalization are trustworthy across devices.

**Acceptance Criteria:**
1. Registration, login, and refresh endpoints in `routes/auth.ts` work end-to-end against the `User` model
2. Access + refresh tokens issued via `utils/jwt.ts` with rotation, revocation, and expiry handling
3. `routes/mvpSessions.ts` gains optional/required auth paths, with ownership enforced
4. Existing guest share-link join remains fully functional without login (no regression)
5. Authenticated users can claim guest-created sessions/players by device ID
6. RBAC via `middleware/auth.ts` and `middleware/permissions.ts` enforced on protected routes with tests
7. Password strength (bcrypt) and `strictLimiter` rate limiting verified on auth endpoints
8. OAuth (`routes/oauth.ts`, `services/oauthService.ts`) paths verified and documented

### Story 6.2: Performance, Caching, and Query Optimization
**Priority**: Critical (P0)
**Estimate**: 2 weeks

As a player,
I want sessions and discovery to stay fast as the community grows,
So that browsing and joining never feels slow.

**Acceptance Criteria:**
1. `cacheService.ts` backed by Redis (using the installed `redis` dependency) with graceful in-memory fallback
2. Discovery/session/analytics read paths cached with documented TTLs and invalidation on writes
3. Slow Prisma queries identified and optimized; missing indexes added via migration
4. p95 < 200 ms and p99 < 500 ms on core session routes under load test
5. Cache hit rate > 80% on analytics/read-heavy endpoints
6. Load test results captured and regression thresholds documented

### Story 6.3: Observability and Alerting
**Priority**: Critical (P0)
**Estimate**: 2 weeks

As a platform operator,
I want metrics, traces, and alerts for critical flows,
So that I detect and diagnose incidents in minutes instead of hearing about them from users.

**Acceptance Criteria:**
1. External metrics backend (e.g., Prometheus-compatible) wired to `monitoringService.ts`
2. 100% of critical routes instrumented with request metrics, structured logs, and traces
3. Dashboards for latency, error rate, saturation, and business KPIs
4. Alerts for P0 conditions (error spike, latency breach, DB/Redis down, auth failures)
5. MTTD < 5 minutes for P0 incidents with < 5 false positives/week
6. Incident runbooks documented for every P0 alert type

### Story 6.4: Hardened Real-Time Sync
**Priority**: Critical (P0)
**Estimate**: 2.5 weeks

As a player,
I want rotations, scores, and analytics to update live and correctly,
So that everyone in a session sees the same state without manual refresh.

**Acceptance Criteria:**
1. `config/socket.ts` scales beyond a single instance (adapter/pub-sub) with documented deployment topology
2. Auth-aware socket connections tied to identity from Story 6.1
3. Event delivery p95 < 300 ms; reconnect success > 99%
4. Tournament analytics real-time placeholder (`routes/tournament-analytics.ts:157`) replaced with event-driven updates
5. Idempotent, ordered event handling; no duplicate or lost score events
6. Reconnection and missed-event recovery verified with tests

### Story 6.5: Offline Sync and Conflict Resolution
**Priority**: High (P1)
**Estimate**: 2.5 weeks

As a player at a venue with poor connectivity,
I want my actions queued and reconciled when I'm back online,
So that no scores or data are lost.

**Acceptance Criteria:**
1. `frontend/Rally/src/services/syncManager.ts` queue hardened with ordering, retry, and backoff
2. Server-authoritative conflict resolution with last-writer-wins and explicit conflict surfacing
3. Conflict auto-resolution > 95%; every unresolved conflict visible to the user
4. Zero data loss across offline→online reconciliation in UAT and chaos tests
5. Data export/backup and restore guarantees implemented and documented
6. Offline UX states (queued, syncing, conflict) are clear and localized

### Story 6.6: Real Predictive Intelligence
**Priority**: High (P1)
**Estimate**: 3 weeks

As a platform administrator,
I want predictions from a real, measured model,
So that demand and churn decisions rest on honest accuracy rather than mock constants.

**Acceptance Criteria:**
1. `predictiveAnalyticsService.ts` mock outputs (`0.5` churn, fixed `[0.2]`, `accuracy: 0.72`) replaced with real models
2. `PredictionModel`/`PredictionResult` persistence used for versions, accuracy, and results
3. Measured accuracy > 75% on held-out data for churn and demand
4. Retraining pipeline completes within 24 hours; predictions p95 < 5 s
5. Explainability available for each prediction; training data anonymized and privacy-reviewed
6. Fallback heuristic explicitly labeled as fallback, never reported as measured accuracy

### Story 6.7: Tournament Bracket Management
**Priority**: High (P1)
**Estimate**: 2 weeks

As a tournament organizer,
I want brackets generated and managed through their lifecycle,
So that tournaments run correctly and progression is tracked.

**Acceptance Criteria:**
1. `services/tournamentBracketService.ts` and `services/bracketService.ts` generate valid single/double-elimination brackets
2. Byes, seeding, and non-power-of-two player counts handled correctly
3. Bracket lifecycle (create → progress → complete) persists to `TournamentRound`/`TournamentMatch`
4. Standings integrate with `services/tournamentAnalyticsService.ts`
5. Bracket generation correctness = 100% in tests; tournament completion rate > 80%
6. Organizer UI covers generation, editing, and progression

### Story 6.8: Community and Social Engagement
**Priority**: Medium (P2)
**Estimate**: 2 weeks

As a community manager,
I want a feed, sharing, and satisfaction signals,
So that I can grow and retain the community.

**Acceptance Criteria:**
1. Community feed backed by `routes/community.ts` and `Share`/`SocialConnection` models
2. Social sharing via `routes/sharing.ts` and `routes/shareCard.ts`
3. NPS/satisfaction capture via `TournamentFeedback` and community metrics
4. Onboarding and retention metrics surfaced in the analytics dashboard
5. Feed weekly engagement > 30% of active users; NPS collected from > 25%
6. Privacy controls respected for all shared/aggregated data

### Story 6.9: Mobile Release and Push Notifications
**Priority**: Medium (P2)
**Estimate**: 2 weeks

As a player,
I want the app from the store with useful notifications,
So that I never miss a session or match.

**Acceptance Criteria:**
1. Production iOS and Android builds via Expo EAS with a documented release pipeline
2. Push delivery wired end-to-end (`expo-server-sdk`, `PushToken`, `routes/notifications.ts`)
3. Notification preferences (`NotificationPreferences`) respected; opt-out honored
4. Store approval for App Store and Play Store
5. Crash-free sessions > 99.5%; push opt-in > 60%
6. Staged rollout and documented rollback procedures

## Success Metrics

### Reliability & Performance
- p95 API latency < 200 ms; p99 < 500 ms for core session routes.
- Redis cache hit rate > 80% on analytics/read-heavy endpoints.
- 99.9% availability for core session APIs over a 30-day window.
- Zero data loss across offline→online reconciliation in UAT and chaos tests.

### Security & Identity
- 100% of sessions have an authenticated, accountable owner identity.
- 100% of protected routes covered by RBAC middleware with regression tests.
- Auth token refresh success > 99.5%; unauthorized-access attempts blocked = 100% in security tests.
- Guest share-link join remains functional for 100% of existing flows (no regression).

### Observability
- 100% of critical routes instrumented with metrics, logs, and traces.
- Mean time to detect (MTTD) < 5 minutes for P0 incidents; < 5 false-positive alerts/week.
- Documented runbook coverage for all P0 alert types.

### Real-Time & Offline
- Socket.io event delivery p95 < 300 ms; reconnect success > 99%.
- Offline sync conflict auto-resolution > 95%; unresolved conflicts surfaced to users = 100%.
- Analytics/tournament views are event-driven, not placeholder-polled.

### Intelligence
- Real prediction accuracy > 75% (churn and demand) measured on held-out data, replacing mock constants.
- Model retraining completes within 24 hours; predictions p95 < 5 s.
- Model explainability available for every prediction; training data anonymized and privacy-reviewed.

### Growth & Distribution
- Tournament completion rate > 80%; bracket generation correctness = 100%.
- Community feed weekly engagement > 30% of active users; NPS collected from > 25% of active users.
- iOS and Android store approval achieved; crash-free sessions > 99.5%; push opt-in > 60%.

## Stakeholder Ownership

**Stakeholder roster:** Product Owner (PO), Product Manager (PM), Architect, Dev Lead, Data/ML Engineer, DevOps/SRE, Security Lead, UX Expert, QA/Test Architect, Scrum Master, Community Manager, Platform Admin.

**RACI legend:** **A** = Accountable (owns outcome), **R** = Responsible (does the work), **C** = Consulted, **I** = Informed.

| Workstream | Accountable (A) | Responsible (R) | Consulted (C) | Informed (I) |
|-----------|-----------------|------------------|----------------|--------------|
| WS1 - Auth & Identity | Architect | Dev Lead, Security Lead | PO, UX, QA | Community Manager, Platform Admin |
| WS2 - Performance & Caching | DevOps/SRE | Dev Lead | Architect, QA | PO, Platform Admin |
| WS3 - Observability & Alerting | DevOps/SRE | Dev Lead, QA | Architect, Security Lead | PO, Platform Admin |
| WS4 - Real-Time Sync | Architect | Dev Lead | QA, UX | PO, Community Manager |
| WS5 - Offline Sync & Export | Architect | Dev Lead | QA, UX | PO, Community Manager |
| WS6 - Real Predictive Intelligence | Data/ML Engineer | Data/ML Engineer, Dev Lead | PM, PO, Architect, Security Lead | Platform Admin, Community Manager |
| WS7 - Tournament Brackets | PO | Dev Lead, UX | PM, QA | Community Manager |
| WS8 - Community & Social | PM | Dev Lead, UX | PO, QA | Community Manager |
| WS9 - Mobile Release & Push | Dev Lead | Dev Lead, DevOps/SRE | QA, UX, Security Lead | PO, PM, Community Manager |

**Scrum Master** owns process health, ceremony cadence, and blocker removal across all workstreams (A for delivery process, I on technical decisions). **QA/Test Architect** is consulted on every workstream and accountable for the epic-level quality gate.

## High-Level Delivery Timeline

Indicative 24-week (≈6-month) program across 4 phases. Weeks assume one full-stack stream plus a fractional Data/ML and DevOps/SRE capacity; parallelize where dependencies allow.

| Phase | Weeks | Theme | Workstreams | Milestone / Exit Criteria |
|-------|-------|-------|-------------|---------------------------|
| **Phase A** | 1-7 | Guarded Foundation | WS1 (Auth), WS2 (Performance), WS3 (Observability) | Authenticated identity live with guest-join preserved; p95 < 200 ms; all critical routes instrumented and alerting on. |
| **Phase B** | 8-13 | Reliable Real-Time | WS4 (Real-Time), WS5 (Offline) | Event-driven rotation/scoring/analytics; offline reconciliation passes zero-data-loss UAT; export/restore guaranteed. |
| **Phase C** | 13-19 | Intelligence & Engagement | WS6 (Real ML), WS7 (Tournaments), WS8 (Social) | Real models > 75% accuracy with retraining + explainability; brackets shipped; community feed and NPS live. |
| **Phase D** | 20-24 | Distribution & Scale | WS9 (Mobile Release), hardening | iOS/Android approved; push live; crash-free > 99.5%; post-launch hardening and load re-validation. |

**Milestones:**
- **M1 (Week 7):** Identity + Observability baseline — platform is measurable and accountable.
- **M2 (Week 13):** Real-time + Offline — core gameplay is consistent under poor connectivity.
- **M3 (Week 19):** Intelligence + Engagement — predictions are real and community features drive retention.
- **M4 (Week 24):** Store Release — Rally is publicly distributable and monitored.

## Dependencies

- WS1 (Auth) blocks WS4, WS5, WS6, WS7, WS8, WS9.
- WS2 (Performance/Caching) blocks WS4 and WS6 (real-time and ML serving latency).
- WS3 (Observability) blocks Phase D release and is required for WS6 accuracy monitoring.
- WS5 depends on WS1 (identity for reconciliation) and WS4 (transport).
- WS7 and WS8 depend on WS1 and WS3.
- WS9 depends on WS1, WS3, and WS4.

## Risks and Mitigations

### Identity Migration Risk
- **Risk**: Introducing auth breaks the no-login share-link join flow that is the MVP's core value.
- **Mitigation**: Guest-anonymous identity with later account claim; dual-path tests on every protected route; feature-flag rollout.

### Data Consistency Risk
- **Risk**: Offline conflict resolution silently loses or corrupts scores.
- **Mitigation**: Last-writer-wins with server-authoritative reconciliation plus explicit conflict surfacing; chaos and zero-data-loss UAT.

### ML Integrity Risk
- **Risk**: "Real ML" still fails to reach useful accuracy on sparse data, repeating 5.5's overclaiming.
- **Mitigation**: Publish measured accuracy on held-out data, gate on > 75%, and keep the previous heuristic explicitly labeled as fallback rather than misrepresented as accurate.

### Operational Risk
- **Risk**: Store release ships with undetected regressions.
- **Mitigation**: WS3 monitoring + crash-free gate before release; staged rollout and documented rollback (`docs/rollback-procedures.md`).

### Scope/Capacity Risk
- **Risk**: 9 workstreams overrun a small team.
- **Mitigation**: Strict P0-first sequencing; defer WS8/WS9 scope rather than compromise WS1-WS5 reliability; SM tracks capacity each phase.

## Definition of Done

- [ ] All workstream stories implemented and QA approved
- [ ] Guest share-link join verified with no regression
- [ ] p95 < 200 ms, cache hit rate > 80%, availability 99.9% verified under load
- [ ] 100% of critical routes instrumented; MTTD < 5 min validated
- [ ] Zero data loss across offline/online reconciliation in UAT
- [ ] Real prediction accuracy > 75% with retraining and explainability
- [ ] iOS and Android releases approved; crash-free sessions > 99.5%
- [ ] Security review and privacy compliance sign-off
- [ ] Documentation and runbooks updated

---

**Story Manager Handoff:**

"Please develop detailed user stories for this brownfield epic. Key considerations:

- This is an enhancement to an existing system running Node.js/Express backend (PostgreSQL + Prisma, Socket.io, Redis, JWT scaffolding) with a React Native (Expo) frontend.
- Integration points: MVP session/player routes (device-ID based today), `config/socket.ts`, analytics/prediction services, and the Auth/JWT utilities already present (`routes/oauth.ts`, `utils/jwt.ts`, `utils/password.ts`).
- Existing patterns to follow: RESTful API design, Prisma ORM patterns, Zod/Joi validation, React Native component structure, and the existing rate-limiting tiers.
- Critical compatibility requirements: The no-auth share-link join flow must remain functional and must not regress; all schema changes must be backward compatible; protected routes must enforce RBAC with tests.
- Correct a known debt honestly: Story 5.5's predictive analytics is a mock and must be replaced by a real, measured model whose accuracy is reported, not assumed.
- Each story must include verification that existing functionality remains intact.

The epic should deliver a trustworthy, observable, real-time platform without sacrificing the frictionless joining experience that defines Rally." 
