# Runbook: Error Rate Spike

## Alert
`RallyHighErrorRate` — error rate > 1% for 2 minutes.

## Impact
Users may be experiencing failed requests. Revenue-impacting if checkout/join flows are affected.

## Diagnosis (5 min)

1. **Check the dashboard:** `Rally — Overview` > Error Rate panel.
2. **Filter by status code:** Is it 4xx (client) or 5xx (server)?
   - 4xx spike → likely a client/API contract issue or auth problem.
   - 5xx spike → server-side bug or dependency failure.
3. **Check logs:** Search for `level:error` in the last 10 minutes. Look for correlation IDs that appear multiple times.
4. **Check health:** `GET /api/v1/health` — is any subsystem `unhealthy`?
5. **Check recent deploys:** Did a deployment happen in the last 30 minutes?

## Resolution

- **DB down** → see `db-down.md`.
- **Redis down** → see `redis-down.md`.
- **Auth failure surge** → see `auth-failure-surge.md`.
- **Application bug** → identify the endpoint from logs, roll back the last deploy if correlated.

## Post-incident
- Document root cause in incident tracker.
- If threshold was too sensitive, tune in `docs/observability/alerts/p0-alerts.yml`.
