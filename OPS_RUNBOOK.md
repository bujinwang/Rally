# Operations Runbook — BadmintonGroup

Quick-reference guide for common production operations. For full details see `PRODUCTION_DEPLOYMENT_GUIDE.md`.

---

## Service Map

| Service | Port | Container | Health Check |
|--------|------|-----------|--------------|
| Nginx | 80/443 | `badminton-nginx-prod` | `curl localhost/health` |
| Backend API | 3001 | `badminton-backend-prod` | `curl localhost:3001/health` |
| PostgreSQL | 5432 | `badminton-postgres-prod` | `pg_isready -U badminton_user` |
| Redis | 6379 | `badminton-redis-prod` | `redis-cli ping` |
| Prometheus | 9090 | `badminton-prometheus-prod` | `curl localhost:9090/-/healthy` |
| Grafana | 3000 | `badminton-grafana-prod` | `curl localhost:3000/api/health` |

---

## Daily Operations

### Check service status
```bash
docker-compose -f docker/docker-compose.prod.yml ps
```

### View logs (last 100 lines, follow)
```bash
docker-compose -f docker/docker-compose.prod.yml logs --tail=100 -f backend
```

### Check health endpoint
```bash
curl -s https://yourdomain.com/health | jq .
```

### Database backup (manual)
```bash
./scripts/backup-db.sh
```

### Check disk usage
```bash
df -h /
docker system df
```

---

## Deploying a New Version

```bash
# 1. Pull latest code
git pull origin main

# 2. Optional: backup DB first
./scripts/backup-db.sh

# 3. Rebuild and restart
docker-compose -f docker/docker-compose.prod.yml up -d --build

# 4. Run migrations
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma migrate deploy

# 5. Health check
curl -f https://yourdomain.com/health

# 6. Verify
curl -s https://yourdomain.com/api/v1/ | jq .
```

Or use the automated script:
```bash
./scripts/deploy-production.sh deploy
```

---

## Rollback

```bash
# Quick: revert last commit + rebuild
git revert HEAD --no-edit
docker-compose -f docker/docker-compose.prod.yml up -d --build
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma migrate deploy

# With database restoration:
./scripts/deploy-production.sh rollback backups/backup_TIMESTAMP.sql.gz
```

---

## Common Incidents

### Backend is down / 502 errors
```bash
docker-compose -f docker/docker-compose.prod.yml logs --tail=50 backend
docker-compose -f docker/docker-compose.prod.yml restart backend
```

### Database connection errors
```bash
# Check if Postgres is healthy
docker-compose -f docker/docker-compose.prod.yml exec postgres pg_isready -U badminton_user

# Check connection count
docker-compose -f docker/docker-compose.prod.yml exec postgres \
  psql -U badminton_user -d badminton_prod \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

### Redis connection errors
```bash
docker-compose -f docker/docker-compose.prod.yml exec redis redis-cli ping
# Should return PONG
docker-compose -f docker/docker-compose.prod.yml restart redis
```

### Rate limiting too aggressive
Edit `.env.production`:
```ini
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX_REQUESTS=200   # increase from default 100
```
Then restart: `docker-compose -f docker/docker-compose.prod.yml up -d backend`

### SSL certificate expired
```bash
# Renew with certbot (if using Let's Encrypt)
certbot renew --nginx
docker-compose -f docker/docker-compose.prod.yml restart nginx
```

### Migrations stuck / Prisma errors
```bash
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma migrate status
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

---

## Database Operations

### Restore from backup
```bash
gunzip -c backups/backup_TIMESTAMP.sql.gz | \
  docker-compose -f docker/docker-compose.prod.yml exec -T postgres \
  psql -U badminton_user -d badminton_prod
```

### Open Prisma Studio (read-only inspection)
```bash
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma studio
# Access at http://localhost:5555
```

### Count sessions / players
```bash
docker-compose -f docker/docker-compose.prod.yml exec postgres \
  psql -U badminton_user -d badminton_prod \
  -c "SELECT count(*) FROM \"MvpSession\"; SELECT count(*) FROM \"MvpPlayer\";"
```

---

## Monitoring

### Grafana dashboards
http://your-server:3000 — login with `admin` / `$GRAFANA_ADMIN_PASSWORD`

### Prometheus queries
http://your-server:9090

Key queries:
- **Request rate:** `rate(http_requests_total[5m])`
- **Error rate:** `rate(http_requests_total{status=~"5.."}[5m])`
- **p95 latency:** `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`

### Uptime monitoring
Set up external monitoring at:
- https://uptimerobot.com (free, 5-min checks)
- https://statuscake.com

Point at: `https://yourdomain.com/health`

---

## Scheduled Maintenance

### Weekly checklist
- [ ] Review error logs: `docker-compose logs backend | grep ERROR | tail -20`
- [ ] Check backup succeeded: `ls -lh backups/latest.sql.gz`
- [ ] Check disk space: `df -h`
- [ ] Review Grafana dashboards for anomalies

### Monthly checklist
- [ ] Run security audit: `npm audit --audit-level high`
- [ ] Update npm dependencies (test in staging first)
- [ ] Prune Docker images: `docker system prune -a --filter "until=168h"`
- [ ] Rotate JWT secrets (requires app restart + user re-login)
- [ ] Test restore procedure with a recent backup

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| **Primary on-call** | your-email@example.com |
| **Secondary** | backup-email@example.com |
| **Cloud provider status** | https://status.aws.amazon.com |
| **Sentry dashboard** | https://sentry.io/your-org |

---

## Useful Aliases

Add to `~/.bashrc`:
```bash
alias bg-status='docker-compose -f docker/docker-compose.prod.yml ps'
alias bg-logs='docker-compose -f docker/docker-compose.prod.yml logs --tail=100 -f backend'
alias bg-health='curl -s https://yourdomain.com/health | jq .'
alias bg-backup='./scripts/backup-db.sh'
alias bg-restart='docker-compose -f docker/docker-compose.prod.yml restart backend'
```

---

*Last updated: 2026-05-09*
