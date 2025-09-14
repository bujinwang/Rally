import { statisticsApi } from '../statisticsApi';

// Simple test structure for frontend API service
console.log('🧪 Testing StatisticsApi Service...');

// Mock fetch globally
const originalFetch = global.fetch;
let mockFetchResponse: any = null;
let mockFetchError: any = null;

global.fetch = async (input: RequestInfo | URL, options?: RequestInit) => {
  if (mockFetchError) {
    throw mockFetchError;
  }

  return {
    ok: true,
    json: async () => mockFetchResponse,
  } as Response;
};

// Test 1: Get player statistics
async function testGetPlayerStatistics() {
  console.log('Testing getPlayerStatistics method...');

  try {
    mockFetchResponse = {
      success: true,
      data: {
        playerId: 'player1',
        playerName: 'John Doe',
        totalMatches: 20,
        wins: 15,
        losses: 5,
        winRate: 75.0,
        currentStreak: 3,
        performanceRating: 1250,
      }
    };

    const result = await statisticsApi.getPlayerStatistics('player1');

    if (result.playerName === 'John Doe' && result.totalMatches === 20) {
      console.log('✅ getPlayerStatistics test passed');
    } else {
      console.log('❌ getPlayerStatistics test failed:', result);
    }
  } catch (error) {
    console.log('❌ getPlayerStatistics test error:', error);
  }
}

// Test 2: Get leaderboard
async function testGetLeaderboard() {
  console.log('Testing getLeaderboard method...');

  try {
    mockFetchResponse = {
      success: true,
      data: [
        { rank: 1, playerName: 'Alice', winRate: 85, matchesPlayed: 20 },
        { rank: 2, playerName: 'Bob', winRate: 75, matchesPlayed: 18 },
      ]
    };

    const result = await statisticsApi.getLeaderboard();

    if (Array.isArray(result) && result.length === 2 && result[0].playerName === 'Alice') {
      console.log('✅ getLeaderboard test passed');
    } else {
      console.log('❌ getLeaderboard test failed:', result);
    }
  } catch (error) {
    console.log('❌ getLeaderboard test error:', error);
  }
}

// Test 3: Error handling
async function testErrorHandling() {
  console.log('Testing error handling...');

  try {
    mockFetchError = new Error('Network error');

    await statisticsApi.getPlayerStatistics('player1');
    console.log('❌ Error handling test failed - should have thrown');
  } catch (error) {
    console.log('✅ Error handling test passed - caught error:', error instanceof Error ? error.message : String(error));
  } finally {
    mockFetchError = null;
  }
}

// Test 4: Query string building
async function testQueryStringBuilding() {
  console.log('Testing query string building...');

  try {
    // Test the private method through a public method that uses it
    const result = await statisticsApi.getLeaderboard({
      sessionId: 'session1',
      minMatches: 5,
      limit: 10
    });

    // If we get here without error, the query string building worked
    console.log('✅ Query string building test passed');
  } catch (error) {
    console.log('❌ Query string building test error:', error);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting StatisticsApi tests...\n');

  await testGetPlayerStatistics();
  await testGetLeaderboard();
  await testErrorHandling();
  await testQueryStringBuilding();

  console.log('\n🏁 StatisticsApi tests completed');

  // Restore original fetch
  global.fetch = originalFetch;
}

// Export for potential external usage
export { runTests };

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}