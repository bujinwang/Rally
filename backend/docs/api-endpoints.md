# MVP API Endpoints Documentation

## Overview

This document describes the REST API endpoints for the Badminton Group MVP application. All endpoints return JSON responses with a consistent format.

## Response Format

All API responses follow this structure:

```json
{
  "success": boolean,
  "data": object | null,
  "message": string,
  "timestamp": string
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": string,
    "message": string,
    "details": array (optional)
  },
  "timestamp": string
}
```

## Authentication

Currently, no authentication is required for MVP. All endpoints are public.

## Sessions API

### Create Session

**POST** `/api/sessions`

Creates a new badminton session.

**Request Body:**
```json
{
  "name": "string (required)",
  "scheduledAt": "ISO8601 date string (required)",
  "location": "string (optional)",
  "maxPlayers": "number (optional, default: 20)",
  "ownerName": "string (required)",
  "ownerDeviceId": "string (optional)",
  "skillLevel": "string (optional)",
  "cost": "number (optional)",
  "description": "string (optional)",
  "courtCount": "number (optional, default: 1)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "string",
      "name": "string",
      "shareCode": "string",
      "scheduledAt": "ISO8601 date",
      "location": "string",
      "maxPlayers": "number",
      "status": "ACTIVE",
      "ownerName": "string",
      "playerCount": "number",
      "players": "array",
      "shareUrl": "string",
      "createdAt": "ISO8601 date"
    }
  },
  "message": "Session created successfully",
  "timestamp": "ISO8601 date"
}
```

### Get All Active Sessions

**GET** `/api/sessions`

Retrieves all active sessions with optional pagination.

**Query Parameters:**
- `status`: Filter by status (default: ACTIVE)
- `limit`: Number of results (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "string",
        "name": "string",
        "shareCode": "string",
        "scheduledAt": "ISO8601 date",
        "location": "string",
        "maxPlayers": "number",
        "skillLevel": "string",
        "cost": "number",
        "description": "string",
        "ownerName": "string",
        "status": "ACTIVE",
        "playerCount": "number",
        "players": "array",
        "createdAt": "ISO8601 date"
      }
    ]
  },
  "message": "Retrieved X session(s)",
  "timestamp": "ISO8601 date"
}
```

### Get Session by Share Code

**GET** `/api/sessions/:shareCode`

Retrieves a specific session by its share code.

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "string",
      "name": "string",
      "shareCode": "string",
      "scheduledAt": "ISO8601 date",
      "location": "string",
      "maxPlayers": "number",
      "courtCount": "number",
      "skillLevel": "string",
      "cost": "number",
      "description": "string",
      "ownerName": "string",
      "ownerDeviceId": "string",
      "status": "ACTIVE",
      "playerCount": "number",
      "players": "array",
      "games": "array",
      "matches": "array",
      "createdAt": "ISO8601 date",
      "updatedAt": "ISO8601 date"
    }
  },
  "message": "Session retrieved successfully",
  "timestamp": "ISO8601 date"
}
```

### Update Session

**PUT** `/api/sessions/:shareCode`

Updates session details (owner only).

**Request Body:**
```json
{
  "ownerDeviceId": "string (required for authorization)",
  "courtCount": "number (optional)",
  "maxPlayers": "number (optional)",
  "location": "string (optional)",
  "description": "string (optional)",
  "skillLevel": "string (optional)",
  "cost": "number (optional)"
}
```

### Terminate Session

**PUT** `/api/sessions/terminate/:shareCode`

Terminates a session (owner only).

**Request Body:**
```json
{
  "ownerDeviceId": "string (required)"
}
```

### Reactivate Session

**PUT** `/api/sessions/reactivate/:shareCode`

Reactivates a terminated session (owner only).

**Request Body:**
```json
{
  "ownerDeviceId": "string (required)"
}
```

## Players API

### Join Session

**POST** `/api/sessions/join/:shareCode`

Adds a player to a session.

**Request Body:**
```json
{
  "name": "string (required)",
  "deviceId": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "player": {
      "id": "string",
      "name": "string",
      "status": "ACTIVE",
      "joinedAt": "ISO8601 date"
    }
  },
  "message": "Successfully joined session",
  "timestamp": "ISO8601 date"
}
```

### Update Player Status

**PUT** `/api/sessions/players/:playerId/status`

Updates a player's status.

**Request Body:**
```json
{
  "status": "ACTIVE | RESTING | LEFT",
  "reason": "string (optional)"
}
```

### Remove Player

**DELETE** `/api/sessions/:shareCode/players/:playerId`

Removes a player from session (owner only).

**Request Body:**
```json
{
  "deviceId": "string (owner device ID)"
}
```

### Add Player by Organizer

**POST** `/api/sessions/:shareCode/add-player`

Adds a player to session (owner only).

**Request Body:**
```json
{
  "playerName": "string (required)",
  "deviceId": "string (owner device ID)"
}
```

### Manage Player Rest

**PUT** `/api/sessions/:shareCode/players/:playerId/rest`

Manages player rest status.

**Request Body:**
```json
{
  "gamesCount": "number (0 to remove rest, 1-5 for rest)",
  "requestedBy": "string",
  "deviceId": "string (optional)"
}
```

### Get Player Status

**GET** `/api/sessions/:shareCode/players/me/:deviceId`

Gets player's own status in session.

### Get Rest Status

**GET** `/api/sessions/:shareCode/rest-status`

Gets rest status for all players in session.

## Games API

### Create Game

**POST** `/api/sessions/:shareCode/games`

Creates a new game in session.

**Request Body:**
```json
{
  "team1Player1": "string",
  "team1Player2": "string",
  "team2Player1": "string",
  "team2Player2": "string",
  "courtName": "string (optional)"
}
```

### Update Game Score

**PUT** `/api/sessions/:shareCode/games/:gameId/score`

Updates game score and completes game.

**Request Body:**
```json
{
  "team1FinalScore": "number (0-2)",
  "team2FinalScore": "number (0-2)"
}
```

### Update Game Teams

**PUT** `/api/sessions/:shareCode/games/:gameId/teams`

Updates teams during live game.

**Request Body:**
```json
{
  "team1Player1": "string",
  "team1Player2": "string",
  "team2Player1": "string",
  "team2Player2": "string"
}
```

## Matches API

### Create Match

**POST** `/api/sessions/:shareCode/matches`

Creates a new match.

**Request Body:**
```json
{
  "team1Player1": "string",
  "team1Player2": "string",
  "team2Player1": "string",
  "team2Player2": "string",
  "courtName": "string (optional)",
  "bestOf": "number (3 or 5, default: 3)"
}
```

### Create Game in Match

**POST** `/api/sessions/:shareCode/matches/:matchId/games`

Creates a new game within a match.

### Update Match Game Score

**PUT** `/api/sessions/:shareCode/matches/:matchId/games/:gameId/score`

Updates game score within a match.

**Request Body:**
```json
{
  "team1FinalScore": "number (0-2)",
  "team2FinalScore": "number (0-2)"
}
```

### Get Match Details

**GET** `/api/sessions/:shareCode/matches/:matchId`

Gets match details with all games.

## Statistics API

### Get Player Statistics

**GET** `/api/sessions/:shareCode/players/:playerName/stats`

Gets comprehensive statistics for a player.

### Get Session Statistics

**GET** `/api/sessions/:shareCode/statistics`

Gets overall session statistics.

### Get Session Leaderboard

**GET** `/api/sessions/:shareCode/leaderboard`

Gets session leaderboard.

## Rotation API

### Get Optimal Rotation

**GET** `/api/sessions/:shareCode/rotation`

Calculates optimal player rotation for next games.

## Error Codes

- `VALIDATION_ERROR`: Invalid input data
- `SESSION_NOT_FOUND`: Session doesn't exist
- `SESSION_INACTIVE`: Session is not active
- `SESSION_FULL`: Session has reached max players
- `NAME_EXISTS`: Player name already exists in session
- `PLAYER_NOT_FOUND`: Player doesn't exist
- `FORBIDDEN`: Unauthorized operation
- `PLAYER_IN_ACTIVE_GAME`: Cannot perform action while in active game
- `INVALID_STATUS`: Invalid status value
- `INTERNAL_ERROR`: Server error

## Rate Limiting

All endpoints are rate limited to prevent abuse:
- General endpoints: 100 requests per minute
- Session creation: 10 requests per minute per device
- Game operations: 60 requests per minute

## Data Validation

- All string inputs are trimmed and validated for length
- Dates must be valid ISO8601 format
- Numeric inputs are validated for range
- Player names are checked for uniqueness within sessions
- Foreign key relationships are enforced

## Performance Considerations

- Database queries are optimized with proper indexing
- Pagination is implemented for list endpoints
- Real-time updates use Socket.IO for efficiency
- Caching is implemented for frequently accessed data
- Connection pooling is configured for database operations