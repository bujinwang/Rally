# 🚀 Deployment Strategy - Badminton Group Management App

This document outlines the comprehensive deployment strategy for the badminton pairing management application across all platforms and infrastructure components.

## 📋 Deployment Overview

### Architecture Summary
- **Backend**: Node.js + Express (Docker containerized)
- **Database**: PostgreSQL (AWS RDS)
- **Frontend**: React Native (iOS, Android, Web)
- **Real-time**: Socket.io
- **Cache**: Redis
- **Storage**: AWS S3
- **CI/CD**: GitHub Actions

### Deployment Environments
1. **Development**: Local development environment
2. **Staging**: Pre-production testing environment
3. **Production**: Live application environment

## 🐳 Containerization Strategy

### Docker Configuration
```dockerfile
# Dockerfile (Backend)
FROM node:18-alpine

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["npm", "start"]
```

```dockerfile
# Dockerfile (Frontend Web)
FROM node:18-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/web-build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose (Development)
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: badminton_dev
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:password@postgres:5432/badminton_dev
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

## ☁️ Cloud Infrastructure (AWS)

### Core Infrastructure Components
```mermaid
graph TB
    %% Route 53 DNS
    Route53[Route 53<br/>DNS Management]

    %% CloudFront CDN
    CloudFront[CloudFront CDN<br/>Global Distribution]

    %% API Gateway & Load Balancer
    ALB[Application Load Balancer]
    API_GW[API Gateway]

    %% ECS/EC2 for Backend
    ECS[ECS Fargate<br/>Backend Services]

    %% Lambda Functions
    Lambda[Lambda Functions<br/>Serverless Tasks]

    %% Database & Cache
    RDS[(RDS PostgreSQL<br/>Primary Database)]
    Redis[(ElastiCache Redis<br/>Session Cache)]

    %% Storage
    S3[(S3 Bucket<br/>File Storage)]

    %% Monitoring
    CloudWatch[CloudWatch<br/>Monitoring & Logs]

    %% Route 53 to CloudFront
    Route53 --> CloudFront

    %% CloudFront to ALB/API Gateway
    CloudFront --> ALB
    CloudFront --> API_GW

    %% ALB to ECS
    ALB --> ECS

    %% ECS connections
    ECS --> RDS
    ECS --> Redis
    ECS --> S3
    ECS --> CloudWatch

    %% Lambda connections
    Lambda --> RDS
    Lambda --> S3
    Lambda --> CloudWatch

    %% API Gateway to Lambda
    API_GW --> Lambda
```

### AWS Services Configuration

#### 1. VPC and Networking
```hcl
# Terraform configuration example
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support = true
}

resource "aws_subnet" "private" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_subnet" "public" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
}
```

#### 2. RDS PostgreSQL Configuration
- **Instance Class**: db.t3.medium (staging), db.r5.large (production)
- **Storage**: 100GB (staging), 500GB+ (production) with auto-scaling
- **Multi-AZ**: Enabled for production
- **Backup**: Daily backups with 30-day retention
- **Monitoring**: Enhanced monitoring enabled

#### 3. ElastiCache Redis Configuration
- **Node Type**: cache.t3.medium (staging), cache.r5.large (production)
- **Cluster Mode**: Enabled for production
- **Multi-AZ**: Enabled for production
- **Backup**: Daily snapshots

#### 4. ECS Fargate Configuration
```yaml
# Task Definition
{
  "family": "badminton-backend",
  "cpu": "1024",
  "memory": "2048",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/badmintonTaskRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/badminton-backend:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "hostPort": 3001
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://..."
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/badminton-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ${{ github.repository }}/backend
  FRONTEND_IMAGE: ${{ github.repository }}/frontend

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Run linting
        run: npm run lint

  build-backend:
    needs: test
    runs-on: ubuntu-latest
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

      - name: Build and push backend image
        run: |
          cd backend
          docker build -t ${{ steps.login-ecr.outputs.registry }}/${{ env.BACKEND_IMAGE }}:$GITHUB_SHA .
          docker push ${{ steps.login-ecr.outputs.registry }}/${{ env.BACKEND_IMAGE }}:$GITHUB_SHA

  build-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Build React Native Web
        run: |
          cd frontend
          npm run build:web

      - name: Deploy to S3
        run: |
          aws s3 sync frontend/web-build s3://badminton-web-prod --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_ID }} --paths "/*"

  deploy-backend:
    needs: build-backend
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster badminton-cluster \
            --service badminton-backend-service \
            --force-new-deployment

  mobile-deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Build Android
        run: |
          cd frontend
          cd android && ./gradlew assembleRelease

      - name: Upload to Google Play
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT }}
          packageName: com.badmintongroup.app
          releaseFiles: frontend/android/app/build/outputs/apk/release/app-release.apk
          track: internal

      - name: Build iOS
        run: |
          cd frontend
          cd ios && xcodebuild -workspace BadmintonGroup.xcworkspace -scheme BadmintonGroup -configuration Release -archivePath $PWD/build/BadmintonGroup.xcarchive archive

      - name: Upload to TestFlight
        uses: apple-actions/upload-testflight-build@v1
        with:
          app-path: frontend/ios/build/BadmintonGroup.xcarchive
          issuer-id: ${{ secrets.APPSTORE_ISSUER_ID }}
          api-key-id: ${{ secrets.APPSTORE_API_KEY_ID }}
          api-private-key: ${{ secrets.APPSTORE_API_PRIVATE_KEY }}
```

## 📱 Mobile App Deployment

### iOS Deployment (TestFlight → App Store)
```bash
# Fastlane configuration
# fastlane/Fastfile

platform :ios do
  lane :beta do
    # Sync certificates and provisioning profiles
    match(type: "appstore")

    # Build the app
    gym(
      scheme: "BadmintonGroup",
      export_method: "app-store",
      export_options: {
        provisioningProfiles: {
          "com.badmintongroup.app" => "Badminton Group App Store"
        }
      }
    )

    # Upload to TestFlight
    pilot(
      username: "dev@badmintongroup.com",
      team_id: "123456789"
    )
  end

  lane :release do
    # Submit to App Store
    deliver(
      username: "dev@badmintongroup.com",
      team_id: "123456789",
      force: true
    )
  end
end
```

### Android Deployment (Internal → Production)
```gradle
// android/app/build.gradle
android {
    signingConfigs {
        release {
            storeFile file('release-keystore.jks')
            storePassword System.getenv('KEYSTORE_PASSWORD')
            keyAlias System.getenv('KEY_ALIAS')
            keyPassword System.getenv('KEY_PASSWORD')
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

```bash
# Fastlane configuration
# fastlane/Fastfile

platform :android do
  lane :internal do
    # Build release APK
    gradle(
      task: 'assemble',
      build_type: 'Release'
    )

    # Upload to Google Play Internal Testing
    upload_to_play_store(
      track: 'internal',
      apk: 'app/build/outputs/apk/release/app-release.apk'
    )
  end

  lane :beta do
    upload_to_play_store(
      track: 'beta',
      apk: 'app/build/outputs/apk/release/app-release.apk'
    )
  end

  lane :production do
    upload_to_play_store(
      track: 'production',
      apk: 'app/build/outputs/apk/release/app-release.apk'
    )
  end
end
```

## 🌐 Web Deployment

### React Native Web Deployment
```javascript
// frontend/package.json
{
  "scripts": {
    "build:web": "expo build:web",
    "export:web": "expo export:web",
    "deploy:web": "npm run build:web && aws s3 sync web-build s3://badminton-web-prod --delete"
  }
}
```

### CloudFront Configuration
```json
{
  "Comment": "Badminton Group Web Distribution",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "badminton-web-s3",
        "DomainName": "badminton-web-prod.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "badminton-web-s3",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  }
}
```

## 🗄️ Database Deployment Strategy

### Schema Migrations
```typescript
// backend/src/migrations/001_initial_schema.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema implements MigrationInterface {
    name = 'InitialSchema';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create users table
        await queryRunner.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE,
                phone VARCHAR(20),
                avatar_url TEXT,
                device_id VARCHAR(255),
                role VARCHAR(20) DEFAULT 'player',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create indexes
        await queryRunner.query(`
            CREATE INDEX idx_users_email ON users(email);
            CREATE INDEX idx_users_device_id ON users(device_id);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE users`);
    }
}
```

### Backup and Recovery
```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="badminton_prod"

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f $BACKUP_DIR/$DB_NAME_$DATE.dump

# Upload to S3
aws s3 cp $BACKUP_DIR/$DB_NAME_$DATE.dump s3://badminton-backups/database/

# Clean old backups (keep last 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete
```

## 📊 Monitoring and Observability

### Application Monitoring
```yaml
# Prometheus configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'badminton-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics'

  - job_name: 'badminton-frontend'
    static_configs:
      - targets: ['frontend:3000']

# Grafana dashboards
- Application Performance Dashboard
- Database Performance Dashboard
- User Engagement Dashboard
- Error Tracking Dashboard
```

### Logging Strategy
```javascript
// Winston logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'badminton-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

### Alerting Rules
```yaml
# AlertManager configuration
groups:
  - name: badminton-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseConnectionError
        expr: pg_up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection lost"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
```

## 🔒 Security Deployment

### SSL/TLS Configuration
```nginx
# Nginx SSL configuration
server {
    listen 443 ssl http2;
    server_name api.badmintongroup.com;

    ssl_certificate /etc/letsencrypt/live/api.badmintongroup.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.badmintongroup.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Security Groups
```hcl
# AWS Security Groups
resource "aws_security_group" "backend" {
  name_prefix = "badminton-backend-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]  # VPC only
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]    # Public access via ALB
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  name_prefix = "badminton-db-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }
}
```

## 📈 Scaling Strategy

### Horizontal Scaling
```yaml
# Kubernetes HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: badminton-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: badminton-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Database Scaling
- **Read Replicas**: For read-heavy operations
- **Connection Pooling**: PgBouncer for connection management
- **Partitioning**: Table partitioning for large datasets
- **Caching**: Redis for frequently accessed data

### CDN and Static Asset Optimization
- **Global Distribution**: CloudFront with edge locations
- **Caching Strategy**: Cache static assets for 1 year, API responses for 5 minutes
- **Image Optimization**: Automatic resizing and WebP conversion
- **Compression**: Gzip/Brotli compression for all responses

## 🚨 Disaster Recovery

### Backup Strategy
- **Database**: Daily full backups + hourly incremental
- **Application**: AMI backups for EC2 instances
- **Configuration**: Infrastructure as Code (Terraform)
- **Data**: S3 cross-region replication

### Recovery Procedures
1. **Database Recovery**: Restore from latest backup to standby instance
2. **Application Recovery**: Deploy from last known good commit
3. **DNS Failover**: Route 53 failover routing to backup region
4. **Data Recovery**: Point-in-time recovery for critical data

### Business Continuity
- **RTO (Recovery Time Objective)**: 4 hours for critical services
- **RPO (Recovery Point Objective)**: 1 hour data loss tolerance
- **Service Level Agreement**: 99.9% uptime commitment

This deployment strategy provides a robust, scalable, and secure infrastructure for the badminton pairing management application, ensuring high availability, performance, and maintainability across all platforms and user scenarios.