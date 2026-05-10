#!/bin/bash

# Rally MVP - Production Deployment Script
# This script automates the production deployment process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="Rally"
COMPOSE_FILE="docker/docker-compose.prod.yml"
BACKUP_DIR="./backups"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check environment file
    if [ ! -f ".env.production" ]; then
        log_error ".env.production file not found"
        exit 1
    fi
    
    log_info "Prerequisites check passed ✓"
}

backup_database() {
    log_info "Creating database backup..."
    
    mkdir -p $BACKUP_DIR
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
    
    # Only backup if database is running
    if docker-compose -f $COMPOSE_FILE ps | grep -q postgres; then
        docker-compose -f $COMPOSE_FILE exec -T postgres pg_dump -U badminton_user badminton_prod > $BACKUP_FILE
        log_info "Database backed up to $BACKUP_FILE ✓"
    else
        log_warn "Database not running, skipping backup"
    fi
}

build_images() {
    log_info "Building Docker images..."
    docker-compose -f $COMPOSE_FILE build --no-cache
    log_info "Images built successfully ✓"
}

run_migrations() {
    log_info "Running database migrations..."
    docker-compose -f $COMPOSE_FILE exec -T backend npx prisma migrate deploy
    log_info "Migrations completed ✓"
}

health_check() {
    log_info "Performing health check..."
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -f http://localhost:3001/health > /dev/null 2>&1; then
            log_info "Health check passed ✓"
            return 0
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
        log_info "Waiting for service to be healthy... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done
    
    log_error "Health check failed after $MAX_RETRIES attempts"
    return 1
}

smoke_tests() {
    log_info "Running smoke tests..."
    
    # Test API endpoint
    if curl -f http://localhost:3001/api/v1/ > /dev/null 2>&1; then
        log_info "API endpoint test passed ✓"
    else
        log_error "API endpoint test failed"
        return 1
    fi
    
    log_info "All smoke tests passed ✓"
}

deploy() {
    log_info "Starting deployment of $PROJECT_NAME..."
    
    # Check prerequisites
    check_prerequisites
    
    # Backup database
    backup_database
    
    # Pull latest code
    log_info "Pulling latest code..."
    git pull origin main
    
    # Build images
    build_images
    
    # Stop old containers
    log_info "Stopping old containers..."
    docker-compose -f $COMPOSE_FILE down
    
    # Start new containers
    log_info "Starting new containers..."
    docker-compose -f $COMPOSE_FILE up -d
    
    # Wait for services to start
    sleep 5
    
    # Run migrations
    run_migrations
    
    # Health check
    if ! health_check; then
        log_error "Deployment failed health check"
        log_error "Rolling back..."
        docker-compose -f $COMPOSE_FILE down
        exit 1
    fi
    
    # Smoke tests
    if ! smoke_tests; then
        log_error "Deployment failed smoke tests"
        log_error "Rolling back..."
        docker-compose -f $COMPOSE_FILE down
        exit 1
    fi
    
    # Show container status
    log_info "Container status:"
    docker-compose -f $COMPOSE_FILE ps
    
    log_info "✨ Deployment completed successfully! ✨"
}

rollback() {
    log_warn "Rolling back to previous version..."
    
    # Stop current containers
    docker-compose -f $COMPOSE_FILE down
    
    # Restore database
    if [ -n "$1" ]; then
        log_info "Restoring database from $1..."
        docker-compose -f $COMPOSE_FILE exec -T postgres psql -U badminton_user badminton_prod < $1
    fi
    
    # Checkout previous commit
    git reset --hard HEAD~1
    
    # Rebuild and start
    docker-compose -f $COMPOSE_FILE up -d --build
    
    log_info "Rollback completed"
}

show_logs() {
    docker-compose -f $COMPOSE_FILE logs -f --tail=100 backend
}

# Main script
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    rollback)
        rollback $2
        ;;
    logs)
        show_logs
        ;;
    health)
        health_check
        ;;
    *)
        echo "Usage: $0 {deploy|rollback [backup_file]|logs|health}"
        exit 1
        ;;
esac
