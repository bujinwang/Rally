#!/usr/bin/env ts-node

/**
 * Database Optimization Script for Badminton Statistics System
 * Run with: npx ts-node scripts/optimize-database.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function optimizeDatabase() {
  console.log('🔧 Starting Database Optimization...\n');

  try {
    // 1. Analyze current database performance
    console.log('📊 Analyzing current database performance...');
    await analyzeTableSizes();
    await analyzeQueryPerformance();

    // 2. Create performance indexes
    console.log('📈 Creating performance indexes...');
    await createPerformanceIndexes();

    // 3. Optimize table structures
    console.log('🔄 Optimizing table structures...');
    await optimizeTableStructures();

    // 4. Clean up old data
    console.log('🧹 Cleaning up old data...');
    await cleanupOldData();

    // 5. Update statistics
    console.log('📊 Updating database statistics...');
    await updateStatistics();

    console.log('✅ Database optimization completed successfully!');

  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function analyzeTableSizes() {
  console.log('Analyzing table sizes...');

  try {
    // Get row counts for main tables
    const tables = [
      'MvpPlayer',
      'MvpMatch',
      'MvpSession',
      'PlayerRankingHistory'
    ];

    for (const table of tables) {
      const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM ${table}`;
      console.log(`  ${table}: ${count} rows`);
    }
  } catch (error) {
    console.log('  ⚠️ Could not analyze table sizes:', error);
  }
}

async function analyzeQueryPerformance() {
  console.log('Analyzing query performance...');

  try {
    // Test common query performance
    const startTime = Date.now();

    // Test leaderboard query
    await prisma.mvpPlayer.findMany({
      take: 50,
      orderBy: { winRate: 'desc' }
    });

    const leaderboardTime = Date.now() - startTime;
    console.log(`  Leaderboard query: ${leaderboardTime}ms`);

    // Test player statistics query
    const playerStartTime = Date.now();
    const player = await prisma.mvpPlayer.findFirst();
    if (player) {
      await prisma.mvpMatch.findMany({
        where: {
          OR: [
            { team1Player1: player.id },
            { team1Player2: player.id },
            { team2Player1: player.id },
            { team2Player2: player.id }
          ]
        },
        take: 20
      });
    }

    const playerStatsTime = Date.now() - playerStartTime;
    console.log(`  Player stats query: ${playerStatsTime}ms`);

  } catch (error) {
    console.log('  ⚠️ Could not analyze query performance:', error);
  }
}

async function createPerformanceIndexes() {
  console.log('Creating performance indexes...');

  try {
    // Index for leaderboard queries
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_player_win_rate ON MvpPlayer (winRate DESC, matchesPlayed DESC);
    `;

    // Index for ranking queries
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_player_ranking ON MvpPlayer (ranking DESC, rankingPoints DESC);
    `;

    // Index for match queries by session
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_match_session ON MvpMatch (sessionId, createdAt DESC);
    `;

    // Index for match queries by player
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_match_players ON MvpMatch (team1Player1, team1Player2, team2Player1, team2Player2);
    `;

    // Index for ranking history
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_ranking_history_player ON PlayerRankingHistory (playerId, recordedAt DESC);
    `;

    console.log('  ✅ Performance indexes created');

  } catch (error) {
    console.log('  ⚠️ Could not create some indexes:', error);
  }
}

async function optimizeTableStructures() {
  console.log('Optimizing table structures...');

  try {
    // Analyze and optimize MvpPlayer table
    await prisma.$executeRaw`
      ANALYZE MvpPlayer;
    `;

    // Analyze and optimize MvpMatch table
    await prisma.$executeRaw`
      ANALYZE MvpMatch;
    `;

    // Analyze and optimize ranking history
    await prisma.$executeRaw`
      ANALYZE PlayerRankingHistory;
    `;

    console.log('  ✅ Table structures optimized');

  } catch (error) {
    console.log('  ⚠️ Could not optimize table structures:', error);
  }
}

async function cleanupOldData() {
  console.log('Cleaning up old data...');

  try {
    // Remove ranking history older than 1 year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const deletedHistory = await prisma.playerRankingHistory.deleteMany({
      where: {
        recordedAt: {
          lt: oneYearAgo
        }
      }
    });

    console.log(`  🗑️ Deleted ${deletedHistory.count} old ranking history records`);

    // Remove completed matches older than 2 years
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const deletedMatches = await prisma.mvpMatch.deleteMany({
      where: {
        createdAt: {
          lt: twoYearsAgo
        },
        status: 'COMPLETED'
      }
    });

    console.log(`  🗑️ Deleted ${deletedMatches.count} old completed matches`);

  } catch (error) {
    console.log('  ⚠️ Could not clean up old data:', error);
  }
}

async function updateStatistics() {
  console.log('Updating database statistics...');

  try {
    // Update table statistics
    await prisma.$executeRaw`VACUUM ANALYZE;`;

    console.log('  ✅ Database statistics updated');

  } catch (error) {
    console.log('  ⚠️ Could not update statistics:', error);
  }
}

// Performance recommendations
function printRecommendations() {
  console.log('\n📋 Performance Recommendations:');
  console.log('1. Monitor query performance regularly');
  console.log('2. Consider partitioning large tables if growth continues');
  console.log('3. Implement connection pooling for high traffic');
  console.log('4. Use Redis caching for frequently accessed data');
  console.log('5. Schedule regular maintenance (weekly VACUUM ANALYZE)');
  console.log('6. Monitor index usage and remove unused indexes');
}

// Run optimization if this file is executed directly
if (require.main === module) {
  optimizeDatabase()
    .then(() => {
      printRecommendations();
    })
    .catch(console.error);
}

export { optimizeDatabase };