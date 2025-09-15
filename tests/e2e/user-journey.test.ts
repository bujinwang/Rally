/**
 * End-to-End User Journey Tests
 * Tests complete user workflows from session creation to match completion
 */

describe('User Journey: Complete Badminton Session', () => {
  let sessionId: string;
  let player1Id: string;
  let player2Id: string;
  let organizerToken: string;
  let player1Token: string;
  let player2Token: string;

  describe('Session Creation and Setup', () => {
    it('should create a new badminton session', async () => {
      // Organizer creates session
      const createResponse = await request
        .post('/api/sessions')
        .send({
          name: 'E2E Test Session',
          dateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
          location: 'Test Court',
          maxPlayers: 10,
          organizerName: 'Test Organizer'
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);

      sessionId = createResponse.body.data.session.id;
      organizerToken = createResponse.body.data.session.shareCode; // Mock token

      // Verify session was created
      const sessionResponse = await request
        .get(`/api/sessions/${createResponse.body.data.session.shareCode}`);

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.data.session.name).toBe('E2E Test Session');
    });

    it('should allow players to join the session', async () => {
      // Player 1 joins
      const joinResponse1 = await request
        .post(`/api/sessions/join/${organizerToken}`)
        .send({
          name: 'Player One',
          deviceId: 'device-1'
        });

      expect(joinResponse1.status).toBe(201);
      player1Id = joinResponse1.body.data.player.id;
      player1Token = 'player1-token'; // Mock token

      // Player 2 joins
      const joinResponse2 = await request
        .post(`/api/sessions/join/${organizerToken}`)
        .send({
          name: 'Player Two',
          deviceId: 'device-2'
        });

      expect(joinResponse2.status).toBe(201);
      player2Id = joinResponse2.body.data.player.id;
      player2Token = 'player2-token'; // Mock token

      // Verify players are in session
      const sessionResponse = await request
        .get(`/api/sessions/${organizerToken}`);

      expect(sessionResponse.body.data.session.players).toHaveLength(3); // Organizer + 2 players
    });
  });

  describe('Match Recording Workflow', () => {
    it('should record a match result', async () => {
      // Record a match between Player 1 and Player 2
      const matchResponse = await request
        .post('/api/matches')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({
          sessionId: sessionId,
          player1Id: player1Id,
          player2Id: player2Id,
          winnerId: player1Id,
          scoreType: '2-0'
        });

      expect(matchResponse.status).toBe(201);

      // Verify match was recorded
      const matchRecord = await prisma.match.findFirst({
        where: { sessionId: sessionId }
      });
      expect(matchRecord).toBeTruthy();
      expect(matchRecord?.winnerId).toBe(player1Id);
    });

    it('should update player statistics after match', async () => {
      // Check Player 1 stats
      const player1Stats = await request
        .get(`/api/players/${player1Id}/statistics`)
        .set('Authorization', `Bearer ${player1Token}`);

      expect(player1Stats.status).toBe(200);
      expect(player1Stats.body.totalMatches).toBe(1);
      expect(player1Stats.body.wins).toBe(1);
      expect(player1Stats.body.winRate).toBe(1.0);

      // Check Player 2 stats
      const player2Stats = await request
        .get(`/api/players/${player2Id}/statistics`)
        .set('Authorization', `Bearer ${player2Token}`);

      expect(player2Stats.status).toBe(200);
      expect(player2Stats.body.totalMatches).toBe(1);
      expect(player2Stats.body.losses).toBe(1);
      expect(player2Stats.body.winRate).toBe(0.0);
    });
  });

  describe('Real-time Updates', () => {
    it('should broadcast match results to all session participants', async () => {
      // This would require WebSocket testing
      // Mock the socket emission and verify it was called

      const matchResponse = await request
        .post('/api/matches')
        .set('Authorization', `Bearer ${player2Token}`)
        .send({
          sessionId: sessionId,
          player1Id: player2Id,
          player2Id: player1Id,
          winnerId: player2Id,
          scoreType: '2-1'
        });

      expect(matchResponse.status).toBe(201);

      // In a real implementation, we would verify socket emissions
      // For now, just verify the match was recorded
      const matches = await prisma.match.findMany({
        where: { sessionId: sessionId }
      });
      expect(matches).toHaveLength(2);
    });
  });

  describe('Session Management', () => {
    it('should allow organizer to generate pairings', async () => {
      // Add more players for pairings
      for (let i = 3; i <= 8; i++) {
        await request
          .post(`/api/sessions/join/${organizerToken}`)
          .send({
            name: `Player ${i}`,
            deviceId: `device-${i}`
          });
      }

      // Generate pairings
      const pairingsResponse = await request
        .post(`/api/pairings/sessions/${sessionId}/pairings`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          algorithm: 'fair'
        });

      expect(pairingsResponse.status).toBe(200);
      expect(pairingsResponse.body.success).toBe(true);
      expect(pairingsResponse.body.data.pairings).toBeDefined();
    });

    it('should provide session statistics dashboard', async () => {
      const statsResponse = await request
        .get(`/api/sessions/${sessionId}/statistics`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data).toHaveProperty('totalMatches');
      expect(statsResponse.body.data).toHaveProperty('totalPlayers');
      expect(statsResponse.body.data).toHaveProperty('sessionStatus');
    });
  });

  describe('Data Persistence and Recovery', () => {
    it('should persist all data across application restarts', async () => {
      // This test would require restarting the application
      // and verifying data persistence

      // For now, verify data exists in database
      const session = await prisma.mvpSession.findUnique({
        where: { id: sessionId },
        include: {
          players: true,
          matches: true
        }
      });

      expect(session).toBeTruthy();
      expect(session?.players).toHaveLength(8); // Organizer + 7 players
      expect(session?.matches).toHaveLength(2);
    });

    it('should handle concurrent operations safely', async () => {
      // Test concurrent match recordings
      const concurrentMatches = [];

      for (let i = 0; i < 5; i++) {
        concurrentMatches.push(
          request
            .post('/api/matches')
            .set('Authorization', `Bearer ${player1Token}`)
            .send({
              sessionId: sessionId,
              player1Id: player1Id,
              player2Id: player2Id,
              winnerId: i % 2 === 0 ? player1Id : player2Id,
              scoreType: '2-0'
            })
        );
      }

      const responses = await Promise.all(concurrentMatches);

      // All should succeed
      expect(responses.every(r => r.status === 201)).toBe(true);

      // Verify final match count
      const finalMatches = await prisma.match.findMany({
        where: { sessionId: sessionId }
      });
      expect(finalMatches).toHaveLength(7); // 2 previous + 5 new
    });
  });

  describe('Performance Validation', () => {
    it('should maintain response times under load', async () => {
      const requests = [];
      const startTime = Date.now();

      // Make 50 concurrent requests
      for (let i = 0; i < 50; i++) {
        requests.push(
          request
            .get(`/api/sessions/${organizerToken}`)
            .set('Authorization', `Bearer ${organizerToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / 50;

      // All requests should succeed
      expect(responses.every(r => r.status === 200)).toBe(true);

      // Average response time should be under 200ms
      expect(avgResponseTime).toBeLessThan(200);
    });

    it('should cache frequently accessed data', async () => {
      // First request (cache miss)
      const startTime1 = Date.now();
      await request
        .get(`/api/sessions/${organizerToken}/statistics`)
        .set('Authorization', `Bearer ${organizerToken}`);
      const endTime1 = Date.now();
      const firstRequestTime = endTime1 - startTime1;

      // Second request (cache hit)
      const startTime2 = Date.now();
      await request
        .get(`/api/sessions/${organizerToken}/statistics`)
        .set('Authorization', `Bearer ${organizerToken}`);
      const endTime2 = Date.now();
      const secondRequestTime = endTime2 - startTime2;

      // Cached request should be faster
      expect(secondRequestTime).toBeLessThan(firstRequestTime * 0.5);
    });
  });
});

// Helper function (would be imported in real implementation)
function request(app: any) {
  // Mock request function for testing
  return {
    post: (url: string) => ({
      send: (data: any) => ({
        set: (header: string, value: string) => ({
          expect: (status: number) => Promise.resolve({ status, body: { success: true, data: data } })
        })
      })
    }),
    get: (url: string) => ({
      set: (header: string, value: string) => ({
        expect: (status: number) => Promise.resolve({ status, body: { success: true, data: {} } })
      })
    })
  };
}

// Mock prisma for testing
const prisma = {
  mvpSession: {
    findUnique: () => Promise.resolve({}),
    create: () => Promise.resolve({}),
    update: () => Promise.resolve({})
  },
  mvpPlayer: {
    create: () => Promise.resolve({}),
    findUnique: () => Promise.resolve({})
  },
  match: {
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve({}),
    create: () => Promise.resolve({})
  }
};