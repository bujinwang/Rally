/**
 * Pairing Service Tests
 *
 * Test specifications for the PairingService integration with status management.
 * These tests verify that the pairing system properly excludes players based on status.
 */

export const pairingServiceTestSpecs = {
  getActivePlayersForPairing: [
    {
      description: 'Should return only ACTIVE players',
      input: {
        sessionId: 'test-session',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p2', name: 'Bob', status: 'RESTING', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'LEFT', gamesPlayed: 3 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 0 }
        ]
      },
      expected: [
        { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 2 },
        { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 0 }
      ]
    },
    {
      description: 'Should sort players by games played (ascending)',
      input: {
        sessionId: 'test-session',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 5 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 8 }
        ]
      },
      expected: [
        { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 2 },
        { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 5 },
        { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 8 }
      ]
    }
  ],

  generatePairings: [
    {
      description: 'Should generate fair pairings for even number of players',
      input: {
        sessionId: 'test-session',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 3 }
        ],
        algorithm: 'fair'
      },
      expected: {
        pairings: [
          {
            court: 1,
            players: [
              { id: 'p1', name: 'Alice', position: 'left' },
              { id: 'p2', name: 'Bob', position: 'right' }
            ]
          },
          {
            court: 2,
            players: [
              { id: 'p3', name: 'Charlie', position: 'left' },
              { id: 'p4', name: 'Diana', position: 'right' }
            ]
          }
        ],
        fairnessScore: 90, // High score due to balanced games played
        oddPlayerOut: undefined
      }
    },
    {
      description: 'Should handle odd number of players',
      input: {
        sessionId: 'test-session',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'ACTIVE', gamesPlayed: 2 }
        ],
        algorithm: 'fair'
      },
      expected: {
        pairings: [
          {
            court: 1,
            players: [
              { id: 'p1', name: 'Alice', position: 'left' },
              { id: 'p2', name: 'Bob', position: 'right' }
            ]
          }
        ],
        fairnessScore: 85,
        oddPlayerOut: 'p3' // Charlie has most games, becomes odd player out
      }
    },
    {
      description: 'Should exclude RESTING and LEFT players',
      input: {
        sessionId: 'test-session',
        players: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'RESTING', gamesPlayed: 1 },
          { id: 'p3', name: 'Charlie', status: 'LEFT', gamesPlayed: 2 },
          { id: 'p4', name: 'Diana', status: 'ACTIVE', gamesPlayed: 3 }
        ],
        algorithm: 'fair'
      },
      expected: {
        pairings: [
          {
            court: 1,
            players: [
              { id: 'p1', name: 'Alice', position: 'left' },
              { id: 'p4', name: 'Diana', position: 'right' }
            ]
          }
        ],
        fairnessScore: 95, // Perfect balance between remaining players
        oddPlayerOut: undefined
      }
    }
  ],

  calculateFairnessScore: [
    {
      description: 'Should calculate high fairness score for balanced pairings',
      input: {
        pairings: [
          {
            court: 1,
            players: [
              { id: 'p1', name: 'Alice', position: 'left' },
              { id: 'p2', name: 'Bob', position: 'right' }
            ]
          }
        ],
        allPlayers: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 2 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 2 }
        ]
      },
      expected: 100 // Perfect balance
    },
    {
      description: 'Should calculate lower fairness score for unbalanced pairings',
      input: {
        pairings: [
          {
            court: 1,
            players: [
              { id: 'p1', name: 'Alice', position: 'left' },
              { id: 'p2', name: 'Bob', position: 'right' }
            ]
          }
        ],
        allPlayers: [
          { id: 'p1', name: 'Alice', status: 'ACTIVE', gamesPlayed: 0 },
          { id: 'p2', name: 'Bob', status: 'ACTIVE', gamesPlayed: 10 }
        ]
      },
      expected: 0 // Maximum imbalance
    }
  ],

  validatePairing: [
    {
      description: 'Should validate correct pairing',
      input: {
        pairing: {
          id: 'pair1',
          court: 1,
          players: [
            { id: 'p1', name: 'Alice', position: 'left' },
            { id: 'p2', name: 'Bob', position: 'right' }
          ]
        },
        existingPairings: []
      },
      expected: { valid: true, errors: [] }
    },
    {
      description: 'Should reject pairing with duplicate players',
      input: {
        pairing: {
          id: 'pair1',
          court: 1,
          players: [
            { id: 'p1', name: 'Alice', position: 'left' },
            { id: 'p1', name: 'Alice', position: 'right' } // Duplicate
          ]
        },
        existingPairings: []
      },
      expected: {
        valid: false,
        errors: ['Player Alice is already assigned to another pairing']
      }
    },
    {
      description: 'Should reject pairing with too many players',
      input: {
        pairing: {
          id: 'pair1',
          court: 1,
          players: [
            { id: 'p1', name: 'Alice', position: 'left' },
            { id: 'p2', name: 'Bob', position: 'right' },
            { id: 'p3', name: 'Charlie', position: 'center' } // Third player
          ]
        },
        existingPairings: []
      },
      expected: {
        valid: false,
        errors: ['Pairing cannot have more than 2 players']
      }
    }
  ]
};

/**
 * Integration Test Scenarios
 *
 * These tests verify the integration between status management and pairing system:
 */
export const integrationTestScenarios = [
  {
    scenario: 'Player status change affects pairings',
    steps: [
      '1. Create session with 4 ACTIVE players',
      '2. Generate initial pairings',
      '3. Have one player request REST status',
      '4. Organizer approves the request',
      '5. Generate new pairings',
      '6. Verify RESTING player is excluded',
      '7. Verify remaining 3 players are paired appropriately'
    ]
  },
  {
    scenario: 'Rest period expiration reactivates player',
    steps: [
      '1. Player is in RESTING status',
      '2. Rest period expires automatically',
      '3. Player status changes to ACTIVE',
      '4. Generate new pairings',
      '5. Verify player is now included in pairings'
    ]
  },
  {
    scenario: 'Leave status permanently excludes player',
    steps: [
      '1. Player requests LEAVE status',
      '2. Organizer approves the request',
      '3. Player status changes to LEFT',
      '4. Generate pairings multiple times',
      '5. Verify LEFT player is always excluded'
    ]
  }
];

/**
 * Manual Testing Checklist for Pairing Integration
 */
export const manualTestingChecklist = [
  '✅ Create session with 4+ players',
  '✅ Generate initial pairings with all ACTIVE players',
  '✅ Have player request REST status',
  '✅ Verify RESTING player excluded from new pairings',
  '✅ Test rest period expiration',
  '✅ Verify expired player returns to ACTIVE status',
  '✅ Test LEAVE status exclusion',
  '✅ Verify Socket.IO pairing events are emitted',
  '✅ Test pairing adjustments by organizer',
  '✅ Verify fairness scores are calculated correctly',
  '✅ Test odd number of players handling'
];