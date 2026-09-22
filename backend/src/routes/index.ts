import { Router } from 'express';
import {
  requireAuth,
  optionalIdentity,
  publicRouter,
} from './mount';

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
import tournamentAnalyticsRoutes from './tournament-analytics';
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
// Golf routes — scoring, betting, handicaps
import golfRoutes from './golf';

// Equipment routes — equipment inventory, reservations, maintenance
import equipmentRoutes from './equipment';
// Court booking routes disabled (depends on payment service)
// import courtBookingRoutes from './courtBookings';
// Payment routes disabled (requires Stripe dependency)
// import paymentRoutes from './payments';
import sharingRoutes from './sharing';
import communityRoutes from './community';
import oauthRoutes from './oauth';
// Story 6.6 — predictive analytics surface (GET :type, ADMIN train/rollback/models)
import predictionRoutes from './predictions';

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
router.use('/auth', publicRouter(authRoutes)); // auth routes are public (pre-login)
console.log('  - /users');
router.use('/users', requireAuth(userRoutes));
console.log('  - /mvp-sessions');
router.use('/mvp-sessions', publicRouter(mvpSessionRoutes)); // has internal auth (optionalAuth, requireOrganizer)
console.log('  - /session-templates');
router.use('/session-templates', optionalIdentity(sessionTemplateRoutes));
console.log('  - /session-suggestions');
router.use('/session-suggestions', optionalIdentity(sessionSuggestionRoutes));
console.log('  - /player-status');
router.use('/player-status', requireAuth(playerStatusRoutes));
console.log('  - /scoring');
router.use('/scoring', requireAuth(scoringRoutes));
console.log('  - /notifications');
router.use('/notifications', requireAuth(notificationRoutes));
console.log('  - /pairings');
router.use('/pairings', requireAuth(pairingRoutes));
console.log('  - /sessions/discovery');
router.use('/sessions/discovery', optionalIdentity(discoveryRoutes));
console.log('  - /sessions/config');
router.use('/sessions/config', requireAuth(sessionConfigRoutes));
console.log('  - /tournaments');
router.use('/tournaments', publicRouter(tournamentAnalyticsRoutes)); // has its own auth inside
router.use('/tournaments', publicRouter(tournamentRoutes)); // has its own auth inside
console.log('  - /session-history');
router.use('/session-history', requireAuth(sessionHistoryRoutes));
console.log('  - /search');
router.use('/search', publicRouter(searchRoutes));
console.log('  - /matches');
router.use('/matches', optionalIdentity(matchesRoutes));
console.log('  - /statistics');
router.use('/statistics', publicRouter(statisticsRoutes));
console.log('  - /rankings');
router.use('/rankings', optionalIdentity(rankingsRoutes));
console.log('  - /achievements');
router.use('/achievements', optionalIdentity(achievementsRoutes));
console.log('  - /analytics');
router.use('/analytics', publicRouter(analyticsRoutes));
console.log('  - /friends');
router.use('/friends', requireAuth(friendsRoutes));
console.log('  - /messaging');
router.use('/messaging', requireAuth(messagingRoutes));
console.log('  - /challenges');
router.use('/challenges', optionalIdentity(challengesRoutes));
console.log('  - /match-scheduling');
router.use('/match-scheduling', requireAuth(matchSchedulingRoutes));
console.log('  - /session-insights');
router.use('/session-insights', optionalIdentity(sessionInsightsRoutes));
console.log('  - /session-costs');
router.use('/session-costs', requireAuth(sessionCostRoutes));
console.log('  - /clubs');
router.use('/clubs', requireAuth(clubRoutes));
console.log('  - /golf');
router.use('/golf', requireAuth(golfRoutes));
console.log('  - /equipment');
router.use('/equipment', requireAuth(equipmentRoutes));
console.log('  - /sharing');
router.use('/sharing', optionalIdentity(sharingRoutes));
console.log('  - /community');
router.use('/community', requireAuth(communityRoutes));
console.log('  - /oauth');
router.use('/oauth', publicRouter(oauthRoutes));
console.log('  - /predictions');
router.use('/predictions', publicRouter(predictionRoutes)); // has internal auth on admin routes
console.log('✅ All routes registered successfully');

export const setupRoutes = (): Router => {
  return router;
};