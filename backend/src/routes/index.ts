import { Router } from 'express';

// Import route modules
import authRoutes from './auth';
import sessionRoutes from './sessions';
import userRoutes from './users';
import mvpSessionRoutes from './mvpSessions';
import sessionHistoryRoutes from './sessionHistory';
import searchRoutes from './search';
import playerStatusRoutes from './playerStatus';
import pairingRoutes from './pairings';
import discoveryRoutes from './discovery';
import sessionConfigRoutes from './sessionConfig';
import tournamentRoutes from './tournaments';
import matchesRoutes from './matches';
import statisticsRoutes from './statistics';
import rankingsRoutes from './rankings';
import achievementsRoutes from './achievements';
import analyticsRoutes from './analytics';
import notificationsRoutes from './notifications';
import friendsRoutes from './friends';
import messagingRoutes from './messaging';
import challengesRoutes from './challenges';
import matchSchedulingRoutes from './matchScheduling';
import equipmentRoutes from './equipment';
import courtBookingRoutes from './courtBookings';
import paymentRoutes from './payments';

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
console.log('  - /player-status');
router.use('/player-status', playerStatusRoutes);
console.log('  - /pairings');
router.use('/pairings', pairingRoutes);
console.log('  - /sessions/discovery');
router.use('/sessions/discovery', discoveryRoutes);
console.log('  - /sessions/config');
router.use('/sessions/config', sessionConfigRoutes);
console.log('  - /tournaments');
router.use('/tournaments', tournamentRoutes);
console.log('  - /session-history');
router.use('/session-history', sessionHistoryRoutes);
console.log('  - /search');
router.use('/search', searchRoutes);
console.log('  - /matches');
router.use('/matches', matchesRoutes);
console.log('  - /statistics');
router.use('/statistics', statisticsRoutes);
console.log('  - /rankings');
router.use('/rankings', rankingsRoutes);
console.log('  - /achievements');
router.use('/achievements', achievementsRoutes);
console.log('  - /analytics');
router.use('/analytics', analyticsRoutes);
console.log('  - /notifications');
router.use('/notifications', notificationsRoutes);
console.log('  - /friends');
router.use('/friends', friendsRoutes);
console.log('  - /messaging');
router.use('/messaging', messagingRoutes);
console.log('  - /challenges');
router.use('/challenges', challengesRoutes);
console.log('  - /match-scheduling');
router.use('/match-scheduling', matchSchedulingRoutes);
console.log('  - /equipment');
router.use('/equipment', equipmentRoutes);
console.log('  - /court-bookings');
router.use('/court-bookings', courtBookingRoutes);
console.log('  - /payments');
router.use('/payments', paymentRoutes);
console.log('✅ All routes registered successfully');

export const setupRoutes = (): Router => {
  return router;
};