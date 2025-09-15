# Production Rollback Procedures

## Overview

This document outlines the procedures for rolling back the Badminton Group MVP application in production. Rollback procedures are critical for minimizing downtime and data loss during deployment failures or critical issues.

## Rollback Strategy

### Rollback Types
1. **Application Rollback**: Revert to previous application version
2. **Database Rollback**: Revert database schema and data changes
3. **Full System Rollback**: Complete environment restoration
4. **Feature Flag Rollback**: Disable problematic features without full rollback

### Rollback Triggers
- Critical application errors (> 5% error rate)
- Data corruption or loss
- Security vulnerabilities discovered
- Performance degradation (> 50% slower)
- Business-critical functionality broken

## Application Rollback Procedures

### Automated Rollback (Preferred)

#### Using Deployment Pipeline
```bash
# Trigger automated rollback via CI/CD
npm run deploy:rollback -- --version=<previous-version>

# Or via deployment platform
kubectl rollout undo deployment/badminton-backend
kubectl rollout undo deployment/badminton-frontend
```

#### Rollback Steps
1. **Stop Traffic**: Route traffic away from affected instances
2. **Deploy Previous Version**: Deploy last known good version
3. **Health Checks**: Verify application health
4. **Gradual Traffic Restore**: Slowly restore traffic to rolled-back version
5. **Monitor**: Monitor for 30 minutes post-rollback

### Manual Rollback (Emergency)

#### Backend Rollback
```bash
# 1. Stop current application
pm2 stop badminton-backend
# or
docker stop badminton-backend-container

# 2. Restore previous deployment
cd /opt/badminton/backend
git checkout <previous-commit-hash>
npm ci --production
npm run build

# 3. Start with previous version
pm2 start ecosystem.config.js --env production
```

#### Frontend Rollback
```bash
# 1. Restore previous build
cd /opt/badminton/frontend
git checkout <previous-commit-hash>
npm ci --production
npm run build

# 2. Deploy to CDN/web server
aws s3 sync dist/ s3://badminton-frontend --delete
# Invalidate CDN cache
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

## Database Rollback Procedures

### Schema Rollback

#### Using Prisma Migrations
```bash
# 1. Check current migration status
npx prisma migrate status

# 2. Rollback to specific migration
npx prisma migrate resolve --rolled-back <migration-name>

# 3. Reset if necessary (CAUTION: DATA LOSS)
npx prisma migrate reset --force
```

#### Manual Schema Rollback
```sql
-- Connect to database
psql -h <host> -d <database> -U <user>

-- Check current schema version
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;

-- Rollback specific changes (example)
ALTER TABLE users DROP COLUMN new_feature_field;
DROP INDEX IF EXISTS idx_users_new_feature;
```

### Data Rollback

#### Point-in-Time Recovery
```bash
# Using PostgreSQL PITR
pg_restore -h <host> -d <database> -U <user> --clean --if-exists <backup-file>

# Or using pgBackRest
pgbackrest restore --stanza=main --set=<backup-set>
```

#### Selective Data Restore
```sql
-- Restore specific table from backup
CREATE TABLE users_backup AS SELECT * FROM users;

-- Restore from backup file
pg_restore -h <host> -d <database> -U <user> -t users <backup-file>

-- Verify data integrity
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM users_backup;
```

## Feature Flag Rollback

### Emergency Feature Disabling
```typescript
// In application configuration
const featureFlags = {
  newFeature: process.env.NODE_ENV === 'production' ? false : true,
  experimentalUI: false,
  betaPayments: false
};

// Or via feature flag service
await featureFlagService.disable('new-feature');
await featureFlagService.disable('experimental-ui');
```

### Gradual Rollback
1. **Reduce Traffic**: Route 50% of users away from feature
2. **Monitor Impact**: Observe error rates and performance
3. **Complete Disable**: Disable feature entirely if issues persist
4. **Cleanup**: Remove feature code in next deployment

## Full Environment Rollback

### Infrastructure Rollback
```bash
# Using Terraform/Infrastructure as Code
cd infrastructure/
terraform plan -var-file=production.tfvars
terraform apply -var-file=previous.tfvars

# Or using cloud provider CLI
aws ecs update-service --cluster badminton-cluster \
  --service badminton-service \
  --task-definition badminton-task:previous
```

### DNS Rollback
```bash
# Route53 DNS rollback
aws route53 change-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --change-batch file://rollback-dns.json

# Content of rollback-dns.json
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "api.badmintongroup.com",
      "Type": "CNAME",
      "TTL": 300,
      "ResourceRecords": [{"Value": "previous-lb-url"}]
    }
  }]
}
```

## Rollback Validation

### Health Checks
- [ ] Application starts successfully
- [ ] Database connections working
- [ ] API endpoints responding (HTTP 200)
- [ ] Frontend loads without errors
- [ ] User authentication working
- [ ] Core functionality operational

### Data Integrity Checks
- [ ] User data intact and accessible
- [ ] Recent transactions preserved
- [ ] No data corruption detected
- [ ] Database constraints satisfied

### Performance Validation
- [ ] Response times within acceptable limits
- [ ] Error rates below 1%
- [ ] Memory/CPU usage normal
- [ ] Database query performance acceptable

## Communication Plan

### Internal Communication
1. **Immediate**: Alert development team via Slack/phone
2. **Update**: Post in #incidents channel with rollback status
3. **Follow-up**: Send incident report within 24 hours

### External Communication
1. **Status Page**: Update public status page
2. **User Notification**: Send email/SMS for prolonged outages
3. **Social Media**: Post updates if outage > 30 minutes

### Stakeholder Notification
- **Business Team**: Impact on revenue/user experience
- **Customers**: If outage affects user experience
- **Partners**: If integrations are affected

## Recovery and Learning

### Post-Rollback Analysis
1. **Root Cause Analysis**: Identify what caused the issue
2. **Impact Assessment**: Document effects on users/business
3. **Timeline**: Record time from detection to resolution
4. **Lessons Learned**: Document improvements for future

### Process Improvements
- **Automated Testing**: Enhance test coverage for rolled-back features
- **Monitoring**: Add monitoring for failure patterns
- **Documentation**: Update rollback procedures based on experience
- **Training**: Ensure team familiarity with rollback procedures

## Rollback Time Objectives

### Recovery Time Objectives (RTO)
- **Critical Services**: < 15 minutes
- **Core Application**: < 30 minutes
- **Full System**: < 2 hours
- **Database**: < 1 hour

### Recovery Point Objectives (RPO)
- **User Data**: < 5 minutes data loss
- **Transactional Data**: < 1 minute data loss
- **Configuration**: < 15 minutes data loss

## Emergency Contacts

### Technical Team (24/7)
- **Lead Developer**: [Name] - [Phone] - [Email]
- **DevOps Engineer**: [Name] - [Phone] - [Email]
- **Database Administrator**: [Name] - [Phone] - [Email]

### Business Team
- **Product Manager**: [Name] - [Phone] - [Email]
- **Customer Success**: [Name] - [Phone] - [Email]

### Infrastructure Providers
- **Cloud Provider**: [Provider Support] - [Phone] - [Email]
- **Database Provider**: [Provider Support] - [Phone] - [Email]
- **CDN Provider**: [Provider Support] - [Phone] - [Email]

## Rollback Checklist

### Pre-Rollback
- [ ] **Decision Made**: Rollback approved by incident commander
- [ ] **Backup Taken**: Current state backed up
- [ ] **Team Notified**: All relevant teams informed
- [ ] **Communication Plan**: User communication prepared

### During Rollback
- [ ] **Traffic Stopped**: Users routed away from affected system
- [ ] **Previous Version**: Correct version identified and ready
- [ ] **Database Backup**: Recent backup available and tested
- [ ] **Runbook Followed**: Step-by-step procedures executed

### Post-Rollback
- [ ] **Health Verified**: All health checks passing
- [ ] **Data Integrity**: Data verified and intact
- [ ] **Traffic Restored**: Users gradually routed back
- [ ] **Monitoring Active**: Enhanced monitoring for 24 hours
- [ ] **Incident Report**: Detailed report prepared

### Follow-up
- [ ] **Root Cause**: Analysis completed
- [ ] **Improvements**: Process improvements identified
- [ ] **Documentation**: Procedures updated
- [ ] **Training**: Team training conducted if needed

## Rollback Testing

### Regular Testing Schedule
- **Monthly**: Full rollback procedure testing
- **Quarterly**: Database rollback testing
- **Annually**: Disaster recovery testing

### Test Scenarios
1. **Application Rollback**: Deploy bad version, rollback to good
2. **Database Rollback**: Corrupt data, restore from backup
3. **Network Failure**: Simulate network issues, test failover
4. **Data Center Failure**: Test cross-region failover

### Success Criteria
- Rollback completed within RTO
- Data loss within RPO
- No additional data corruption
- System fully functional post-rollback

---

**Document Version**: 1.0
**Last Updated**: [Date]
**Review Frequency**: Quarterly
**Owner**: DevOps Team
**Approval**: ____________________ (Incident Commander)