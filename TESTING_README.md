# BadmintonGroup MVP - Comprehensive Testing Suite

## Overview

This document outlines the comprehensive testing strategy implemented for the BadmintonGroup MVP, covering backend services, frontend components, real-time functionality, caching, performance monitoring, and integration scenarios.

## Test Structure

### Backend Testing (`/backend/src/`)

#### API Route Tests (`/routes/__tests__/`)
- **discovery.test.ts**: Discovery API endpoint testing
  - Session discovery with filters
  - Location-based search
  - Real-time event handling
  - Caching behavior
  - Error scenarios

#### Service Tests (`/services/__tests__/`)
- **cacheService.test.ts**: Caching service functionality
  - In-memory caching operations
  - LRU eviction under memory pressure
  - TTL management
  - Cache statistics and monitoring

- **performanceService.test.ts**: Performance monitoring
  - Query performance tracking
  - Cache hit rate analysis
  - Memory usage monitoring
  - Health check system

### Frontend Testing (`/frontend/BadmintonGroup/src/`)

#### Service Tests (`/services/__tests__/`)
- **discoveryApi.test.ts**: Frontend discovery API
  - HTTP request handling
  - Real-time socket events
  - Event listener management
  - Error handling and recovery

## Test Categories

### 1. Unit Tests
- Individual function/component testing
- Mock external dependencies
- Fast execution, isolated scope

### 2. Integration Tests
- Multiple components working together
- API endpoint testing
- Database integration

### 3. Real-time Tests
- Socket.IO event handling
- Real-time UI updates
- Connection management

### 4. Performance Tests
- Response time validation
- Memory usage monitoring
- Cache efficiency testing

### 5. Error Handling Tests
- Network failure scenarios
- Invalid input validation
- Graceful degradation

## Key Test Scenarios

### Discovery Functionality
```typescript
// Example test scenario
{
  description: 'Should filter sessions by location proximity',
  setup: {
    userLocation: { latitude: 40.7829, longitude: -73.9654 },
    radius: 5,
    sessions: [
      { location: 'Central Park', distance: 0 },
      { location: 'Times Square', distance: 2.8 },
      { location: 'Brooklyn', distance: 11.2 }
    ]
  },
  expected: {
    filteredSessions: 2, // Within 5km radius
    sortedByDistance: true
  }
}
```

### Real-time Updates
```typescript
// Real-time event testing
{
  description: 'Should handle session creation events',
  socketEvent: 'discovery:session-created',
  eventData: {
    session: { id: 'new-session', name: 'Evening Badminton' },
    timestamp: '2025-01-15T18:00:00Z'
  },
  expected: {
    uiUpdated: true,
    sessionAdded: true,
    notificationShown: true
  }
}
```

### Caching Performance
```typescript
// Cache efficiency testing
{
  description: 'Should demonstrate caching performance improvement',
  setup: {
    cacheEnabled: true,
    requests: 100,
    uniqueFilters: 10
  },
  expected: {
    cacheHitRate: '> 80%',
    responseTimeImprovement: '> 50%',
    memoryUsage: '< 50MB'
  }
}
```

## Running Tests

### Backend Tests
```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test discovery.test.ts

# Run in watch mode
npm run test:watch
```

### Frontend Tests
```bash
cd frontend/BadmintonGroup

# Run React Native tests (if configured)
npm test

# Run with coverage
npm run test:coverage
```

## Test Configuration

### Jest Configuration (`backend/jest.config.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts'
  ]
};
```

### Test Setup (`backend/src/__tests__/setup.ts`)
```typescript
// Global test setup
beforeAll(async () => {
  // Database setup, mock initialization
});

afterAll(async () => {
  // Cleanup resources
});

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
```

## Mock Strategy

### External Dependencies
- **Database**: Mock Prisma client for unit tests
- **Socket.IO**: Mock socket connections for real-time tests
- **HTTP Requests**: Mock fetch API for frontend tests
- **File System**: Mock file operations
- **Timers**: Mock setTimeout/setInterval for time-based tests

### Example Mock Setup
```typescript
// Mock Socket.IO
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

// Mock fetch API
global.fetch = jest.fn();
```

## Performance Benchmarks

### Target Metrics
- **API Response Time**: < 200ms (p95)
- **Cache Hit Rate**: > 80%
- **Memory Usage**: < 256MB under load
- **Error Rate**: < 1%
- **Real-time Latency**: < 100ms

### Load Testing Scenarios
```typescript
// Concurrent user simulation
{
  users: 500,
  duration: '5 minutes',
  operations: ['discovery', 'session_join', 'real_time_updates'],
  expected: {
    responseTime: '< 500ms p95',
    errorRate: '< 1%',
    throughput: '> 100 req/sec'
  }
}
```

## Test Data Management

### Test Database Setup
```typescript
// Test data factory
const createTestSession = (overrides = {}) => ({
  id: `test-session-${Date.now()}`,
  name: 'Test Session',
  shareCode: 'TEST123',
  scheduledAt: new Date(),
  location: 'Test Location',
  maxPlayers: 16,
  skillLevel: 'INTERMEDIATE',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  ...overrides
});
```

### Cleanup Strategy
```typescript
// After each test
afterEach(async () => {
  await prisma.mvpSession.deleteMany({
    where: { id: { startsWith: 'test-' } }
  });
  await prisma.mvpPlayer.deleteMany({
    where: { deviceId: { startsWith: 'test-' } }
  });
});
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Coverage Goals

### Backend Coverage Targets
- **API Routes**: > 90%
- **Services**: > 85%
- **Utilities**: > 95%
- **Error Handling**: > 90%

### Frontend Coverage Targets
- **Components**: > 80%
- **Services**: > 90%
- **Hooks**: > 85%
- **Utils**: > 95%

## Debugging Test Failures

### Common Issues
1. **Database Connection**: Ensure test database is available
2. **Mock Setup**: Verify mocks are properly configured
3. **Async Operations**: Check for proper await usage
4. **Cleanup**: Ensure test data is properly cleaned up

### Debugging Commands
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test with debugging
npm test -- --inspect-brk discovery.test.ts

# Run tests with coverage details
npm run test:coverage -- --testNamePattern="should filter by skill level"
```

## Future Test Enhancements

### Planned Additions
- **E2E Tests**: Full user journey testing with Cypress/Playwright
- **Visual Regression**: Screenshot comparison for UI changes
- **Load Testing**: k6 scripts for performance validation
- **Accessibility Testing**: axe-core integration
- **Contract Testing**: API contract validation

### Test Automation
- **Test Generation**: AI-powered test case generation
- **Mutation Testing**: Code mutation analysis
- **Property-based Testing**: Generate test cases from properties
- **Chaos Engineering**: Simulate system failures

## Contributing to Tests

### Test Writing Guidelines
1. **Descriptive Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow AAA pattern
3. **Independent Tests**: Each test should be self-contained
4. **Fast Execution**: Keep tests fast and reliable
5. **Good Coverage**: Aim for meaningful coverage, not just lines

### Example Test Structure
```typescript
describe('Discovery API', () => {
  describe('GET /sessions/discovery', () => {
    it('should return sessions with filters applied', async () => {
      // Arrange
      const filters = { skillLevel: 'BEGINNER' };

      // Act
      const result = await discoveryApi.discoverSessions(filters);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.sessions).toBeDefined();
      expect(result.data.sessions.length).toBeGreaterThan(0);
    });
  });
});
```

This comprehensive testing suite ensures the BadmintonGroup MVP maintains high quality, performance, and reliability across all implemented features.