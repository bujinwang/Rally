# Runbook: Latency Breach

## Alert
`RallyHighLatency` — p95 latency > 200ms for 2 minutes.

## Impact
User experience degrades. Mobile users on poor networks may see timeouts.

## Diagnosis (5 min)

1. **Check the dashboard:** `Rally — Overview` > Latency panel. Is p50 also elevated or only p95/p99?
   - p50 normal + p95 high → tail latency issue (slow queries, large payloads).
   - All percentiles high → systemic overload.
2. **Check saturation:** Memory, CPU, DB connections — any near limit?
3. **Check cache hit rate:** If < 80%, see `redis-down.md`.
4. **Identify slow endpoints:** `monitoringService.getAggregatedStats()` or logs for `responseTime > 1000`.
5. **Check recent deploys:** New N+1 query? Missing index?

## Resolution

- **Cache miss storm** → Warm cache manually or lower TTL temporarily.
- **DB overload** → Check for slow queries (`pg_stat_statements`), add indexes if justified.
- **Memory pressure** → Restart the process if leaking; investigate heap dump.
- **CPU bound** → Profile with `--prof`, optimize hot paths.

## Post-incident
- Document the slow endpoint and fix in the next sprint.
- Tune threshold if it was a transient spike (e.g., backup running).
