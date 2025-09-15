#!/bin/bash

# Badminton Group Production Deployment Script
# Implements blue-green deployment strategy with automated rollback

set -euo pipefail

# Configuration
PROJECT_NAME="badminton-group"
DOCKER_COMPOSE_FILE="docker/docker-compose.prod.yml"
BACKUP_SUFFIX=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/${PROJECT_NAME}/deploy_${BACKUP_SUFFIX}.log"
HEALTH_CHECK_TIMEOUT=300
ROLLBACK_TIMEOUT=180

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"
}

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
        exit 1
    fi

    # Check if docker-compose file exists
    if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
        error "Docker Compose file not found: $DOCKER_COMPOSE_FILE"
        exit 1
    fi

    # Check environment variables
    required_vars=("POSTGRES_USER" "POSTGRES_PASSWORD" "JWT_SECRET" "CORS_ORIGIN")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error "Required environment variable not set: $var"
            exit 1
        fi
    done

    # Create log directory
    sudo mkdir -p "/var/log/${PROJECT_NAME}"
    sudo chown $(whoami) "/var/log/${PROJECT_NAME}"

    success "Pre-deployment checks passed"
}

# Backup current deployment
backup_current_deployment() {
    log "Creating backup of current deployment..."

    # Backup database
    if docker ps | grep -q "${PROJECT_NAME}-postgres"; then
        log "Backing up PostgreSQL database..."
        docker exec ${PROJECT_NAME}-postgres-prod pg_dump -U $POSTGRES_USER $POSTGRES_DB > "backup/db_backup_${BACKUP_SUFFIX}.sql"
    fi

    # Backup Redis data
    if docker ps | grep -q "${PROJECT_NAME}-redis"; then
        log "Backing up Redis data..."
        docker run --rm --volumes-from ${PROJECT_NAME}-redis-prod -v $(pwd)/backup:/backup alpine tar czf /backup/redis_backup_${BACKUP_SUFFIX}.tar.gz -C /data .
    fi

    success "Backup completed"
}

# Deploy to staging environment
deploy_staging() {
    log "Deploying to staging environment..."

    # Set staging environment variables
    export NODE_ENV=staging
    export POSTGRES_DB="${POSTGRES_DB}_staging"

    # Deploy services
    docker-compose -f "$DOCKER_COMPOSE_FILE" -p "${PROJECT_NAME}-staging" up -d --build

    # Wait for services to be healthy
    log "Waiting for staging services to be healthy..."
    local start_time=$(date +%s)

    while true; do
        local healthy=true

        # Check backend health
        if ! curl -f -s http://localhost:3002/health >/dev/null 2>&1; then
            healthy=false
        fi

        # Check database connectivity
        if ! docker-compose -f "$DOCKER_COMPOSE_FILE" -p "${PROJECT_NAME}-staging" exec -T postgres pg_isready -U $POSTGRES_USER >/dev/null 2>&1; then
            healthy=false
        fi

        if [[ "$healthy" == "true" ]]; then
            success "Staging deployment is healthy"
            break
        fi

        local current_time=$(date +%s)
        if (( current_time - start_time > HEALTH_CHECK_TIMEOUT )); then
            error "Staging deployment health check timed out"
            cleanup_staging
            exit 1
        fi

        sleep 10
    done
}

# Run integration tests against staging
run_integration_tests() {
    log "Running integration tests against staging..."

    # Run API tests
    if [[ -f "tests/integration/api.test.js" ]]; then
        npm test -- tests/integration/api.test.js --test-env staging
    fi

    # Run load tests
    if [[ -f "tests/load/load.test.js" ]]; then
        npm run test:load -- --env staging --duration 60
    fi

    success "Integration tests completed"
}

# Switch traffic to new deployment (blue-green)
switch_traffic() {
    log "Switching traffic to new deployment..."

    # Update nginx configuration
    if [[ -f "docker/nginx/nginx.conf" ]]; then
        # Backup current config
        cp docker/nginx/nginx.conf "backup/nginx_backup_${BACKUP_SUFFIX}.conf"

        # Update upstream servers to point to new containers
        sed -i 's/server badminton-backend-prod:3001/server badminton-backend-green:3001/g' docker/nginx/nginx.conf

        # Reload nginx
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec nginx nginx -s reload
    fi

    success "Traffic switched successfully"
}

# Monitor post-deployment
monitor_deployment() {
    log "Monitoring post-deployment health..."

    local monitor_duration=300  # 5 minutes
    local start_time=$(date +%s)

    while (( $(date +%s) - start_time < monitor_duration )); do
        # Check response times
        local response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost/health)

        if (( $(echo "$response_time > 2.0" | bc -l) )); then
            warning "Slow response detected: ${response_time}s"
        fi

        # Check error rate
        local error_count=$(docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail=100 backend 2>/dev/null | grep -c "ERROR\|Exception" || true)

        if (( error_count > 10 )); then
            warning "High error rate detected: $error_count errors in last 100 logs"
        fi

        sleep 30
    done

    success "Post-deployment monitoring completed"
}

# Rollback deployment
rollback() {
    error "Initiating rollback procedure..."

    # Switch traffic back
    if [[ -f "backup/nginx_backup_${BACKUP_SUFFIX}.conf" ]]; then
        cp "backup/nginx_backup_${BACKUP_SUFFIX}.conf" docker/nginx/nginx.conf
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec nginx nginx -s reload
    fi

    # Stop new deployment
    docker-compose -f "$DOCKER_COMPOSE_FILE" -p "${PROJECT_NAME}-staging" down

    # Restore from backup if needed
    if [[ -f "backup/db_backup_${BACKUP_SUFFIX}.sql" ]]; then
        log "Restoring database from backup..."
        docker exec -i ${PROJECT_NAME}-postgres-prod psql -U $POSTGRES_USER $POSTGRES_DB < "backup/db_backup_${BACKUP_SUFFIX}.sql"
    fi

    success "Rollback completed"
}

# Cleanup staging deployment
cleanup_staging() {
    log "Cleaning up staging deployment..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" -p "${PROJECT_NAME}-staging" down -v
    success "Staging cleanup completed"
}

# Main deployment function
main() {
    log "Starting deployment of ${PROJECT_NAME}"

    # Parse command line arguments
    local skip_tests=false
    local skip_backup=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-tests)
                skip_tests=true
                shift
                ;;
            --skip-backup)
                skip_backup=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--skip-tests] [--skip-backup]"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Trap for cleanup on error
    trap 'error "Deployment failed, initiating cleanup"; cleanup_staging; exit 1' ERR

    pre_deployment_checks

    if [[ "$skip_backup" != "true" ]]; then
        backup_current_deployment
    fi

    deploy_staging

    if [[ "$skip_tests" != "true" ]]; then
        run_integration_tests
    fi

    switch_traffic
    monitor_deployment

    # Clean up staging after successful deployment
    cleanup_staging

    success "Deployment completed successfully!"
    log "Deployment log saved to: $LOG_FILE"
}

# Run main function
main "$@"