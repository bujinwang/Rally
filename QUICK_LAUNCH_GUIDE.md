# ⚡ Quick Launch Guide - Rally MVP (3-Day Fast Track)

**For:** Experienced developers who want to launch ASAP  
**Time:** 3-4 days (accelerated path)  
**Difficulty:** Intermediate  

---

## 🎯 Goal: Production in 3 Days

This is the **fastest path to production** for the Rally MVP.

---

## Day 1: Infrastructure (4-6 hours)

### Morning: Provision Services (2-3 hours)

**1. DigitalOcean (Recommended for speed):**

```bash
# Sign up: https://digitalocean.com (Get $200 credit)

# Create Droplet
- OS: Ubuntu 22.04 LTS
- Plan: Basic - $12/month (2GB RAM)
- Add SSH key
- Hostname: badminton-prod
- Click Create

# Create Managed PostgreSQL
- Version: PostgreSQL 15
- Plan: Basic - $15/month
- Region: Same as droplet
- Click Create
- Save connection details

# Create Managed Redis (Optional)
- Plan: Basic - $15/month
- Save connection details
```

**2. Domain & SSL:**

```bash
# Buy domain at Namecheap: badmintongroup.app
# Cost: ~$10/year

# In DigitalOcean:
# - Networking → Domains → Add badmintongroup.app
# - Add A record: @ → your-droplet-ip
# - Add A record: www → your-droplet-ip
# - Add A record: api → your-droplet-ip

# CloudFlare SSL (Free, faster than Let's Encrypt):
# 1. Sign up at cloudflare.com
# 2. Add domain
# 3. Update nameservers at Namecheap
# 4. SSL/TLS → Full (strict)
# 5. Wait 5-10 minutes for activation
```

**Total Cost: ~$42/month + $10/year domain**

---

### Afternoon: Server Setup (2-3 hours)

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Quick install script (copy all at once)
curl -fsSL https://get.docker.com | sh
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
apt install git nodejs npm -y

# Clone repo
git clone https://github.com/yourusername/Rally.git
cd Rally

# Generate secrets (save these!)
openssl rand -base64 32  # JWT_SECRET
openssl rand -base64 32  # JWT_REFRESH_SECRET

# Create .env.production
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://doadmin:PASSWORD@db-host:25060/defaultdb?sslmode=require
JWT_SECRET=YOUR_GENERATED_SECRET_HERE
JWT_REFRESH_SECRET=YOUR_GENERATED_REFRESH_SECRET_HERE
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
LOG_LEVEL=info
BCRYPT_ROUNDS=12
EOF

# Secure it
chmod 600 .env.production

# Edit with your actual values
nano .env.production
```

---

## Day 2: Deploy & Test (4-6 hours)

### Morning: Database & Deploy (2-3 hours)

```bash
# Run migrations
cd ~/Rally/backend
npm install
export DATABASE_URL="your_postgres_url"
npx prisma generate
npx prisma migrate deploy

# Deploy!
cd ~/Rally
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh deploy

# Watch deployment
# Should see: ✨ Deployment completed successfully! ✨
```

---

### Afternoon: Verify & Test (2-3 hours)

```bash
# Health check
curl http://localhost:3001/health
# Should return: {"status":"healthy",...}

# API test
curl http://localhost:3001/api/v1/
# Should return API info

# Create test session
curl -X POST http://localhost:3001/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Session",
    "dateTime": "2025-02-01T10:00:00Z",
    "location": "Test Court",
    "courtCount": 2,
    "organizerName": "Admin",
    "ownerDeviceId": "test-123"
  }'

# Save shareCode and test other endpoints
curl http://localhost:3001/api/v1/mvp-sessions/SHARECODE
curl http://localhost:3001/api/v1/scoring/SHARECODE/leaderboard
```

**If all tests pass → You're 90% done!**

---

## Day 3: Security & Launch (4-6 hours)

### Morning: Security (2-3 hours)

```bash
# Firewall
ufw enable
ufw allow 22
ufw allow 80
ufw allow 443
ufw status

# Audit dependencies
cd ~/Rally/backend
npm audit fix

# Setup Sentry (5 minutes)
# 1. Go to sentry.io
# 2. Create account
# 3. Create Node.js project
# 4. Add DSN to .env.production
# 5. Redeploy

# Setup uptime monitoring (5 minutes)
# 1. Go to uptimerobot.com
# 2. Create account
# 3. Add monitor: https://yourdomain.com/health
# 4. Enable email alerts
```

---

### Afternoon: Launch! (2-3 hours)

```bash
# Final checks
docker ps  # All containers running?
docker logs badminton-backend-prod  # No errors?
curl https://yourdomain.com/health  # 200 OK?

# Create launch tag
cd ~/Rally
git tag -a v1.0.0 -m "🚀 Production Launch"
git push origin v1.0.0

# You're LIVE! 🎉
```

**Verification:**
- Visit https://yourdomain.com
- Create a session
- Join as a player
- Test all features

---

## 🎉 You're Live in 3 Days!

**What you have:**
✅ Production-ready platform  
✅ Secure HTTPS connection  
✅ Database with backups  
✅ Error tracking (Sentry)  
✅ Uptime monitoring  
✅ Professional infrastructure  

**Total Time:** 12-18 hours actual work  
**Total Cost:** ~$42/month + $10/year  

---

## 📊 Post-Launch (Week 1)

**Daily Tasks (10 minutes/day):**
```bash
# SSH into server
ssh root@your-droplet-ip

# Check status
docker ps
docker logs badminton-backend-prod --tail=50

# Check metrics
docker stats

# That's it!
```

**Monitor:**
- Uptime (should be >99%)
- Error rates (check Sentry)
- User feedback
- Feature usage

---

## 🆘 Quick Troubleshooting

### Container crashed?
```bash
docker-compose -f docker/docker-compose.prod.yml restart
```

### Need to rollback?
```bash
./scripts/deploy-production.sh rollback
```

### Database issue?
```bash
docker exec badminton-backend-prod npx prisma studio
```

### See all logs?
```bash
./scripts/deploy-production.sh logs
```

---

## 💡 Pro Tips

1. **Use CloudFlare** - Free SSL, CDN, DDoS protection
2. **DigitalOcean** - Simplest cloud provider, great for MVPs
3. **Uptime monitoring** - Sleep better knowing you'll be alerted
4. **Sentry** - Know about errors before users report them
5. **Daily backups** - DigitalOcean does this automatically

---

## 🚀 Next Steps After Launch

**Week 1-2: Monitor & Fix**
- Watch logs daily
- Fix bugs quickly
- Respond to user feedback

**Week 3-4: Iterate**
- Analyze usage patterns
- Identify popular features
- Plan improvements

**Month 2: Scale**
- Optimize performance
- Add requested features
- Grow user base

---

## 📈 Growth Path

**$42/month (Current):**
- 2GB RAM
- PostgreSQL Basic
- Redis Basic
- Handles 100+ concurrent users

**$84/month (When you grow):**
- 4GB RAM
- PostgreSQL Pro
- Redis Pro
- Handles 500+ concurrent users

**$168/month (Scaling up):**
- 8GB RAM
- PostgreSQL Premium
- Redis Premium
- Handles 2000+ concurrent users

---

## ✅ Launch Checklist

**Day 1:**
- [ ] DigitalOcean account created
- [ ] Droplet provisioned (2GB)
- [ ] PostgreSQL database created
- [ ] Domain purchased
- [ ] CloudFlare SSL configured
- [ ] Server dependencies installed
- [ ] Repository cloned
- [ ] .env.production configured

**Day 2:**
- [ ] Database migrations run
- [ ] Application deployed
- [ ] Health check passing
- [ ] API tests passing
- [ ] All features working

**Day 3:**
- [ ] Firewall configured
- [ ] Dependencies audited
- [ ] Sentry configured
- [ ] Uptime monitoring active
- [ ] Launch tag created
- [ ] **LIVE! 🚀**

---

## 🎊 You Did It!

You launched a professional badminton session management platform in **3 days**.

**What you accomplished:**
- Provisioned production infrastructure
- Deployed secure, scalable application
- Set up monitoring and error tracking
- Launched to real users

**This is a real achievement!** 🏆

Most startups take weeks or months to launch. You did it in 3 days.

---

## 📞 Need Help?

**Common Resources:**
- DigitalOcean Docs: digitalocean.com/docs
- Prisma Docs: prisma.io/docs
- Docker Docs: docs.docker.com
- Sentry Docs: docs.sentry.io

**Community:**
- Stack Overflow
- Reddit: r/webdev
- Discord: [Your server]

---

**Status:** ⚡ READY FOR 3-DAY LAUNCH  
**Difficulty:** Intermediate  
**Cost:** $42/month + $10/year  
**Result:** Production-ready platform 🚀

---

*Follow this guide and you'll be live by the end of the week!*
