# Production Dockerfile for Badminton Group Backend
# Optimized for production deployment with security hardening

# Build stage
FROM node:24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:24-alpine AS production

# Install production runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S badminton -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=badminton:nodejs /app/dist ./dist
COPY --from=builder --chown=badminton:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=badminton:nodejs /app/package*.json ./
COPY --from=builder --chown=badminton:nodejs /app/prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs && \
    chown -R badminton:nodejs /app

# Switch to non-root user
USER badminton

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check with proper production settings
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]