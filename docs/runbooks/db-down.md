# Runbook: Database Unavailable

## Alert
`RallyDatabaseDown` — active DB connections = 0 for 1 minute.

## Impact
All data-dependent requests fail. The app is effectively down.

## Diagnosis (5 min)

1. **Check `GET /api/v1/health`** — confirm `subsystems.database.status === "unhealthy"`.
2. **Check Postgres directly:** `psql -c "SELECT 1"` from the app host.
3. **Check connection pool:** Is Prisma hitting `max_connections`?
4. **Check disk space:** `df -h` on the DB host — full disk stops writes.
5. **Check logs:** Prisma connection errors? Network timeouts?

## Resolution

- **Network partition** → Check VPC/security group rules. Restart app pods.
- **Max connections reached** → Increase `max_connections` in PostgreSQL or add connection pooling (PgBouncer).
- **Disk full** → Free space or expand volume immediately.
- **DB crash** → Restart PostgreSQL. Check `pg_log` for crash details.

## Post-incident
- If caused by connection leak, audit all `prisma.$disconnect()` calls.
- Consider adding PgBouncer for connection pooling.
