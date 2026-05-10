# 🔌 Rally Management API - Design Specification

This document provides detailed API specifications for the badminton pairing management application's backend services.

## 📋 API Overview

### Base URL
- **Development**: `http://localhost:3001/api/v1`
- **Production**: `https://api.badmintongroup.com/api/v1`

### Authentication
All API endpoints (except authentication endpoints) require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "timestamp": "2025-08-22T17:33:04.483Z"
}
```

### Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": { ... }
  },
  "timestamp": "2025-08-22T17:33:04.483Z"
}
```

## 🔐 Authentication Endpoints

### 1. User Registration
**POST** `/auth/register`

**Request Body:**
```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "phone": "+86 13800138000",
  "password": "securepassword123",
  "deviceId": "unique-device-identifier"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "张三",
      "email": "zhangsan@example.com",
      "role": "player"
    },
    "tokens": {
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token"
    }
  },
  "message": "User registered successfully"
}
```

### 2. User Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "zhangsan@example.com",
  "password": "securepassword123",
  "deviceId": "unique-device-identifier"
}
```

**Response:** Same as registration

### 3. Refresh Token
**POST** `/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

### 4. Logout
**POST** `/auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

## 🎯 Session Management Endpoints

### 1. Create Session
**POST** `/sessions`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "北京-2025年8月22日-14:00",
  "scheduledAt": "2025-08-22T14:00:00Z",
  "location": "北京朝阳区羽毛球馆",
  "maxPlayers": 20,
  "skillLevel": "中级",
  "cost": 50.00,
  "description": "欢迎各位球友参加"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "name": "北京-2025年8月22日-14:00",
      "ownerId": "uuid",
      "scheduledAt": "2025-08-22T14:00:00Z",
      "location": "北京朝阳区羽毛球馆",
      "maxPlayers": 20,
      "skillLevel": "中级",
      "cost": 50.00,
      "description": "欢迎各位球友参加",
      "status": "active",
      "createdAt": "2025-08-22T17:33:04.483Z"
    }
  }
}
```

### 2. List User Sessions
**GET** `/sessions`

**Query Parameters:**
- `status` (optional): `active`, `completed`, `cancelled`
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid",
        "name": "北京-2025年8月22日-14:00",
        "scheduledAt": "2025-08-22T14:00:00Z",
        "location": "北京朝阳区羽毛球馆",
        "status": "active",
        "playerCount": 12,
        "maxPlayers": 20
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

### 3. Get Session Details
**GET** `/sessions/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "name": "北京-2025年8月22日-14:00",
      "ownerId": "uuid",
      "scheduledAt": "2025-08-22T14:00:00Z",
      "location": "北京朝阳区羽毛球馆",
      "maxPlayers": 20,
      "skillLevel": "中级",
      "cost": 50.00,
      "description": "欢迎各位球友参加",
      "status": "active",
      "courts": [
        {
          "id": "uuid",
          "name": "Court 1",
          "maxPlayers": 4,
          "status": "available"
        }
      ],
      "players": [
        {
          "id": "uuid",
          "name": "张三",
          "status": "active",
          "gamesPlayed": 5,
          "wins": 3,
          "losses": 2
        }
      ],
      "rotationQueue": [
        {
          "userId": "uuid",
          "name": "李四",
          "position": 1,
          "priorityScore": 8
        }
      ]
    }
  }
}
```

### 4. Update Session
**PUT** `/sessions/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```
**Permission:** Session owner only

**Request Body:**
```json
{
  "location": "新地址",
  "maxPlayers": 25,
  "cost": 60.00
}
```

### 5. Delete Session
**DELETE** `/sessions/:id`

**Permission:** Session owner only

## 👥 Player Management Endpoints

### 1. Add Player to Session
**POST** `/sessions/:id/players`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "userId": "uuid", // Optional: if adding existing user
  "name": "王五",   // Required: if inviting new user
  "email": "wangwu@example.com",
  "phone": "+86 13800138001"
}
```

### 2. Remove Player from Session
**DELETE** `/sessions/:id/players/:playerId`

**Permission:** Session owner only

### 3. Update Player Status
**PUT** `/sessions/:id/players/:playerId/status`

**Request Body:**
```json
{
  "status": "resting" // 'active', 'resting', 'left'
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "player": {
      "id": "uuid",
      "name": "张三",
      "status": "resting",
      "updatedAt": "2025-08-22T17:33:04.483Z"
    }
  }
}
```

## 🔄 Rotation System Endpoints

### 1. Get Rotation State
**GET** `/sessions/:id/rotation`

**Response:**
```json
{
  "success": true,
  "data": {
    "rotation": {
      "queue": [
        {
          "userId": "uuid",
          "name": "张三",
          "position": 1,
          "gamesPlayed": 5,
          "priorityScore": 8,
          "shouldRotate": true
        },
        {
          "userId": "uuid",
          "name": "李四",
          "position": 2,
          "gamesPlayed": 4,
          "priorityScore": 6,
          "shouldRotate": false
        }
      ],
      "nextRotation": {
        "playersToRotate": 2,
        "reason": "5人时下2人"
      },
      "fairness": {
        "maxGamesPlayed": 5,
        "minGamesPlayed": 3,
        "difference": 2,
        "isFair": true
      }
    }
  }
}
```

### 2. Trigger Rotation
**POST** `/sessions/:id/rotation/trigger`

**Permission:** Session owner only

**Request Body:**
```json
{
  "forced": false, // Optional: force rotation even if not needed
  "reason": "手动触发轮换" // Optional: reason for rotation
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rotation": {
      "triggeredAt": "2025-08-22T17:33:04.483Z",
      "playersRotated": ["uuid1", "uuid2"],
      "reason": "5人时下2人",
      "newQueue": [/* updated rotation queue */]
    }
  },
  "message": "Rotation completed successfully"
}
```

### 3. Manual Rotation Adjustment
**PUT** `/sessions/:id/rotation/manual`

**Permission:** Session owner only

**Request Body:**
```json
{
  "adjustments": [
    {
      "userId": "uuid1",
      "newPosition": 1
    },
    {
      "userId": "uuid2",
      "newPosition": 2
    }
  ],
  "reason": "手动调整轮换顺序"
}
```

## 🏓 Game Management Endpoints

### 1. Record Game Result
**POST** `/sessions/:id/games`

**Request Body:**
```json
{
  "courtId": "uuid",
  "player1Id": "uuid", // First team player 1
  "player2Id": "uuid", // First team player 2
  "player3Id": "uuid", // Second team player 1
  "player4Id": "uuid", // Second team player 2
  "score": "2-0", // '2-0' or '2-1'
  "winnerTeam": 1, // 1 or 2
  "durationMinutes": 25
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "game": {
      "id": "uuid",
      "sessionId": "uuid",
      "courtId": "uuid",
      "player1Id": "uuid",
      "player2Id": "uuid",
      "player3Id": "uuid",
      "player4Id": "uuid",
      "score": "2-0",
      "winnerTeam": 1,
      "durationMinutes": 25,
      "recordedBy": "uuid",
      "status": "completed",
      "createdAt": "2025-08-22T17:33:04.483Z"
    }
  },
  "message": "Game result recorded successfully"
}
```

### 2. Update Game Result
**PUT** `/sessions/:id/games/:gameId`

**Permission:** Session owner or player who recorded the game

**Request Body:**
```json
{
  "score": "2-1",
  "winnerTeam": 2,
  "durationMinutes": 30
}
```

### 3. Get Session Games
**GET** `/sessions/:id/games`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): `completed`, `disputed`

## 🛋️ Rest Management Endpoints

### 1. Request Rest (歇一下)
**POST** `/sessions/:id/rest/request`

**Request Body:**
```json
{
  "durationMinutes": 15, // Optional: default 15
  "reason": "需要休息一下" // Optional
}
```

### 2. Approve Rest Request
**PUT** `/sessions/:id/rest/:requestId/approve`

**Permission:** Session owner only

### 3. Reject Rest Request
**PUT** `/sessions/:id/rest/:requestId/reject`

**Permission:** Session owner only

**Request Body:**
```json
{
  "reason": "场地紧张，暂时不能休息"
}
```

## 🚪 Leave Management Endpoints

### 1. Request Leave (离场)
**POST** `/sessions/:id/leave/request`

**Request Body:**
```json
{
  "reason": "临时有事，需要离场"
}
```

### 2. Approve Leave Request
**PUT** `/sessions/:id/leave/:requestId/approve`

**Permission:** Session owner only

### 3. Reject Leave Request
**PUT** `/sessions/:id/leave/:requestId/reject`

**Permission:** Session owner only

## 📊 Statistics Endpoints

### 1. Get Session Statistics
**GET** `/sessions/:id/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalGames": 45,
      "totalPlayers": 18,
      "averageGamesPerPlayer": 2.5,
      "totalRotationCount": 12,
      "gamesByCourt": {
        "court1": 15,
        "court2": 12,
        "court3": 18
      },
      "winRateDistribution": {
        "0-25%": 2,
        "25-50%": 8,
        "50-75%": 6,
        "75-100%": 2
      },
      "fairness": {
        "maxGamesPlayed": 5,
        "minGamesPlayed": 3,
        "difference": 2,
        "rating": "excellent" // 'poor', 'good', 'excellent'
      }
    }
  }
}
```

### 2. Get User Statistics
**GET** `/users/:id/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalSessions": 25,
      "totalGames": 67,
      "wins": 38,
      "losses": 29,
      "winRate": 56.7,
      "averageGameDuration": 28,
      "favoritePartners": [
        {
          "userId": "uuid",
          "name": "李四",
          "gamesTogether": 15,
          "winRate": 73.3
        }
      ],
      "restFrequency": {
        "totalRestRequests": 8,
        "approvedRequests": 7,
        "averageDuration": 18
      }
    }
  }
}
```

## 🔧 Utility Endpoints

### 1. Health Check
**GET** `/health`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-08-22T17:33:04.483Z",
    "version": "1.0.0",
    "uptime": 86400
  }
}
```

### 2. Get API Version
**GET** `/version`

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "buildDate": "2025-08-22T17:33:04.483Z",
    "environment": "production"
  }
}
```

## 📋 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## 🔒 Rate Limiting

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/auth/*` | 5 requests | 15 minutes |
| `/sessions` | 100 requests | 1 hour |
| `/sessions/:id/*` | 1000 requests | 1 hour |
| All other endpoints | 100 requests | 1 minute |

## 🛡️ Security Headers

All responses include the following security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

This API design provides a comprehensive foundation for the badminton pairing management application, covering all the core functionality requirements from the PRD while ensuring security, scalability, and maintainability.