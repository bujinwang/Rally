import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';

// Import configurations
import { connectDB } from './config/database';
import { setupSocket } from './config/socket';
import { setupRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { scheduler } from './services/scheduler';
import { cacheService } from './services/cacheService';
import webSessionRoutes from './routes/webSession';
import shareCardRoutes from './routes/shareCard';
import adminRoutes from './routes/admin';
import { correlationIdMiddleware } from './middleware/correlationId';
import { requestMetricsMiddleware } from './middleware/requestMetrics';
import { getAggregatedHealth } from './services/healthAggregator';
import metricsRouter from './routes/metrics';
import { attachAdapter, detachAdapter } from './socket/adapter';
import { setIo } from './socket/ioRegistry';
import { publicRouter, requireAuth } from './routes/mount';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);


// Security middleware with CSP configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));

// Trust reverse proxy (nginx) for correct client IP
app.set('trust proxy', 1);

// CORS configuration — allow all localhost ports in development
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:8081').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    // Check exact match first, then localhost wildcard for dev
    if (allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Response compression (gzip)
app.use(compression({
  level: 6,               // Balance speed vs compression
  threshold: 1024,        // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress WebSocket upgrades
    if (req.headers['upgrade']) return false;
    return compression.filter(req, res);
  }
}));

// Correlation ID — must be early so every downstream middleware sees it
app.use(correlationIdMiddleware);

// Logging middleware
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  // The in-memory counter is shared by every suite in a Jest worker, which
  // makes unrelated suites interfere. Bypass under test only; production
  // behaviour and limits are unchanged.
  skip: () => process.env.NODE_ENV === 'test'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request metrics instrumentation — after parsing, before routes
app.use(requestMetricsMiddleware);

// Serve static files (uploaded avatars)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
console.log('📁 Static files served from /uploads');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
console.log('🔧 Setting up API routes...');
const apiRouter = setupRoutes();
app.use('/api/v1', apiRouter);
console.log('✅ API routes configured at /api/v1');

// Web session routes (for direct HTML access)
console.log('🌐 Setting up web session routes...');
app.use('/join', publicRouter(webSessionRoutes)); // share-code-gated
app.use(publicRouter(shareCardRoutes)); // share-code-gated
app.use('/admin', requireAuth(adminRoutes)); // already correctly guarded
console.log('✅ Web session routes configured at /join');

// Serve Expo web build (SPA)
// In Docker, the web build lives at /app/public. Locally, it's at ../../frontend/.../dist/web.
const webBuildPath =
  process.env.WEB_BUILD_PATH ||
  path.join(__dirname, '../../frontend/Rally/dist/web');

// Metrics exposition endpoint (Story 6.3, AC 1 / AC 11)
// Mounted before the SPA catch-all so /metrics is not intercepted by index.html
// Self-guards via bearer token — publicRouter only because it self-guards
app.use('/metrics', publicRouter(metricsRouter));

// Only serve web build if the directory exists (may not in API-only deploys)
const fs = require('fs');
if (fs.existsSync(webBuildPath)) {
  app.use(express.static(webBuildPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    }
  }));
  // SPA fallback — serve index.html for all non-API, non-join routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/join') || req.path.startsWith('/uploads') || req.path === '/health' || req.path === '/metrics') {
      return next();
    }
    res.sendFile(path.join(webBuildPath, 'index.html'), (err: any) => {
      if (err) next();
    });
  });
  console.log(`📁 Web app served from ${webBuildPath}`);
} else {
  console.log('📁 Web build not found — API-only mode');
}

// Health check for route verification
app.get('/api/v1/health', async (req, res) => {
  try {
    const health = await getAggregatedHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : health.status === 'degraded' ? 200 : 200;
    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: error instanceof Error ? error.message : 'Health check failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Cache health (Story 6.2, AC 7) — consumed by monitoring (Story 6.3).
// Never throws: a down cache reports degraded/unhealthy but does not error.
app.get('/api/v1/health/cache', async (req, res) => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    res.status(cacheHealth.status === 'unhealthy' ? 503 : 200).json({
      success: cacheHealth.status !== 'unhealthy',
      data: cacheHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'CACHE_HEALTH_ERROR',
        message: 'Cache health check failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Socket.io setup
const io = new SocketServer(server, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true
  }
});


// Register the Socket.io instance on the Express app so routes can emit
// authoritative real-time updates via `req.app.get('io')` (Story 6.4, AC 4).
// Without this the route-layer emissions in `routes/mvpSessions.ts` are
// silent no-ops and clients never see rotation/score/status changes live.
app.set('io', io);

// Register the shared io instance for the domain event emitters
// (Story 6.4, AC 4 / AC 10 — single authoritative emission path).
setIo(io);

// Attach Redis adapter for multi-instance scaling (Story 6.4, AC 1)
// This is async but we don't await it — the adapter attaches in the background
// and Socket.io queues messages until it's ready.
attachAdapter(io).catch(() => {
  /* fallback to in-memory adapter is handled inside attachAdapter */
});

setupSocket(io);

// Database connection
connectDB();

// Start background scheduler (session reminders, rest expiration, auto-complete)
scheduler.start();

const PORT = process.env.PORT || 3001;

// Only listen when executed directly (not when imported by tests). `require.main`
// is the canonical "run directly" check — the previous NODE_ENV-only guard failed
// whenever NODE_ENV was exported as something other than 'test' (e.g. 'development'),
// binding port 3001 during a test import and keeping Jest's event loop alive forever.
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown — close the Redis connection cleanly (Story 6.2)
  // and the socket adapter's pub/sub clients (Story 6.4, AC 1).
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    try {
      await cacheService.disconnect();
      console.log('✅ Cache connection closed');
    } catch (error) {
      console.error('Cache shutdown error:', error);
    }
    try {
      io.close();
      await detachAdapter();
      console.log('✅ Socket adapter closed');
    } catch (error) {
      console.error('Socket shutdown error:', error);
    }
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    // Force-exit if the server does not close in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

export default app;
export { io };