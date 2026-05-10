# ── Stage 1: Build backend ─────────────────────────────────────
FROM node:18-alpine AS backend-builder

RUN apk add --no-cache python3 make g++ git

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build
RUN npm prune --production

# ── Stage 2: Build frontend web ────────────────────────────────
FROM node:18-alpine AS frontend-builder

WORKDIR /app
COPY frontend/Rally/package*.json ./
RUN npm ci
COPY frontend/Rally/ .

# Build the web app with production env vars
ENV EXPO_PUBLIC_API_URL=/api/v1
ENV EXPO_PUBLIC_ENVIRONMENT=production
RUN npx expo export --platform web --output-dir dist/web

# ── Stage 3: Production ────────────────────────────────────────
FROM node:18-alpine AS production

RUN apk add --no-cache dumb-init curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S badminton -u 1001

WORKDIR /app

# Backend
COPY --from=backend-builder --chown=badminton:nodejs /app/dist ./dist
COPY --from=backend-builder --chown=badminton:nodejs /app/node_modules ./node_modules
COPY --from=backend-builder --chown=badminton:nodejs /app/package*.json ./
COPY --from=backend-builder --chown=badminton:nodejs /app/prisma ./prisma

# Web build
COPY --from=frontend-builder --chown=badminton:nodejs /app/dist/web ./public

# Prisma client
RUN npx prisma generate

RUN mkdir -p /app/logs && chown -R badminton:nodejs /app

USER badminton

ENV NODE_ENV=production
ENV PORT=3001
ENV WEB_BUILD_PATH=/app/public

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
