# Runbook: Redis / Cache Degradation

## Alert
`RallyLowCacheHitRate` — cache hit rate < 80% for 5 minutes.

## Impact
Increased DB load, higher latency, potential DB overload cascade.

## Diagnosis (5 min)

1. **Check `GET /api/v1/health/cache`** — is cache `healthy`, `degraded`, or `unhealthy`?
2. **Check Redis directly:** `redis-cli ping` from the app host.
3. **Check memory:** `redis-cli INFO memory` — is Redis at `maxmemory`?
4. **Check logs:** Connection errors? Circuit breaker open?
5. **Check the dashboard:** Did request volume spike, diluting the cache?

## Resolution

- **Redis unreachable** → Check network, DNS, security groups. Restart Redis if needed.
- **Circuit breaker open** → The app has already fallen back to memory cache. Check `GET /api/v1/health/cache` for `breaker: "open"`. Wait for the 30s cooldown or restart the app to force a reconnect.
- **Cache invalidation storm** → Did a bulk write bump all generations? Check if invalidation is proportional.
- **Memory eviction** → Increase Redis memory or lower TTLs.

## Post-incident
- Verify graceful degradation worked (no 5xx during outage).
- If hit rate is chronically low, review TTLs and cacheable endpoints.
