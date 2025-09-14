#!/usr/bin/env ts-node

/**
 * Simple Test Runner for Backend Services
 * Run with: npx ts-node test-runner.ts
 */

import { runTests as runStatisticsTests } from './src/services/__tests__/statisticsService.test';

async function runAllTests() {
  console.log('🚀 Running Backend Test Suite...\n');

  try {
    // Run Statistics Service Tests
    console.log('📊 Running Statistics Service Tests...');
    await runStatisticsTests();
    console.log('✅ Statistics Service Tests Completed\n');

    // Add more test suites here as they are created
    // await runRankingTests();
    // await runMatchTests();
    // await runApiTests();

    console.log('🎉 All Backend Tests Completed Successfully!');

  } catch (error) {
    console.error('❌ Test Suite Failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { runAllTests };