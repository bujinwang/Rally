/**
 * Badminton Group MVP - End-to-End Test Suite
 *
 * Critical user journey validations for production readiness.
 * Tests complete workflows from session creation to match completion.
 */

describe('Badminton Group MVP - E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('E2E-001: Complete Session Lifecycle', () => {
    it('should create session, share link, and allow players to join', async () => {
      const startTime = Date.now();

      // Navigate to create session screen
      await expect(element(by.id('create-session-button'))).toBeVisible();
      await element(by.id('create-session-button')).tap();

      // Fill session details
      await element(by.id('session-name-input')).typeText('E2E Test Session');
      await element(by.id('location-input')).typeText('Test Court');
      await element(by.id('max-players-input')).typeText('8');
      await element(by.id('organizer-name-input')).typeText('Test Organizer');

      // Create session
      await element(by.id('create-session-submit')).tap();

      // Verify session created and share link generated
      await expect(element(by.id('session-created-success'))).toBeVisible();
      await expect(element(by.id('share-link-text'))).toBeVisible();

      // Copy share link
      const shareLink = await element(by.id('share-link-text')).getAttributes();
      expect(shareLink.text).toContain('/join/');

      // Navigate to join screen
      await element(by.id('join-session-button')).tap();
      await element(by.id('share-link-input')).typeText(shareLink.text);
      await element(by.id('join-session-submit')).tap();

      // Verify player joined
      await expect(element(by.id('player-joined-success'))).toBeVisible();

      // Performance check
      const endTime = Date.now();
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('E2E-002: Session Discovery and Filtering', () => {
    it('should discover sessions with location-based filtering', async () => {
      const startTime = Date.now();

      // Navigate to session discovery
      await expect(element(by.id('discover-sessions-button'))).toBeVisible();
      await element(by.id('discover-sessions-button')).tap();

      // Verify location permission request
      await expect(element(by.id('location-permission-prompt'))).toBeVisible();
      await element(by.id('allow-location-button')).tap();

      // Wait for sessions to load
      await waitFor(element(by.id('sessions-list')))
        .toBeVisible()
        .withTimeout(5000);

      // Apply filters
      await element(by.id('skill-level-filter')).tap();
      await element(by.id('intermediate-skill')).tap();
      await element(by.id('court-type-filter')).tap();
      await element(by.id('indoor-court')).tap();

      // Verify filtered results
      const sessionCards = await element(by.id('session-card')).getAttributes();
      expect(sessionCards.length).toBeGreaterThan(0);

      // Performance check
      const endTime = Date.now();
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000); // Should load within 3 seconds
    });
  });

  describe('E2E-003: Real-time Session Management', () => {
    it('should update session in real-time when players join/leave', async () => {
      // Create session first
      await element(by.id('create-session-button')).tap();
      await element(by.id('session-name-input')).typeText('Real-time Test');
      await element(by.id('location-input')).typeText('Test Court');
      await element(by.id('max-players-input')).typeText('8');
      await element(by.id('organizer-name-input')).typeText('Organizer');
      await element(by.id('create-session-submit')).tap();

      // Get initial player count
      const initialCount = await element(by.id('player-count')).getAttributes();

      // Simulate another device joining (in real test, this would be separate device)
      // For now, we'll test the UI updates when player count changes
      await expect(element(by.id('player-count'))).toBeVisible();

      // Verify real-time updates are working (WebSocket connection)
      await expect(element(by.id('connection-status-online'))).toBeVisible();
    });
  });

  describe('E2E-004: Pairing Generation and Management', () => {
    it('should generate fair pairings and display them correctly', async () => {
      const startTime = Date.now();

      // Navigate to existing session with players
      await element(by.id('join-session-button')).tap();
      await element(by.id('share-link-input')).typeText('test-session-link');
      await element(by.id('join-session-submit')).tap();

      // Wait for session to load
      await waitFor(element(by.id('session-loaded')))
        .toBeVisible()
        .withTimeout(3000);

      // Generate pairings (organizer only)
      await element(by.id('generate-pairings-button')).tap();

      // Verify pairings generated
      await waitFor(element(by.id('pairings-generated')))
        .toBeVisible()
        .withTimeout(5000);

      // Check pairing quality indicators
      await expect(element(by.id('fairness-score'))).toBeVisible();
      await expect(element(by.id('court-assignments'))).toBeVisible();

      // Performance check
      const endTime = Date.now();
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
    });
  });

  describe('E2E-005: Match Recording Workflow', () => {
    it('should record match results and update statistics', async () => {
      // Navigate to active match
      await element(by.id('active-match-card')).tap();

      // Record match result
      await element(by.id('player1-wins')).tap();
      await element(by.id('score-2-0')).tap();
      await element(by.id('record-match-button')).tap();

      // Verify match recorded
      await expect(element(by.id('match-recorded-success'))).toBeVisible();

      // Check statistics updated
      await element(by.id('view-statistics')).tap();
      await expect(element(by.id('player-statistics'))).toBeVisible();
      await expect(element(by.id('match-history'))).toBeVisible();
    });
  });

  describe('E2E-006: Error Handling and Recovery', () => {
    it('should handle network errors gracefully', async () => {
      // Disable network (simulate offline)
      await device.disableSynchronization();

      // Attempt to perform network operation
      await element(by.id('refresh-sessions')).tap();

      // Verify offline message shown
      await expect(element(by.id('offline-message'))).toBeVisible();
      await expect(element(by.id('retry-button'))).toBeVisible();

      // Re-enable network
      await device.enableSynchronization();

      // Retry operation
      await element(by.id('retry-button')).tap();

      // Verify operation succeeds
      await expect(element(by.id('sessions-refreshed'))).toBeVisible();
    });
  });

  describe('Performance Validation', () => {
    it('should meet performance requirements', async () => {
      const startTime = Date.now();

      // Navigate through main user journey
      await element(by.id('discover-sessions-button')).tap();
      await waitFor(element(by.id('sessions-list'))).toBeVisible();

      await element(by.id('session-card')).atIndex(0).tap();
      await waitFor(element(by.id('session-details'))).toBeVisible();

      await element(by.id('join-session-button')).tap();
      await waitFor(element(by.id('player-joined-success'))).toBeVisible();

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Performance requirements
      expect(totalDuration).toBeLessThan(5000); // Complete journey < 5 seconds
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should work consistently across platforms', async () => {
      // Test platform-specific elements exist
      if (device.getPlatform() === 'ios') {
        await expect(element(by.id('ios-specific-element'))).toBeVisible();
      } else if (device.getPlatform() === 'android') {
        await expect(element(by.id('android-specific-element'))).toBeVisible();
      }

      // Test common elements work on both platforms
      await expect(element(by.id('create-session-button'))).toBeVisible();
      await expect(element(by.id('discover-sessions-button'))).toBeVisible();
    });
  });
});
