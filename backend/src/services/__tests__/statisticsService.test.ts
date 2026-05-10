import { statisticsService } from '../statisticsService';

// Simple test structure without Jest dependencies
console.log('🧪 Testing StatisticsService...');

// Test 1: Basic functionality test
async function testCalculateStreaks() {
  console.log('Testing calculateStreaks method...');

  try {
    // Test with winning streak
    const matches = [
      { winnerId: 'player1', createdAt: new Date() },
      { winnerId: 'player1', createdAt: new Date() },
      { winnerId: 'player2', createdAt: new Date() },
    ];

    // Access private method through type assertion
    const result = (statisticsService as any).calculateStreaks(matches, 'player1');

    if (result.currentStreak === 2 && result.winStreak === 2) {
      console.log('✅ calculateStreaks test passed');
    } else {
      console.log('❌ calculateStreaks test failed:', result);
    }
  } catch (error) {
    console.log('❌ calculateStreaks test error:', error);
  }
}

// Test 2: Performance rating calculation
async function testCalculatePerformanceRating() {
  console.log('Testing calculatePerformanceRating method...');

  try {
    const result = (statisticsService as any).calculatePerformanceRating(75, 20, 3);

    if (typeof result === 'number' && result > 1000) {
      console.log('✅ calculatePerformanceRating test passed');
    } else {
      console.log('❌ calculatePerformanceRating test failed:', result);
    }
  } catch (error) {
    console.log('❌ calculatePerformanceRating test error:', error);
  }
}

// Test 3: Trend calculation
async function testCalculateTrend() {
  console.log('Testing calculateTrend method...');

  try {
    const result = (statisticsService as any).calculateTrend(['W', 'W', 'L', 'W', 'W']);

    if (result === 'up') {
      console.log('✅ calculateTrend test passed');
    } else {
      console.log('❌ calculateTrend test failed:', result);
    }
  } catch (error) {
    console.log('❌ calculateTrend test error:', error);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting StatisticsService tests...\n');

  await testCalculateStreaks();
  await testCalculatePerformanceRating();
  await testCalculateTrend();

  console.log('\n🏁 StatisticsService tests completed');
}

// Export for potential external usage
export { runTests };

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}
describe("StatisticsService", () => {
  it("should be importable", () => {
    expect(statisticsService).toBeDefined();
  });
});
