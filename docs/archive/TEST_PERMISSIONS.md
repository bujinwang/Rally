# Permission System Test Script

## Prerequisites
- Backend server running on `http://localhost:3001`
- A test session created with a known shareCode

## Test Scenario Setup

### Step 1: Create a Test Session

```bash
# Create a session and save the response
curl -X POST http://localhost:3001/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Permission Test Session",
    "dateTime": "2025-02-01T10:00:00Z",
    "location": "Test Court",
    "maxPlayers": 10,
    "organizerName": "Alice",
    "ownerDeviceId": "device-alice-123"
  }' | jq .

# Save the shareCode and organizerCode from the response
# Example: shareCode = "ABC123", organizerCode = "XYZ789"
```

### Step 2: Join as Second Player

```bash
# Join as Bob (non-organizer)
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob",
    "deviceId": "device-bob-456"
  }' | jq .
```

## Permission Tests

### Test 1: Organizer Can Update Session ✅

```bash
# Alice (organizer) updates court count
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-alice-123",
    "courtCount": 3
  }' | jq .

# Expected: 200 OK with updated session
```

### Test 2: Player Cannot Update Session ❌

```bash
# Bob (player) tries to update court count
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-bob-456",
    "courtCount": 5
  }' | jq .

# Expected: 403 Forbidden
# {
#   "success": false,
#   "error": {
#     "code": "FORBIDDEN",
#     "message": "Only the session owner can update the session"
#   }
# }
```

### Test 3: Organizer Can Remove Player ✅

```bash
# Alice removes Bob
# First, get Bob's player ID from the session
curl -X GET http://localhost:3001/api/v1/mvp-sessions/ABC123 | jq '.data.session.players[] | select(.name=="Bob") | .id'

# Then remove Bob
curl -X DELETE http://localhost:3001/api/v1/mvp-sessions/ABC123/players/BOB_PLAYER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-alice-123"
  }' | jq .

# Expected: 200 OK
```

### Test 4: Player Cannot Remove Others ❌

```bash
# Re-add Bob
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob",
    "deviceId": "device-bob-456"
  }' | jq .

# Add Charlie
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Charlie",
    "deviceId": "device-charlie-789"
  }' | jq .

# Bob tries to remove Charlie
curl -X DELETE http://localhost:3001/api/v1/mvp-sessions/ABC123/players/CHARLIE_PLAYER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-bob-456"
  }' | jq .

# Expected: 403 Forbidden
```

### Test 5: Organizer Can Add Player ✅

```bash
# Alice adds David manually
curl -X POST http://localhost:3001/api/v1/mvp-sessions/ABC123/add-player \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "David",
    "deviceId": "device-alice-123"
  }' | jq .

# Expected: 201 Created with player info
```

### Test 6: Player Cannot Add Player ❌

```bash
# Bob tries to add Eve
curl -X POST http://localhost:3001/api/v1/mvp-sessions/ABC123/add-player \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Eve",
    "deviceId": "device-bob-456"
  }' | jq .

# Expected: 403 Forbidden
```

### Test 7: Organizer Can Create Game ✅

```bash
# Alice creates a game
curl -X POST http://localhost:3001/api/v1/mvp-sessions/ABC123/games \
  -H "Content-Type: application/json" \
  -d '{
    "team1Player1": "Alice",
    "team1Player2": "Bob",
    "team2Player1": "Charlie",
    "team2Player2": "David",
    "courtName": "Court 1"
  }' | jq .

# Expected: 201 Created with game info
```

### Test 8: Player Cannot Create Game ❌

```bash
# Bob tries to create a game
curl -X POST http://localhost:3001/api/v1/mvp-sessions/ABC123/games \
  -H "Content-Type: application/json" \
  -d '{
    "team1Player1": "Bob",
    "team1Player2": "Charlie",
    "team2Player1": "Alice",
    "team2Player2": "David",
    "courtName": "Court 2"
  }' | jq .

# Expected: 403 Forbidden (after permission check added)
```

### Test 9: Player Can Update Own Status ✅

```bash
# Get Bob's player ID
BOB_ID=$(curl -s http://localhost:3001/api/v1/mvp-sessions/ABC123 | jq -r '.data.session.players[] | select(.name=="Bob") | .id')

# Bob updates his own status to RESTING
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/ABC123/players/$BOB_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "RESTING",
    "deviceId": "device-bob-456"
  }' | jq .

# Expected: 200 OK
```

### Test 10: Player Cannot Update Others' Status ❌

```bash
# Get Charlie's player ID
CHARLIE_ID=$(curl -s http://localhost:3001/api/v1/mvp-sessions/ABC123 | jq -r '.data.session.players[] | select(.name=="Charlie") | .id')

# Bob tries to update Charlie's status
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/ABC123/players/$CHARLIE_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "LEFT",
    "deviceId": "device-bob-456"
  }' | jq .

# Expected: 403 Forbidden
```

### Test 11: Organizer Can Update Any Player Status ✅

```bash
# Alice updates Charlie's status
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/ABC123/players/$CHARLIE_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ACTIVE",
    "deviceId": "device-alice-123"
  }' | jq .

# Expected: 200 OK
```

### Test 12: Organizer Can Terminate Session ✅

```bash
# Alice terminates the session
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/terminate/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-alice-123"
  }' | jq .

# Expected: 200 OK with status CANCELLED
```

### Test 13: Player Cannot Terminate Session ❌

```bash
# Create a new session for this test
curl -X POST http://localhost:3001/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Session 2",
    "dateTime": "2025-02-01T12:00:00Z",
    "location": "Test Court",
    "organizerName": "Alice",
    "ownerDeviceId": "device-alice-123"
  }' | jq .

# Get new shareCode (e.g., DEF456)

# Bob joins
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob",
    "deviceId": "device-bob-456"
  }' | jq .

# Bob tries to terminate
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/terminate/DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-bob-456"
  }' | jq .

# Expected: 403 Forbidden
```

## Rate Limiting Tests

### Test 14: Rate Limiting on Sensitive Operations ⏱️

```bash
# Try to update session 15 times in 1 minute (limit is 10/min)
for i in {1..15}; do
  echo "Request $i:"
  curl -X PUT http://localhost:3001/api/v1/mvp-sessions/DEF456 \
    -H "Content-Type: application/json" \
    -d '{
      "ownerDeviceId": "device-alice-123",
      "courtCount": '$i'
    }' | jq '.success, .error.code'
  sleep 1
done

# Expected: First 10 succeed, requests 11-15 return 429 RATE_LIMIT_EXCEEDED
```

### Test 15: Rate Limiting Headers

```bash
# Check rate limit headers
curl -v -X PUT http://localhost:3001/api/v1/mvp-sessions/DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-alice-123",
    "courtCount": 2
  }' 2>&1 | grep -i "x-ratelimit"

# Expected headers:
# X-RateLimit-Limit: 10
# X-RateLimit-Remaining: 9
# X-RateLimit-Reset: <timestamp>
```

## Audit Log Verification

### Test 16: Check Audit Logs in Console

```bash
# Perform organizer actions and check server console for audit logs

# Update session
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-alice-123",
    "courtCount": 3
  }' | jq .

# Check server console output for:
# 🔒 AUDIT LOG: {
#   "action": "PERMISSION_CHECK_EDIT_SESSION",
#   "actorId": "...",
#   "actorName": "Alice",
#   "sessionId": "...",
#   "metadata": { "action": "edit_session", "granted": true },
#   "ipAddress": "...",
#   "userAgent": "curl/...",
#   "timestamp": "..."
# }
```

## Summary of Expected Results

| Test | Description | Expected Status | Expected Response |
|------|-------------|----------------|-------------------|
| 1 | Organizer updates session | ✅ 200 | Session updated |
| 2 | Player updates session | ❌ 403 | Permission denied |
| 3 | Organizer removes player | ✅ 200 | Player removed |
| 4 | Player removes others | ❌ 403 | Permission denied |
| 5 | Organizer adds player | ✅ 201 | Player added |
| 6 | Player adds player | ❌ 403 | Permission denied |
| 7 | Organizer creates game | ✅ 201 | Game created |
| 8 | Player creates game | ❌ 403 | Permission denied |
| 9 | Player updates own status | ✅ 200 | Status updated |
| 10 | Player updates others | ❌ 403 | Permission denied |
| 11 | Organizer updates any status | ✅ 200 | Status updated |
| 12 | Organizer terminates session | ✅ 200 | Session terminated |
| 13 | Player terminates session | ❌ 403 | Permission denied |
| 14 | Rate limiting triggers | ⏱️ 429 | Rate limit exceeded |
| 15 | Rate limit headers | ✅ 200 | Headers present |
| 16 | Audit logs created | ✅ - | Console logs visible |

## Troubleshooting

### If a test fails:

1. **Check server is running**: `curl http://localhost:3001/health`
2. **Verify database connection**: Check server console for "✅ Database connected"
3. **Check deviceId matches**: Ensure deviceId in request matches session owner
4. **Verify shareCode is correct**: Get fresh shareCode from GET request
5. **Check player IDs**: Player IDs change on each join, get fresh IDs
6. **Review server logs**: Look for detailed error messages

### Common Issues:

- **403 on valid organizer**: Double-check `ownerDeviceId` matches exactly
- **404 on routes**: Ensure using correct API prefix `/api/v1`
- **Rate limit blocking tests**: Wait 1 minute or restart server
- **Player not found**: Fetch fresh player IDs from session GET request

## Cleanup

```bash
# List all active sessions
curl http://localhost:3001/api/v1/mvp-sessions | jq '.data.sessions[] | {id, name, shareCode, status}'

# Terminate test sessions
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/terminate/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "<OWNER_DEVICE_ID>"
  }'
```

## Success Criteria

- ✅ All organizer actions succeed (200/201)
- ✅ All player actions to restricted operations fail (403)
- ✅ Players can update their own status (200)
- ✅ Rate limiting activates after threshold (429)
- ✅ Audit logs appear in server console
- ✅ Error messages are clear and helpful

**If all tests pass, Story 2.1 (Permission System) is verified and ready for production!** 🎉
