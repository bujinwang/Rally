# 🚀 Production Deployment Guide - Rally MVP

**Date:** January 29, 2025  
**Version:** 1.0.0  
**Status:** Ready for Production  
**MVP Completion:** 90%

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Migration](#database-migration)
4. [Docker Production Build](#docker-production-build)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Monitoring & Logging](#monitoring--logging)
7. [Security Checklist](#security-checklist)
8. [Deployment Steps](#deployment-steps)
9. [Post-Deployment](#post-deployment)
10. [Rollback Plan](#rollback-plan)

---

## 1. Prerequisites

### Required Services
- [ ] PostgreSQL 15+ database (production instance)
- [ ] Redis server (for caching and sessions)
- [ ] Node.js 18+ on deployment server
- [ ] Docker & Docker Compose (if using containers)
- [ ] Domain name with SSL certificate
- [ ] Cloud provider account (AWS/GCP/Azure/DigitalOcean)

### Required Tools
- [ ] Git
- [ ] GitHub account with repository access
- [ ] SSH access to production server
- [ ] Database backup solution

### Recommended Services
- [ ] Sentry (error tracking)
- [ ] CloudFlare (CDN and DDoS protection)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Log aggregation (LogRocket, Datadog)

---

## 2. Environment Setup

### 2.1 Production Environment Variables

Create `.env.production` file:

```bash
# Application
NODE_ENV=production
PORT=3001

# Database (USE PRODUCTION CREDENTIALS!)
DATABASE_URL=postgresql://badminton_user:SECURE_PASSWORD@your-db-host:5432/badminton_prod

# JWT Configuration (GENERATE NEW SECRETS!)
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-32>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration (YOUR PRODUCTION DOMAIN)
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting (Production values)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Redis Configuration
REDIS_URL=redis://your-redis-host:6379

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Logging
LOG_LEVEL=info

# Security
BCRYPT_ROUNDS=12

# Sentry (Error Tracking)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Email (if implementing notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# AWS (if using S3 for file storage)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=badminton-uploads
```

### 2.2 Generate Secure Secrets

```bash
# Generate JWT secrets
openssl rand -base64 32  # Use for JWT_SECRET
openssl rand -base64 32  # Use for JWT_REFRESH_SECRET

# Generate database password
openssl rand -base64 24

# Generate session secret
openssl rand -base64 32
```

### 2.3 Frontend Environment Variables

Create `.env.production` in frontend:

```bash
# API Configuration
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
EXPO_PUBLIC_WS_URL=wss://api.yourdomain.com

# Environment
EXPO_PUBLIC_ENVIRONMENT=production

# Analytics (optional)
EXPO_PUBLIC_GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
EXPO_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Feature Flags
EXPO_PUBLIC_ENABLE_ANALYTICS=true
EXPO_PUBLIC_ENABLE_ERROR_TRACKING=true
```

---

## 3. Database Migration

### 3.1 Backup Current Database (if upgrading)

```bash
# Backup existing database
pg_dump -h localhost -U postgres badminton_dev > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

### 3.2 Create Production Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create production database
CREATE DATABASE badminton_prod;

# Create dedicated user
CREATE USER badminton_user WITH ENCRYPTED PASSWORD 'SECURE_PASSWORD';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE badminton_prod TO badminton_user;

# Exit
\q
```

### 3.3 Run Prisma Migrations

```bash
cd backend

# Set production database URL
export DATABASE_URL="postgresql://badminton_user:SECURE_PASSWORD@your-db-host:5432/badminton_prod"

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate deploy

# Verify migrations
npm run prisma:studio
```

### 3.4 Seed Initial Data (Optional)

```bash
# If you have seed data
npm run prisma:seed
```

---

## 4. Docker Production Build

### 4.1 Backend Dockerfile (Production-Optimized)

Create `backend/Dockerfile.prod`:

```dockerfile
# Multi-stage build for smaller image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --chown=nodejs:nodejs package*.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "dist/server.js"]
```

### 4.2 Docker Compose Production

Create `docker/docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: badminton-postgres-prod
    restart: always
    environment:
      POSTGRES_DB: badminton_prod
      POSTGRES_USER: badminton_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U badminton_user -d badminton_prod"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - badminton-network

  redis:
    image: redis:7-alpine
    container_name: badminton-redis-prod
    restart: always
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - badminton-network

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile.prod
    container_name: badminton-backend-prod
    restart: always
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - ../.env.production
    environment:
      DATABASE_URL: postgresql://badminton_user:${DB_PASSWORD}@postgres:5432/badminton_prod
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    volumes:
      - ../backend/logs:/app/logs
    networks:
      - badminton-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    container_name: badminton-nginx-prod
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - backend
    networks:
      - badminton-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  nginx_logs:
    driver: local

networks:
  badminton-network:
    driver: bridge
```

### 4.3 Nginx Configuration

Create `docker/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=general_limit:10m rate=100r/m;

    # Upstream backend
    upstream backend {
        server backend:3001;
    }

    # HTTP server - redirect to HTTPS
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security Headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

        # API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Socket.IO WebSocket
        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check (no rate limit)
        location /health {
            proxy_pass http://backend;
            access_log off;
        }

        # Static files (if serving frontend from same domain)
        location / {
            limit_req zone=general_limit burst=50 nodelay;
            
            root /var/www/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

---

## 5. CI/CD Pipeline

### 5.1 GitHub Actions Workflow

Update `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: badminton_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Generate Prisma Client
        working-directory: ./backend
        run: npx prisma generate

      - name: Run database migrations
        working-directory: ./backend
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/badminton_test
        run: npx prisma migrate deploy

      - name: Run tests
        working-directory: ./backend
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/badminton_test
          NODE_ENV: test
        run: npm test

      - name: Build TypeScript
        working-directory: ./backend
        run: npm run build

  deploy:
    name: Deploy to Production
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: badminton-backend
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -f backend/Dockerfile.prod -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./backend
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Deploy to ECS (or your platform)
        run: |
          # Add your deployment commands here
          echo "Deploying to production..."
```

---

## 6. Monitoring & Logging

### 6.1 Sentry Integration

Install Sentry in backend:

```bash
cd backend
npm install @sentry/node @sentry/profiling-node
```

Add to `backend/src/server.ts`:

```typescript
import * as Sentry from "@sentry/node";

// Initialize Sentry (before everything else)
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });
}

// ... rest of your server code

// Error handler with Sentry
app.use(Sentry.Handlers.errorHandler());
```

### 6.2 Logging Configuration

Create `backend/src/utils/logger.ts`:

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export default logger;
```

---

## 7. Security Checklist

### 7.1 Pre-Deployment Security

- [ ] **Environment Variables**: All secrets in .env (not committed to git)
- [ ] **JWT Secrets**: Generated with strong randomness (32+ bytes)
- [ ] **Database**: Strong password, not default credentials
- [ ] **CORS**: Configured for production domain only
- [ ] **Rate Limiting**: Enabled on all API endpoints
- [ ] **HTTPS**: SSL certificate installed and configured
- [ ] **Security Headers**: X-Frame-Options, CSP, etc. configured
- [ ] **SQL Injection**: Using Prisma ORM (parameterized queries)
- [ ] **XSS Protection**: Input sanitization enabled
- [ ] **CSRF Protection**: Tokens implemented for state-changing operations
- [ ] **Dependency Audit**: Run `npm audit fix` on both backend and frontend
- [ ] **Docker Security**: Running as non-root user
- [ ] **Firewall**: Only necessary ports open (80, 443, SSH)
- [ ] **SSH**: Key-based authentication only, no password login
- [ ] **Database Backups**: Automated daily backups configured
- [ ] **Error Messages**: Generic error messages in production (no stack traces)

### 7.2 Security Audit Commands

```bash
# Backend audit
cd backend
npm audit
npm audit fix

# Frontend audit
cd frontend/Rally
npm audit
npm audit fix

# Check for known vulnerabilities
npx snyk test

# Docker image scanning
docker scan badminton-backend:latest
```

---

## 8. Deployment Steps

### 8.1 Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] Database migration scripts tested
- [ ] Production environment variables configured
- [ ] SSL certificates obtained
- [ ] Domain DNS configured
- [ ] Backups configured
- [ ] Monitoring tools set up
- [ ] Rollback plan documented

### 8.2 Deployment Process

#### Step 1: Server Setup

```bash
# SSH into production server
ssh user@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### Step 2: Clone Repository

```bash
# Clone repo
git clone https://github.com/yourusername/Rally.git
cd Rally

# Checkout production branch
git checkout main
```

#### Step 3: Configure Environment

```bash
# Create .env.production
cp backend/.env.example .env.production
nano .env.production  # Edit with production values

# Create secrets file
echo "DB_PASSWORD=your_secure_password" > .env.secrets
echo "REDIS_PASSWORD=your_redis_password" >> .env.secrets
chmod 600 .env.secrets
```

#### Step 4: Build and Start

```bash
# Build images
docker-compose -f docker/docker-compose.prod.yml build

# Start services
docker-compose -f docker/docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker/docker-compose.prod.yml logs -f
```

#### Step 5: Run Database Migrations

```bash
# Run migrations
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma migrate deploy

# Verify
docker-compose -f docker/docker-compose.prod.yml exec backend npx prisma db seed
```

#### Step 6: Verify Deployment

```bash
# Health check
curl https://yourdomain.com/health

# Test API endpoint
curl https://yourdomain.com/api/v1/

# Check logs
docker-compose -f docker/docker-compose.prod.yml logs backend
```

---

## 9. Post-Deployment

### 9.1 Smoke Tests

```bash
# Create test session
curl -X POST https://yourdomain.com/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Test", "organizerName": "Test User", ...}'

# Get session
curl https://yourdomain.com/api/v1/mvp-sessions/SHARECODE

# Test scoring endpoint
curl https://yourdomain.com/api/v1/scoring/SHARECODE/leaderboard
```

### 9.2 Monitoring Setup

- [ ] Set up uptime monitoring
- [ ] Configure alerts for downtime
- [ ] Set up error rate alerts in Sentry
- [ ] Monitor database performance
- [ ] Monitor API response times
- [ ] Check disk space usage

### 9.3 Performance Optimization

```bash
# Enable gzip compression in Nginx
# Add to nginx.conf http block:
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript;

# Enable caching
# Add cache headers for static assets
```

---

## 10. Rollback Plan

### 10.1 Quick Rollback

```bash
# Stop current deployment
docker-compose -f docker/docker-compose.prod.yml down

# Restore from backup
psql -U badminton_user -d badminton_prod < /backups/backup_TIMESTAMP.sql

# Checkout previous version
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose -f docker/docker-compose.prod.yml up -d --build
```

### 10.2 Database Rollback

```bash
# Backup current state first!
pg_dump -U badminton_user badminton_prod > /backups/pre_rollback_$(date +%Y%m%d_%H%M%S).sql

# Restore previous backup
psql -U badminton_user -d badminton_prod < /backups/backup_TIMESTAMP.sql

# Verify restoration
psql -U badminton_user -d badminton_prod -c "SELECT COUNT(*) FROM \"MvpSession\";"
```

---

## 📊 Production Checklist

### Critical (Must Have)
- [ ] SSL certificate installed
- [ ] Environment variables configured
- [ ] Database migrations run successfully
- [ ] Health check endpoint working
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Error tracking (Sentry) configured
- [ ] Database backups automated

### Important (Should Have)
- [ ] CI/CD pipeline working
- [ ] Monitoring/alerting configured
- [ ] Log aggregation set up
- [ ] Performance testing completed
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Rollback plan tested

### Nice to Have
- [ ] CDN configured
- [ ] Caching strategy implemented
- [ ] Load balancing configured
- [ ] Auto-scaling set up
- [ ] Disaster recovery plan
- [ ] Analytics integrated

---

## 🎯 Success Metrics

After deployment, monitor:
- Uptime > 99.9%
- API response time < 200ms (p95)
- Error rate < 0.1%
- Database query time < 100ms (p95)
- Zero security vulnerabilities
- User satisfaction > 4.5/5

---

## 📞 Support Contacts

- **DevOps:** your-email@example.com
- **On-Call:** +1-XXX-XXX-XXXX
- **Sentry:** https://sentry.io/your-org
- **Status Page:** https://status.yourdomain.com

---

**Deployment Status:** 📝 Ready to Deploy  
**Last Updated:** January 29, 2025  
**Next Review:** Before production launch
