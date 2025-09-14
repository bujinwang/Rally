/**
 * Pairings API Routes Test Specifications
 *
 * Comprehensive test specifications for the pairings API endpoints.
 * Tests cover authentication, authorization, data validation, and integration scenarios.
 */

export const pairingsApiTestSpecs = {
  // POST /api/v1/pairings/sessions/:sessionId/pairings - Generate Pairings
  generatePairings: [
    {
      description: 'Should generate fair pairings for organizer',
      request: {
        method: 'POST',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer organizer-token',
          'Content-Type': 'application/json'
        },
        body: {
          algorithm: 'fair'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 3 }
        ]
      },
      expected: {
        status: 200,
        body: {
          success: true,
          data: {
            pairings: [
              {
                id: 'pairing_1_1234567890', // Generated ID pattern
                court: 1,
                players: [
                  { id: 'p1', name: 'Alice', position: 'left' },
                  { id: 'p2', name: 'Bob', position: 'right' }
                ],
                createdAt: '2025-01-01T12:00:00.000Z'
              },
              {
                id: 'pairing_2_1234567890', // Generated ID pattern
                court: 2,
                players: [
                  { id: 'p3', name: 'Charlie', position: 'left' },
                  { id: 'p4', name: 'Diana', position: 'right' }
                ],
                createdAt: '2025-01-01T12:00:00.000Z'
              }
            ],
            fairnessScore: 90, // High score due to balanced games played
            oddPlayerOut: undefined,
            generatedAt: '2025-01-01T12:00:00.000Z'
          },
          message: 'Pairings generated successfully',
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    },
    {
      description: 'Should reject pairing generation for non-organizer',
      request: {
        method: 'POST',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer player-token',
          'Content-Type': 'application/json'
        },
        body: {
          algorithm: 'fair'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'different-organizer-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 }
        ]
      },
      expected: {
        status: 403,
        body: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this session'
          },
          timestamp: expect.any(String)
        }
      }
    },
    {
      description: 'Should handle insufficient players error',
      request: {
        method: 'POST',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer organizer-token',
          'Content-Type': 'application/json'
        },
        body: {
          algorithm: 'fair'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 }
        ]
      },
      expected: {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'INSUFFICIENT_PLAYERS',
            message: 'Need at least 4 active players to generate pairings'
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    },
    {
      description: 'Should validate algorithm parameter',
      request: {
        method: 'POST',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer organizer-token',
          'Content-Type': 'application/json'
        },
        body: {
          algorithm: 'invalid_algorithm'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 3 }
        ]
      },
      expected: {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: ['"algorithm" must be one of [fair, random, skill_based]']
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    }
  ],

  // GET /api/v1/pairings/sessions/:sessionId/pairings - Get Pairings
  getPairings: [
    {
      description: 'Should return current pairings for session participant',
      request: {
        method: 'GET',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer player-token'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0, userId: 'player-user-id' },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 3 }
        ]
      },
      expected: {
        status: 200,
        body: {
          success: true,
          data: {
            pairings: expect.any(Array),
            fairnessScore: 85,
            oddPlayerOut: undefined,
            generatedAt: '2025-01-01T12:00:00.000Z'
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    },
    {
      description: 'Should reject access for non-participants',
      request: {
        method: 'GET',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer outsider-token'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'different-organizer-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0, userId: 'different-user-id' }
        ]
      },
      expected: {
        status: 403,
        body: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this session'
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    }
  ],

  // PUT /api/v1/pairings/sessions/:sessionId/pairings/:pairingId - Adjust Pairing
  adjustPairing: [
    {
      description: 'Should allow organizer to adjust pairing',
      request: {
        method: 'PUT',
        url: '/api/v1/pairings/sessions/test-session-123/pairings/pairing_123_456',
        headers: {
          'Authorization': 'Bearer organizer-token',
          'Content-Type': 'application/json'
        },
        body: {
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p3', name: 'Charlie' }
          ]
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 }
        ]
      },
      expected: {
        status: 200,
        body: {
          success: true,
          data: {
            pairing: {
              id: 'pairing_123_456',
              court: 1,
              players: [
                { id: 'p1', name: 'Alice', position: 'left' },
                { id: 'p3', name: 'Charlie', position: 'right' }
              ]
            },
            message: 'Pairing adjusted successfully'
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    },
    {
      description: 'Should reject invalid pairing adjustments',
      request: {
        method: 'PUT',
        url: '/api/v1/pairings/sessions/test-session-123/pairings/pairing_123_456',
        headers: {
          'Authorization': 'Bearer organizer-token',
          'Content-Type': 'application/json'
        },
        body: {
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p1', name: 'Alice' } // Duplicate player
          ]
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 }
        ]
      },
      expected: {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'INVALID_PAIRING',
            message: 'Invalid pairing adjustment',
            details: ['Player Alice is already assigned to another pairing']
          },
          timestamp: '2025-01-01T12:00:00.000Z'
        }
      }
    }
  ],

  // DELETE /api/v1/pairings/sessions/:sessionId/pairings - Clear Pairings
  clearPairings: [
    {
      description: 'Should allow organizer to clear all pairings',
      request: {
        method: 'DELETE',
        url: '/api/v1/pairings/sessions/test-session-123/pairings',
        headers: {
          'Authorization': 'Bearer organizer-token'
        }
      },
      sessionData: {
        id: 'test-session-123',
        ownerId: 'organizer-user-id',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 }
        ]
      },
      expected: {
        status: 200,
        body: {
          success: true,
          message: 'Pairings cleared successfully',
          timestamp: expect.any(String)
        }
      }
    }
  ]
};

/**
 * Integration Test Scenarios for Pairings API
 */
export const pairingsApiIntegrationScenarios = [
  {
    scenario: 'Complete pairing workflow',
    steps: [
      '1. Create session with organizer and players',
      '2. POST /pairings - Generate initial pairings',
      '3. GET /pairings - Verify pairings are returned',
      '4. PUT /pairings/:id - Adjust a pairing',
      '5. GET /pairings - Verify adjustment is reflected',
      '6. DELETE /pairings - Clear all pairings',
      '7. GET /pairings - Verify pairings are cleared'
    ]
  },
  {
    scenario: 'Real-time pairing updates',
    steps: [
      '1. Multiple clients connect to session',
      '2. Organizer generates pairings',
      '3. Verify all clients receive pairings_updated event',
      '4. Organizer adjusts pairing',
      '5. Verify all clients receive pairing_adjusted event'
    ]
  },
  {
    scenario: 'Status integration with pairings',
    steps: [
      '1. Generate pairings with all ACTIVE players',
      '2. Player requests REST status',
      '3. Organizer approves REST request',
      '4. Generate new pairings',
      '5. Verify RESTING player is excluded',
      '6. Wait for rest expiration',
      '7. Generate pairings again',
      '8. Verify player is included again'
    ]
  }
];

/**
 * Performance Test Specifications
 */
export const pairingsPerformanceTests = [
  {
    test: 'Large session pairing generation',
    setup: 'Session with 20 ACTIVE players',
    operation: 'POST /pairings with fair algorithm',
    expected: 'Response within 2 seconds',
    assertions: [
      'Response time < 2000ms',
      'All players paired appropriately',
      'Fairness score calculated',
      'No errors in pairing logic'
    ]
  },
  {
    test: 'Concurrent pairing requests',
    setup: 'Multiple clients requesting pairings simultaneously',
    operation: '10 concurrent POST /pairings requests',
    expected: 'All requests handled without conflicts',
    assertions: [
      'No race conditions',
      'Consistent pairing results',
      'Proper error handling for conflicts'
    ]
  }
];

/**
 * Error Handling Test Cases
 */
export const pairingsErrorScenarios = [
  {
    scenario: 'Database connection failure',
    trigger: 'Database becomes unavailable during pairing generation',
    expected: 'Graceful error response with retry suggestion'
  },
  {
    scenario: 'Invalid session ID',
    trigger: 'Request with non-existent session ID',
    expected: '404 Not Found with appropriate error message'
  },
  {
    scenario: 'Malformed request data',
    trigger: 'Invalid JSON or missing required fields',
    expected: '400 Bad Request with validation error details'
  },
  {
    scenario: 'Authorization token expiry',
    trigger: 'Expired JWT token in request',
    expected: '401 Unauthorized with token refresh suggestion'
  }
];