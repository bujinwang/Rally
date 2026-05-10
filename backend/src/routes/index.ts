import { Router } from 'express';

// Import route modules
import authRoutes from './auth';
// import sessionRoutes from './sessions'; // Temporarily disabled due to schema mismatch
import userRoutes from './users';
import mvpSessionRoutes from './mvpSessions';
import sessionHistoryRoutes from './sessionHistory';
import sessionTemplateRoutes from './sessionTemplates';
import sessionSuggestionRoutes from './sessionSuggestions';
import searchRoutes from './search';
import playerStatusRoutes from './playerStatus';
import scoringRoutes from './scoring';
import notificationRoutes from './notifications';
import pairingRoutes from './pairings';
import discoveryRoutes from './discovery';
import sessionConfigRoutes from './sessionConfig';
import tournamentRoutes from './tournaments';
import matchesRoutes from './matches';
import statisticsRoutes from './statistics';
import rankingsRoutes from './rankings';
import achievementsRoutes from './achievements';
import analyticsRoutes from './analytics';
import friendsRoutes from './friends';
import messagingRoutes from './messaging';
import challengesRoutes from './challenges';
import matchSchedulingRoutes from './matchScheduling';
import sessionInsightsRoutes from './sessionInsights';
import sessionCostRoutes from './sessionCosts';
import clubRoutes from './clubs';
// Equipment routes — equipment inventory, reservations, maintenance
import equipmentRoutes from './equipment';
// Court booking routes disabled (depends on payment service)
// import courtBookingRoutes from './courtBookings';
// Payment routes disabled (requires Stripe dependency)
// import paymentRoutes from './payments';
import sharingRoutes from './sharing';
import communityRoutes from './community';
import oauthRoutes from './oauth';

const router = Router();

// Health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Rally API v1',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
console.log('📍 Registering routes:');
console.log('  - /auth');
router.use('/auth', authRoutes);
console.log('  - /users');
router.use('/users', userRoutes);
console.log('  - /mvp-sessions');
router.use('/mvp-sessions', mvpSessionRoutes);
console.log('  - /session-templates');
router.use('/session-templates', sessionTemplateRoutes);
console.log('  - /session-suggestions');
router.use('/session-suggestions', sessionSuggestionRoutes);
console.log('  - /player-status');
router.use('/player-status', playerStatusRoutes);
console.log('  - /scoring');
router.use('/scoring', scoringRoutes);
console.log('  - /notifications');
router.use('/notifications', notificationRoutes);
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
console.log('  - /friends');
router.use('/friends', friendsRoutes);
console.log('  - /messaging');
router.use('/messaging', messagingRoutes);
console.log('  - /challenges');
router.use('/challenges', challengesRoutes);
console.log('  - /match-scheduling');
router.use('/match-scheduling', matchSchedulingRoutes);
console.log('  - /session-insights');
router.use('/session-insights', sessionInsightsRoutes);
console.log('  - /session-costs');
router.use('/session-costs', sessionCostRoutes);
console.log('  - /clubs');
router.use('/clubs', clubRoutes);
// Equipment routes — inventory, reservations, check-out/return, maintenance
console.log('  - /equipment');
router.use('/equipment', equipmentRoutes);
// Court booking routes disabled (not part of MVP)
// console.log('  - /court-bookings');
// router.use('/court-bookings', courtBookingRoutes);
// Payment routes disabled (not part of MVP)
// console.log('  - /payments');
// router.use('/payments', paymentRoutes);
console.log('  - /sharing');
router.use('/sharing', sharingRoutes);
console.log('  - /community');
router.use('/community', communityRoutes);
console.log('  - /oauth');
router.use('/oauth', oauthRoutes);
console.log('✅ All routes registered successfully');

export const setupRoutes = (): Router => {
  return router;
};