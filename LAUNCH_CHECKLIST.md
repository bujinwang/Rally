# 🚀 Launch Checklist - BadmintonGroup MVP

**Target Launch Date:** __________  
**Platform:** Production  
**Version:** 1.0.0  
**Status:** Pre-Launch

---

## 🎯 Mission: Go Live!

This checklist will guide you through launching the BadmintonGroup MVP to production. Follow each step carefully.

**Estimated Time:** 5-7 days (can be accelerated to 3-4 days)

---

## Phase 1: Infrastructure Setup (Day 1-2)

### Step 1: Choose Deployment Platform

**Option A: Cloud Provider (Recommended)**
- [ ] AWS (Elastic Beanstalk, RDS, ElastiCache)
- [ ] Google Cloud (Cloud Run, Cloud SQL, Memorystore)
- [ ] DigitalOcean (Droplets, Managed Database)
- [ ] Azure (App Service, Database for PostgreSQL)
- [ ] Heroku (Quickest, but pricier)

**Option B: Self-Hosted**
- [ ] VPS (Linode, Vultr, OVH)
- [ ] Own server

**My Choice:** ________________

---

### Step 2: Provision Database

#### PostgreSQL 15+ Setup

**Cloud Options:**
```bash
# AWS RDS
# 1. Go to AWS RDS Console
# 2. Create Database → PostgreSQL 15
# 3. Choose db.t3.micro (free tier) or db.t3.small
# 4. Enable automated backups
# 5. Save connection details

# DigitalOcean Managed Database
# 1. Create → Databases → PostgreSQL 15
# 2. Choose Basic plan ($15/month)
# 3. Enable daily backups
# 4. Save connection details

# Heroku Postgres
heroku addons:create heroku-postgresql:mini
heroku config:get DATABASE_URL
```

**Connection Details:**
- [ ] Database URL saved: `postgresql://user:password@host:5432/dbname`
- [ ] Database user created: `badminton_user`
- [ ] Database name created: `badminton_prod`
- [ ] Firewall rules configured (allow your server IP)
- [ ] SSL certificate obtained (if required)

---

### Step 3: Provision Redis (Optional but Recommended)

**Cloud Options:**
```bash
# AWS ElastiCache
# 1. Create Redis cluster (cache.t3.micro)
# 2. Save endpoint

# DigitalOcean Managed Redis
# 1. Create Redis cluster ($15/month)
# 2. Save connection details

# Redis Cloud (Free tier available)
# 1. Sign up at redis.com
# 2. Create database
# 3. Get connection URL
```

**Connection Details:**
- [ ] Redis URL saved: `redis://password@host:6379`
- [ ] Redis password secured

**Skip Redis?** You can skip Redis for now, the app will work without caching.

---

### Step 4: Get Domain and SSL Certificate

**Domain:**
```bash
# Buy domain from Namecheap, GoDaddy, or Google Domains
# Recommended: badmintongroup.app or similar

# DNS Configuration
# A record: @ → your-server-ip
# A record: www → your-server-ip
# CNAME: api → your-server-ip
```

- [ ] Domain purchased: ________________
- [ ] DNS A records configured
- [ ] DNS propagation verified (24-48 hours)

**SSL Certificate:**
```bash
# Option 1: Let's Encrypt (Free, Auto-renew)
sudo apt-get install certbot
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Option 2: CloudFlare (Free SSL + CDN + DDoS protection)
# 1. Sign up at cloudflare.com
# 2. Add your domain
# 3. Update nameservers
# 4. Enable SSL (Flexible or Full)
```

- [ ] SSL certificate obtained
- [ ] Certificate files saved: `fullchain.pem`, `privkey.pem`
- [ ] HTTPS working

---

## Phase 2: Server Setup (Day 2)

### Step 5: Provision Server

**Recommended Server Specs:**
- **Minimum:** 2 CPU, 2GB RAM, 20GB SSD
- **Recommended:** 2 CPU, 4GB RAM, 40GB SSD
- **OS:** Ubuntu 22.04 LTS

**Cloud Setup:**
```bash
# DigitalOcean Droplet
# 1. Create Droplet → Ubuntu 22.04
# 2. Choose $12/month plan (2GB RAM)
# 3. Add SSH key
# 4. Create droplet

# AWS EC2
# 1. Launch Instance → t3.small
# 2. Ubuntu 22.04 AMI
# 3. Configure security group (22, 80, 443)
# 4. Launch with SSH key
```

- [ ] Server provisioned
- [ ] SSH access working: `ssh user@your-server-ip`
- [ ] Server IP address: ________________

---

### Step 6: Install Dependencies

```bash
# SSH into server
ssh user@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Install Git
sudo apt install git -y

# Install Node.js (for build if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Log out and back in for Docker group
exit
ssh user@your-server-ip
```

**Verification:**
- [ ] Docker installed: `docker --version`
- [ ] Docker Compose installed: `docker-compose --version`
- [ ] Git installed: `git --version`
- [ ] Node.js installed: `node --version`

---

### Step 7: Clone Repository

```bash
# Clone your repository
cd ~
git clone https://github.com/yourusername/BadmintonGroup.git
cd BadmintonGroup

# Checkout main branch
git checkout main
git pull origin main
```

- [ ] Repository cloned
- [ ] On main branch
- [ ] Latest code pulled

---

## Phase 3: Configuration (Day 2-3)

### Step 8: Generate Production Secrets

```bash
# Generate JWT secrets
openssl rand -base64 32  # Copy for JWT_SECRET
openssl rand -base64 32  # Copy for JWT_REFRESH_SECRET

# Generate database password
openssl rand -base64 24  # Copy for DATABASE_PASSWORD

# Generate Redis password (if using)
openssl rand -base64 24  # Copy for REDIS_PASSWORD
```

**Save these securely!** You'll need them in the next step.

- [ ] JWT_SECRET generated: ________________
- [ ] JWT_REFRESH_SECRET generated: ________________
- [ ] DATABASE_PASSWORD generated: ________________
- [ ] REDIS_PASSWORD generated (optional): ________________

---

### Step 9: Configure Environment Variables

```bash
# Create production environment file
cd ~/BadmintonGroup
nano .env.production
```

**Paste this configuration (replace with your values):**

```bash
# Application
NODE_ENV=production
PORT=3001

# Database (USE YOUR ACTUAL VALUES!)
DATABASE_URL=postgresql://badminton_user:YOUR_DB_PASSWORD@your-db-host:5432/badminton_prod

# JWT Configuration (USE YOUR GENERATED SECRETS!)
JWT_SECRET=your_generated_jwt_secret_here
JWT_REFRESH_SECRET=your_generated_refresh_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration (USE YOUR DOMAIN!)
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Redis (Optional)
REDIS_URL=redis://password@your-redis-host:6379

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Logging
LOG_LEVEL=info

# Security
BCRYPT_ROUNDS=12

# Sentry (Optional - for error tracking)
# SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**Save and secure the file:**
```bash
# Save: Ctrl+O, Enter, Ctrl+X
chmod 600 .env.production
```

**Verification:**
- [ ] .env.production created
- [ ] DATABASE_URL configured with production database
- [ ] JWT secrets configured (strong, random)
- [ ] CORS_ORIGIN set to production domain
- [ ] FRONTEND_URL set to production domain
- [ ] File permissions set to 600

---

### Step 10: Create Docker Secrets File

```bash
# Create secrets file for Docker Compose
nano .env.secrets
```

**Content:**
```bash
DB_PASSWORD=your_database_password
REDIS_PASSWORD=your_redis_password
```

```bash
# Save and secure
chmod 600 .env.secrets
```

- [ ] .env.secrets created
- [ ] Passwords configured
- [ ] File permissions set to 600

---

## Phase 4: Database Setup (Day 3)

### Step 11: Run Database Migrations

```bash
cd ~/BadmintonGroup/backend

# Install dependencies (if not using Docker for this step)
npm install

# Set DATABASE_URL
export DATABASE_URL="postgresql://badminton_user:PASSWORD@host:5432/badminton_prod"

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Verify database
npx prisma db pull
```

**Verification:**
- [ ] Prisma client generated
- [ ] Migrations ran successfully
- [ ] Database schema created
- [ ] Tables visible in Prisma Studio or database client

---

## Phase 5: Deployment (Day 3-4)

### Step 12: Build and Deploy

```bash
cd ~/BadmintonGroup

# Make deployment script executable
chmod +x scripts/deploy-production.sh

# Run deployment
./scripts/deploy-production.sh deploy
```

**The script will:**
1. Check prerequisites
2. Create database backup
3. Build Docker images
4. Stop old containers
5. Start new containers
6. Run migrations
7. Perform health check
8. Run smoke tests

**Watch the output carefully!**

- [ ] Build completed successfully
- [ ] Containers started
- [ ] Health check passed
- [ ] Smoke tests passed

---

### Step 13: Verify Deployment

```bash
# Check container status
docker ps

# Expected output: 3-4 running containers
# - badminton-backend-prod
# - badminton-postgres-prod
# - badminton-redis-prod (if using)
# - badminton-nginx-prod

# Check backend logs
docker logs badminton-backend-prod

# Health check
curl http://localhost:3001/health
# Should return: {"status":"healthy","timestamp":"...","version":"1.0.0"}

# API check
curl http://localhost:3001/api/v1/
# Should return API info
```

**Verification:**
- [ ] All containers running
- [ ] No error messages in logs
- [ ] Health check returns 200
- [ ] API endpoint accessible
- [ ] Database connection working

---

## Phase 6: Security (Day 4)

### Step 14: Configure Firewall

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH (IMPORTANT!)
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Verify
sudo ufw status
```

- [ ] Firewall enabled
- [ ] SSH allowed (port 22)
- [ ] HTTP allowed (port 80)
- [ ] HTTPS allowed (port 443)

---

### Step 15: Run Security Audit

```bash
# Backend dependency audit
cd ~/BadmintonGroup/backend
npm audit

# Fix issues
npm audit fix

# Check for high/critical issues
npm audit --audit-level=high
```

**Go through SECURITY_AUDIT.md checklist:**
- [ ] No critical vulnerabilities
- [ ] No high vulnerabilities
- [ ] All secrets secured
- [ ] HTTPS working
- [ ] Security headers configured

---

## Phase 7: Monitoring (Day 4-5)

### Step 16: Set Up Error Tracking (Optional but Recommended)

**Sentry Setup:**
```bash
# 1. Sign up at sentry.io (free tier available)
# 2. Create new project (Node.js)
# 3. Get DSN
# 4. Add to .env.production:
#    SENTRY_DSN=https://your-dsn@sentry.io/project-id
# 5. Rebuild and redeploy
```

- [ ] Sentry account created
- [ ] Project created
- [ ] DSN added to .env.production
- [ ] Test error sent to verify

---

### Step 17: Set Up Uptime Monitoring

**Options:**
- [ ] UptimeRobot (free, easy)
- [ ] Pingdom
- [ ] StatusCake
- [ ] CloudFlare (if using)

**Configure:**
1. Sign up for service
2. Add monitor for https://yourdomain.com/health
3. Set check interval (1-5 minutes)
4. Configure email/SMS alerts

- [ ] Uptime monitor configured
- [ ] Alert notifications set up
- [ ] Test alert received

---

## Phase 8: Testing (Day 5)

### Step 18: Run Comprehensive Tests

Follow **EPIC_3_TESTING_GUIDE.md**:

**API Tests:**
```bash
# Test session creation
curl -X POST https://yourdomain.com/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Test",
    "dateTime": "2025-02-01T10:00:00Z",
    "location": "Test Court",
    "courtCount": 2,
    "organizerName": "Test User",
    "ownerDeviceId": "test-device-123"
  }'

# Save shareCode from response

# Test getting session
curl https://yourdomain.com/api/v1/mvp-sessions/SHARECODE

# Test leaderboard
curl https://yourdomain.com/api/v1/scoring/SHARECODE/leaderboard
```

**Checklist:**
- [ ] Session creation works
- [ ] Session retrieval works
- [ ] Player join works
- [ ] Pairing generation works
- [ ] Score recording works
- [ ] Leaderboard displays correctly
- [ ] CSV export works
- [ ] Real-time updates work

---

### Step 19: Performance Testing

```bash
# Install Apache Bench (simple load testing)
sudo apt install apache2-utils

# Test API endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 https://yourdomain.com/api/v1/

# Should see:
# - Requests per second: >50
# - Mean response time: <200ms
# - Failed requests: 0
```

**Verification:**
- [ ] API handles 100 requests successfully
- [ ] Response times acceptable (<200ms average)
- [ ] No failed requests
- [ ] No memory leaks observed

---

## Phase 9: Go Live! (Day 5-7)

### Step 20: Final Pre-Launch Checklist

**Infrastructure:**
- [ ] Production database running and backed up
- [ ] Redis running (if using)
- [ ] SSL certificate valid and auto-renew configured
- [ ] DNS pointing to production server
- [ ] Firewall configured correctly

**Application:**
- [ ] Latest code deployed
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] All containers healthy
- [ ] Health check passing
- [ ] API endpoints responding

**Security:**
- [ ] All secrets secured (not in git)
- [ ] No high/critical vulnerabilities
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting working
- [ ] Audit logging enabled

**Monitoring:**
- [ ] Error tracking configured (Sentry)
- [ ] Uptime monitoring active
- [ ] Log aggregation set up
- [ ] Alerts configured

**Testing:**
- [ ] API tests passed
- [ ] Frontend tests passed
- [ ] Performance acceptable
- [ ] No critical bugs

**Team:**
- [ ] Documentation complete
- [ ] Team trained on deployment
- [ ] Rollback plan understood
- [ ] On-call schedule defined

---

### Step 21: Launch! 🚀

```bash
# Create launch marker
echo "🚀 BadmintonGroup MVP launched on $(date)" > LAUNCHED.txt

# Tag release
git tag -a v1.0.0 -m "Production launch - BadmintonGroup MVP v1.0.0"
git push origin v1.0.0

# Announce launch
echo "We're live! 🎉"
```

**Post-Launch Actions:**
- [ ] Announce launch to team
- [ ] Share with first users
- [ ] Monitor logs closely (first 24 hours)
- [ ] Be ready for quick fixes
- [ ] Celebrate! 🎊

---

## Phase 10: Post-Launch (Week 1)

### Step 22: Monitor Metrics

**Daily for First Week:**
- [ ] Check uptime (should be >99%)
- [ ] Check error rates (should be <0.1%)
- [ ] Check response times (should be <200ms)
- [ ] Check database performance
- [ ] Check disk space usage
- [ ] Check memory usage

**Use these commands:**
```bash
# Check container stats
docker stats

# Check disk space
df -h

# Check logs
docker logs badminton-backend-prod --tail=100

# Check error logs
docker logs badminton-backend-prod | grep ERROR
```

---

### Step 23: Gather Feedback

- [ ] Monitor user feedback
- [ ] Track feature usage
- [ ] Identify pain points
- [ ] Plan improvements
- [ ] Iterate quickly

---

## 🎯 Success Metrics

### Week 1 Targets:
- **Uptime:** >99% ✅
- **Error Rate:** <0.1% ✅
- **Response Time:** <200ms (p95) ✅
- **User Satisfaction:** >4/5 ✅
- **Zero Security Incidents:** ✅

---

## 🆘 Troubleshooting

### Issue: Containers won't start
```bash
# Check logs
docker-compose -f docker/docker-compose.prod.yml logs

# Restart services
docker-compose -f docker/docker-compose.prod.yml restart
```

### Issue: Database connection fails
```bash
# Test database connection
docker exec badminton-postgres-prod psql -U badminton_user -d badminton_prod -c "SELECT 1;"

# Check DATABASE_URL in .env.production
```

### Issue: HTTPS not working
```bash
# Verify SSL certificates
sudo certbot certificates

# Renew if needed
sudo certbot renew
```

### Issue: Need to rollback
```bash
# Use rollback script
./scripts/deploy-production.sh rollback /path/to/backup.sql
```

---

## 📞 Emergency Contacts

**Technical Issues:**
- Email: ________________
- Phone: ________________

**Security Issues:**
- Email: ________________
- Phone: ________________

---

## 🎊 Congratulations!

You've successfully launched the BadmintonGroup MVP to production!

**What you've built:**
- ✅ Professional session management platform
- ✅ Real-time scoring and statistics
- ✅ Production-grade infrastructure
- ✅ Secure and scalable architecture

**Next steps:**
1. Monitor closely for first week
2. Gather user feedback
3. Plan next features
4. Iterate and improve

**You did it!** 🏆🎉🚀

---

**Launch Date:** __________  
**Launch Team:** __________  
**Status:** ✅ LIVE IN PRODUCTION

---

*Keep this checklist for future deployments and updates!*
