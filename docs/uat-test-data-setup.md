# UAT Test Data Setup Guide

## Overview

This guide provides the test data and environment setup required for User Acceptance Testing of the badminton group application MVP.

## Test Environment Requirements

### Hardware Requirements
- **iOS Devices:** iPhone 12 or later (iOS 15+)
- **Android Devices:** Samsung Galaxy S21 or equivalent (Android 11+)
- **Tablets:** iPad Air or Samsung Galaxy Tab S7 (optional)
- **Development Machine:** MacBook Pro with latest Xcode and Android Studio

### Software Requirements
- **App Version:** Latest MVP build (v1.0.0)
- **Backend:** Node.js 18+, Deno 1.30+
- **Database:** PostgreSQL 13+
- **Redis:** v6.2+ for caching
- **WebSocket:** Socket.io for real-time features

### Network Requirements
- **WiFi:** Stable 50+ Mbps connection
- **4G/5G:** Backup connectivity testing
- **VPN:** Optional for security testing

## Test Data Categories

### 1. User Accounts (12 Test Users)

#### Primary Test Users
```json
[
  {
    "id": "user_casual_001",
    "name": "Alex Chen",
    "email": "alex.chen@test.com",
    "skillLevel": "intermediate",
    "persona": "casual_player",
    "gamesPlayed": 45,
    "status": "ACTIVE"
  },
  {
    "id": "user_organizer_001",
    "name": "Jordan Smith",
    "email": "jordan.smith@test.com",
    "skillLevel": "advanced",
    "persona": "regular_organizer",
    "gamesPlayed": 120,
    "status": "ACTIVE",
    "isOrganizer": true
  },
  {
    "id": "user_competitive_001",
    "name": "Taylor Johnson",
    "email": "taylor.johnson@test.com",
    "skillLevel": "advanced",
    "persona": "competitive_player",
    "gamesPlayed": 89,
    "status": "ACTIVE"
  },
  {
    "id": "user_social_001",
    "name": "Morgan Davis",
    "email": "morgan.davis@test.com",
    "skillLevel": "beginner",
    "persona": "social_player",
    "gamesPlayed": 23,
    "status": "ACTIVE"
  }
]
```

#### Additional Test Users (8 more)
- 2 beginner players
- 2 intermediate players
- 2 advanced players
- 1 additional organizer
- 1 inactive user (for edge case testing)

### 2. Session Data (20 Test Sessions)

#### Session Categories

**Casual Sessions (6 sessions)**
```json
{
  "name": "Friday Night Fun",
  "organizerId": "user_organizer_001",
  "location": "Downtown Community Center",
  "coordinates": { "lat": 51.0447, "lng": -114.0719 },
  "scheduledAt": "2025-09-20T18:00:00Z",
  "skillLevel": "intermediate",
  "courtType": "indoor",
  "maxPlayers": 8,
  "currentPlayers": 4,
  "description": "Casual badminton session for all skill levels. Come make new friends and enjoy some games!",
  "relevanceScore": 85
}
```

**Competitive Sessions (4 sessions)**
```json
{
  "name": "Advanced Tournament Prep",
  "organizerId": "user_competitive_001",
  "location": "Sports Complex Court A",
  "coordinates": { "lat": 51.0547, "lng": -114.0819 },
  "scheduledAt": "2025-09-21T14:00:00Z",
  "skillLevel": "advanced",
  "courtType": "indoor",
  "maxPlayers": 6,
  "currentPlayers": 6,
  "description": "Intense training session for advanced players preparing for tournaments.",
  "relevanceScore": 95
}
```

**Beginner Sessions (4 sessions)**
```json
{
  "name": "Beginner Basics",
  "organizerId": "user_social_001",
  "location": "Riverside Park",
  "coordinates": { "lat": 51.0647, "lng": -114.0919 },
  "scheduledAt": "2025-09-22T10:00:00Z",
  "skillLevel": "beginner",
  "courtType": "outdoor",
  "maxPlayers": 10,
  "currentPlayers": 3,
  "description": "Learn badminton basics in a friendly environment. All equipment provided.",
  "relevanceScore": 75
}
```

**Mixed Skill Sessions (6 sessions)**
- 2 morning sessions (9-11 AM)
- 2 afternoon sessions (2-5 PM)
- 2 evening sessions (6-9 PM)
- Mix of indoor/outdoor courts
- Various locations across the city

### 3. Location Data

#### Primary Test Locations
```json
[
  {
    "name": "Downtown Community Center",
    "address": "123 Main St, Downtown",
    "coordinates": { "lat": 51.0447, "lng": -114.0719 },
    "courts": 4,
    "facilities": ["showers", "parking", "equipment_rental"]
  },
  {
    "name": "Riverside Sports Complex",
    "address": "456 River Rd, Riverside",
    "coordinates": { "lat": 51.0547, "lng": -114.0819 },
    "courts": 6,
    "facilities": ["parking", "refreshments", "seating"]
  },
  {
    "name": "Glenmore Athletic Club",
    "address": "789 Glenmore Way, Glenmore",
    "coordinates": { "lat": 51.0647, "lng": -114.0919 },
    "courts": 8,
    "facilities": ["showers", "parking", "equipment_rental", "refreshments"]
  }
]
```

#### Distance Testing Scenarios
- **Close sessions:** 0.5-2 km from test location
- **Medium sessions:** 3-8 km from test location
- **Far sessions:** 10-25 km from test location

## Test Data Setup Scripts

### Backend Test Data Seeding

Create a test data seeding script:

```typescript
// scripts/seed-test-data.ts
import { createClient } from 'https://deno.land/x/postgres/mod.ts';
import { redisClient } from '../backend/src/services/cacheService.ts';

const client = createClient({
  user: 'test_user',
  password: 'test_password',
  database: 'badminton_test',
  hostname: 'localhost',
  port: 5432,
});

async function seedTestData() {
  // Clear existing data
  await client.queryObject('DELETE FROM sessions');
  await client.queryObject('DELETE FROM users');

  // Insert test users
  for (const user of testUsers) {
    await client.queryObject({
      text: 'INSERT INTO users (id, name, email, skill_level, games_played, status) VALUES ($1, $2, $3, $4, $5, $6)',
      args: [user.id, user.name, user.email, user.skillLevel, user.gamesPlayed, user.status]
    });
  }

  // Insert test sessions
  for (const session of testSessions) {
    await client.queryObject({
      text: `INSERT INTO sessions (
        id, name, organizer_id, location, latitude, longitude,
        scheduled_at, skill_level, court_type, max_players,
        current_players, description, relevance_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      args: [
        session.id, session.name, session.organizerId, session.location,
        session.coordinates.lat, session.coordinates.lng, session.scheduledAt,
        session.skillLevel, session.courtType, session.maxPlayers,
        session.currentPlayers, session.description, session.relevanceScore
      ]
    });
  }

  // Cache location data in Redis
  for (const location of testLocations) {
    await redisClient.set(
      `location:${location.name}`,
      JSON.stringify(location),
      { ex: 3600 }
    );
  }

  console.log('Test data seeded successfully');
}

if (import.meta.main) {
  await seedTestData();
  await client.end();
}
```

### Frontend Test Configuration

Create test configuration for the React Native app:

```typescript
// frontend/BadmintonGroup/src/config/testConfig.ts
export const TEST_CONFIG = {
  apiBaseUrl: 'http://localhost:3000/api',
  websocketUrl: 'ws://localhost:3000',
  enableTestMode: true,
  testUserCredentials: {
    casual: { email: 'alex.chen@test.com', password: 'test123' },
    organizer: { email: 'jordan.smith@test.com', password: 'test123' },
    competitive: { email: 'taylor.johnson@test.com', password: 'test123' },
    social: { email: 'morgan.davis@test.com', password: 'test123' }
  },
  mockLocation: {
    latitude: 51.0447,
    longitude: -114.0719,
    accuracy: 10
  }
};
```

## Test Environment Setup Checklist

### Backend Setup
- [ ] Install dependencies: `cd backend && deno install`
- [ ] Set up PostgreSQL database
- [ ] Configure Redis instance
- [ ] Run database migrations
- [ ] Seed test data: `deno run --allow-all scripts/seed-test-data.ts`
- [ ] Start backend server: `deno run --allow-all src/server.ts`
- [ ] Verify API endpoints are responding

### Frontend Setup
- [ ] Install dependencies: `cd frontend/BadmintonGroup && npm install`
- [ ] Configure test environment variables
- [ ] Build development version: `npm run build:dev`
- [ ] Install on test devices
- [ ] Verify app launches and connects to backend

### Testing Tools Setup
- [ ] Set up session recording software (e.g., OBS Studio)
- [ ] Prepare feedback collection forms
- [ ] Configure usability testing platform (optional)
- [ ] Set up screen sharing for remote testing
- [ ] Prepare backup devices and chargers

## Test Scenarios Data Mapping

### Scenario 1: Session Discovery & Joining
**Required Test Data:**
- 8-10 active sessions within 10km radius
- Mix of skill levels and court types
- Sessions at different times (morning, afternoon, evening)
- Some sessions at capacity, some with availability

### Scenario 2: Session Organization
**Required Test Data:**
- 3-4 sessions organized by test organizer
- Sessions in different states (planning, active, completed)
- Mix of player counts and skill levels
- Sessions requiring different configurations

### Scenario 3: Pairing Management
**Required Test Data:**
- Sessions with 6-10 players for meaningful pairings
- Players with different skill levels
- Historical pairing data for fairness testing
- Edge cases (odd number of players, skill gaps)

### Scenario 4: Game Session Experience
**Required Test Data:**
- Active sessions in progress
- Real-time player status updates
- Score tracking data
- Session completion scenarios

## Data Validation Checklist

### User Data Validation
- [ ] All test users have unique IDs and emails
- [ ] Skill levels are correctly assigned
- [ ] User personas are properly tagged
- [ ] Contact information is realistic but fake

### Session Data Validation
- [ ] All sessions have valid coordinates
- [ ] Dates are in the future for active testing
- [ ] Player counts are consistent with max limits
- [ ] Relevance scores reflect actual user preferences

### Location Data Validation
- [ ] Coordinates are accurate for Calgary area
- [ ] Addresses are realistic
- [ ] Facility information is complete
- [ ] Distance calculations work correctly

## Test Data Maintenance

### Daily Refresh
- Reset session statuses and player counts
- Clear cached data if needed
- Verify backend services are running
- Check database connectivity

### Weekly Updates
- Add new test scenarios as needed
- Update session dates to future dates
- Refresh user game counts
- Add new test edge cases

### Issue Response
- Document any data-related issues during testing
- Update test data to prevent recurring issues
- Add new test cases for discovered edge cases
- Maintain issue tracking for data problems

This test data setup ensures comprehensive coverage of all user acceptance testing scenarios while maintaining realistic and consistent test conditions.