import { Router } from 'express';

// Import route modules
import authRoutes from './auth';
import sessionRoutes from './sessions';
import userRoutes from './users';
import mvpSessionRoutes from './mvpSessions';
import sessionHistoryRoutes from './sessionHistory';
import searchRoutes from './search';

const router = Router();

// Health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Badminton Group API v1',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
console.log('📍 Registering routes:');
console.log('  - /auth');
router.use('/auth', authRoutes);
console.log('  - /sessions');
router.use('/sessions', sessionRoutes);
console.log('  - /users');
router.use('/users', userRoutes);
console.log('  - /mvp-sessions');
router.use('/mvp-sessions', mvpSessionRoutes);
console.log('  - /session-history');
router.use('/session-history', sessionHistoryRoutes);
console.log('  - /search');
router.use('/search', searchRoutes);
console.log('✅ All routes registered successfully');

export const setupRoutes = (): Router => {
  return router;
};