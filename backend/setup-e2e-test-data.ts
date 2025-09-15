#!/usr/bin/env tsx

/**
 * E2E Test Data Setup Script
 *
 * Sets up test data for end-to-end testing of the Badminton Group MVP.
 * This script creates sessions, players, and pairings for E2E test scenarios.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestSession {
  id: string;
  name: string;
  location: string;
  maxPlayers: number;
  organizerName: string;
  players: Array<{
    name: string;
    status: 'ACTIVE' | 'RESTING' | 'LEFT';
    gamesPlayed: number;
  }>;
}

const testSessions: TestSession[] = [
  {
    id: 'e2e-session-001',
    name: 'E2E Test Session - Full',
    location: 'Downtown Sports Center',
    maxPlayers: 8,
    organizerName: 'Test Organizer',
    players: [
      { name: 'Alice Johnson', status: 'ACTIVE', gamesPlayed: 0 },
      { name: 'Bob Smith', status: 'ACTIVE', gamesPlayed: 1 },
      { name: 'Charlie Brown', status: 'ACTIVE', gamesPlayed: 2 },
      { name: 'Diana Wilson', status: 'ACTIVE', gamesPlayed: 3 },
      { name: 'Eve Davis', status: 'ACTIVE', gamesPlayed: 1 },
      { name: 'Frank Miller', status: 'ACTIVE', gamesPlayed: 2 },
      { name: 'Grace Lee', status: 'ACTIVE', gamesPlayed: 0 },
      { name: 'Henry Taylor', status: 'ACTIVE', gamesPlayed: 1 }
    ]
  },
  {
    id: 'e2e-session-002',
    name: 'E2E Test Session - Partial',
    location: 'Community Court',
    maxPlayers: 12,
    organizerName: 'Test Organizer 2',
    players: [
      { name: 'Ivy Chen', status: 'ACTIVE', gamesPlayed: 0 },
      { name: 'Jack Rodriguez', status: 'ACTIVE', gamesPlayed: 1 },
      { name: 'Kate Thompson', status: 'ACTIVE', gamesPlayed: 2 },
      { name: 'Liam Garcia', status: 'ACTIVE', gamesPlayed: 3 },
      { name: 'Mia Martinez', status: 'RESTING', gamesPlayed: 2 }
    ]
  },
  {
    id: 'e2e-session-003',
    name: 'E2E Test Session - Empty',
    location: 'Riverside Courts',
    maxPlayers: 16,
    organizerName: 'Test Organizer 3',
    players: []
  }
];

async function generateShareCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function setupTestData() {
  console.log('🧪 Setting up E2E test data...');

  try {
    // Clean up existing test data
    console.log('🧹 Cleaning up existing test data...');
    await prisma.mvpPlayer.deleteMany({
      where: {
        session: {
          shareCode: {
            startsWith: 'E2E'
          }
        }
      }
    });

    await prisma.mvpSession.deleteMany({
      where: {
        shareCode: {
          startsWith: 'E2E'
        }
      }
    });

    // Create test sessions
    console.log('📝 Creating test sessions...');
    for (const sessionData of testSessions) {
      const shareCode = await generateShareCode();

      const session = await prisma.mvpSession.create({
        data: {
          id: sessionData.id,
          name: sessionData.name,
          location: sessionData.location,
          maxPlayers: sessionData.maxPlayers,
          ownerName: sessionData.organizerName,
          shareCode: `E2E${shareCode}`,
          status: 'ACTIVE',
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        }
      });

      console.log(`✅ Created session: ${session.name} (${session.shareCode})`);

      // Create players for this session
      for (const playerData of sessionData.players) {
        const player = await prisma.mvpPlayer.create({
          data: {
            sessionId: session.id,
            name: playerData.name,
            status: playerData.status,
            gamesPlayed: playerData.gamesPlayed,
          }
        });

        console.log(`  👤 Added player: ${player.name} (${player.status})`);
      }
    }

    // Create some additional standalone sessions for discovery testing
    console.log('🔍 Creating discovery test sessions...');
    const locations = [
      'Central Park Courts',
      'Metro Sports Complex',
      'University Gym',
      'City Recreation Center',
      'Private Club Courts'
    ];

    for (let i = 0; i < 5; i++) {
      const shareCode = await generateShareCode();
      const session = await prisma.mvpSession.create({
        data: {
          name: `Discovery Test Session ${i + 1}`,
          location: locations[i],
          maxPlayers: Math.floor(Math.random() * 8) + 4, // 4-12 players
          ownerName: `Organizer ${i + 1}`,
          shareCode: `DISC${shareCode}`,
          status: 'ACTIVE',
          scheduledAt: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000), // Next 7 days
        }
      });

      // Add 2-6 random players
      const playerCount = Math.floor(Math.random() * 5) + 2;
      for (let j = 0; j < playerCount; j++) {
        await prisma.mvpPlayer.create({
          data: {
            sessionId: session.id,
            name: `Player ${j + 1}`,
            status: 'ACTIVE',
            gamesPlayed: Math.floor(Math.random() * 5),
          }
        });
      }

      console.log(`✅ Created discovery session: ${session.name} (${session.shareCode})`);
    }

    console.log('🎉 E2E test data setup complete!');
    console.log('\n📋 Test Data Summary:');
    console.log('- 3 E2E test sessions with various player counts');
    console.log('- 5 Discovery test sessions for location-based testing');
    console.log('- Sessions prefixed with E2E* and DISC* for easy identification');
    console.log('\n🚀 Ready for E2E testing!');

  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupTestData();
}

export { setupTestData };