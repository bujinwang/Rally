# Rally Observability Architecture (Story 6.3)

## Overview

Rally exposes a Prometheus-compatible `/metrics` endpoint, structured JSON logs with correlation IDs, and a unified health endpoint. Dashboards and alerts are committed as code; provisioning is an ops concern.

## Metric Naming Convention

All metrics are prefixed `rally_` and use base units:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `rally_http_requests_total` | Counter | method, route, status | Total HTTP requests |
| `rally_http_request_duration_seconds` | Histogram | method, route | Request duration |
| `rally_errors_total` | Counter | type, endpoint | Application errors |
| `rally_business_active_users` | Gauge | — | Active users |
| `rally_business_total_sessions` | Gauge | — | Total sessions |
| `rally_system_memory_usage_mb` | Gauge | — | Process heap memory |
| `rally_system_cpu_usage_percent` | Gauge | — | Process CPU % |
| `rally_db_connections_active` | Gauge | — | Active DB connections |
| `rally_cache_hit_rate` | Gauge | — | Cache hit rate (0-1) |

**Label cardinality rule:** `route` uses canonical Express patterns (e.g. `/:shareCode`). Never use userId, deviceId, or free-text as labels.

## Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | None | Liveness probe (load balancer) — static, no DB query |
| `GET /api/v1/health` | None | Aggregated health (DB + Redis + cache + process) |
| `GET /api/v1/health/cache` | None | Cache-specific health (Story 6.2) |
| `GET /metrics` | Bearer token | Prometheus text format |

## Log Pipeline

Winston outputs structured JSON to stdout. Each log line includes:
- `timestamp`, `level`, `message`
- `correlationId` (from `x-request-id` header or generated)
- `method`, `url`, `statusCode` (for request logs)
- Redacted sensitive fields: `authorization`, `cookie`, `password`, `token`, `apiKey`, `secret`, `refreshToken`, `accessToken`

**Shipping:** pipe stdout to your log aggregator (Loki, CloudWatch, Datadog, etc.).

## Alert Thresholds (Baseline)

Baseline from Story 6.2 load test (memory driver, worst-case):
- p95 = 4.1ms, p99 = 14.6ms, hitRate = 100%

| Alert | Threshold | For | Runbook |
|-------|-----------|-----|---------|
| Error rate | > 1% | 2m | `error-spike.md` |
| p95 latency | > 200ms | 2m | `latency-breach.md` |
| Cache hit rate | < 80% | 5m | `redis-down.md` |
| DB connections | == 0 | 1m | `db-down.md` |
| Auth failures | > 10/min | 2m | `auth-failure-surge.md` |

## Retention & Cost

At 15s scrape interval with ~50 metrics × 4 labels:
- **Uncompressed:** ~2 MB/day per instance
- **Prometheus with 15-day retention:** ~30 MB
- **Cost:** negligible for a single-node setup; scale linearly with instance count

## Configuration (env-only)

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_ENABLED` | `true` in prod, `false` otherwise | Enable `/metrics` |
| `METRICS_PORT` | `9090` | Metrics endpoint port |
| `METRICS_PATH` | `/metrics` | Metrics endpoint path |
| `METRICS_AUTH_TOKEN` | — | Bearer token for `/metrics` |
| `LOG_LEVEL` | `info` | Winston log level |
| `CORRELATION_ID_HEADER` | `x-request-id` | Correlation ID header name |

## Files

- `backend/src/services/metricsRegistry.ts` — Prometheus registry
- `backend/src/middleware/correlationId.ts` — Correlation ID propagation
- `backend/src/middleware/requestMetrics.ts` — Request instrumentation
- `backend/src/middleware/logRedaction.ts` — Log redaction
- `backend/src/services/healthAggregator.ts` — Health aggregation
- `backend/src/routes/metrics.ts` — Metrics endpoint
- `docs/observability/dashboards/rally-overview.json` — Grafana dashboard
- `docs/observability/alerts/p0-alerts.yml` — Alert rules
- `docs/runbooks/*.md` — 5 runbooks
