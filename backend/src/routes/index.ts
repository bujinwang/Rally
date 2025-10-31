import { Router } from 'express';

// ==========================================
// MVP ROUTES ONLY
// ==========================================
// Only core MVP functionality is enabled
// All Phase 2+ features moved to future-features/
// ==========================================

import mvpSessionRoutes from './mvpSessions';

const router = Router();

// Health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Badminton Group API - MVP v1.0',
    timestamp: new Date().toISOString(),
    version: '1.0.0-mvp',
    features: {
      mvp: ['sessions', 'players', 'games', 'rotation'],
      phase2: 'coming soon',
      phase3: 'coming soon'
    }
  });
});

// MVP API routes
console.log('📍 Registering MVP routes:');
console.log('  - /mvp-sessions (Core MVP functionality)');
router.use('/mvp-sessions', mvpSessionRoutes);
console.log('✅ MVP routes registered successfully');

// ==========================================
// DISABLED ROUTES (Phase 2+)
// ==========================================
// The following routes are disabled for MVP:
// - /auth (Phase 2: User authentication)
// - /users (Phase 2: User management)
// - /tournaments (Phase 3: Tournament system)
// - /achievements (Phase 3: Achievement system)
// - /friends (Phase 3: Social features)
// - /messaging (Phase 3: Social features)
// - /challenges (Phase 3: Social features)
// - /equipment (Phase 4: Equipment management)
// - /court-bookings (Phase 4: Court booking)
// - /analytics (Phase 3: Advanced analytics)
// - /rankings (Phase 3: Ranking system)
// - /statistics (Phase 3: Advanced statistics)
// - /pairings (Phase 4: AI pairing)
// - /notifications (Phase 2: Push notifications)
// - /payments (Phase 4: Payment integration)
// - /sharing (Phase 3: Social sharing)
// ==========================================

export const setupRoutes = (): Router => {
  return router;
};
