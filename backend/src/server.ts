import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';

// Import configurations
import { connectDB } from './config/database';
import { setupSocket } from './config/socket';
import { setupRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import webSessionRoutes from './routes/webSession';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);


// Security middleware with CSP configuration for web session routes
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for web session interface
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
      imgSrc: ["'self'", "data:"], // Allow data URIs for images
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Logging middleware
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use('/session', webSessionRoutes);
console.log('✅ Web session routes configured at /session');

// Health check for route verification
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Socket.io setup
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }
});

setupSocket(io);

// Database connection
connectDB();

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
export { io };