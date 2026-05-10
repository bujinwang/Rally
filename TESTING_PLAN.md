# Testing Plan for New Features

## 🎯 Features Implemented

### 1. Device Fingerprinting
### 2. Real-Time Socket.io Updates  
### 3. Organizer Claim Flow

---

## ✅ Pre-Testing Checklist

### Backend Status
- ✅ Prisma schema fixed and migrated
- ✅ Database synced (`prisma db push` successful)
- ✅ Prisma client generated
- ✅ **mvpSessions.ts has 0 TypeScript errors**
- ⚠️ Some unrelated routes have errors (equipment, rankings, sessions) - **do not affect MVP**

### Frontend Status
- ✅ Device fingerprinting service created
- ✅ All screens updated to use DeviceService
- ✅ Organizer claim modal component created
- ✅ Session share modal updated to display secret
- ✅ Real-time listeners already configured

---

## 🧪 Test Scenarios

### Feature 1: Device Fingerprinting

#### Test 1.1: Device ID Generation
**Steps:**
1. Start mobile app for first time
2. Check AsyncStorage for device ID
3. Restart app
4. Verify same device ID is used

**Expected:**
- Device ID generated on first launch
- Device ID persists across app restarts
- Format: `{platform}-{hash}-{timestamp}` (e.g., `ios-abc123-xyz`)

**Files to verify:**
- `frontend/Rally/src/services/deviceService.ts`
- Check logs for "📱 Generated new device ID"

#### Test 1.2: Device ID in API Calls
**Steps:**
1. Create a new session
2. Join a session
3. Record a match score
4. Check backend logs/database

**Expected:**
- All API calls include deviceId
- Backend receives consistent deviceId from same device
- Database records have proper deviceId values

**API Endpoints to check:**
- `POST /api/v1/mvp-sessions` (create)
- `POST /api/v1/mvp-sessions/join/:shareCode` (join)
- `POST /api/v1/matches` (score recording)

---

### Feature 2: Real-Time Socket.io Updates

#### Test 2.1: Player Joins Session
**Steps:**
1. Device A creates session and joins
2. Device B joins the same session
3. Check Device A screen

**Expected:**
- Device A sees Device B appear in player list **immediately**
- No manual refresh required
- Console logs show: "📡 Socket.IO: Emitted session update"

**Socket Events:**
- Backend emits: `mvp-session-updated`
- Frontend listens: `sessionDataUpdated`

#### Test 2.2: Player Status Change
**Steps:**
1. Two devices in same session
2. Device A changes status (Active → Resting)
3. Check Device B screen

**Expected:**
- Device B sees status change **immediately**
- UI updates without refresh
- Backend logs: "📡 Socket.IO: Emitted player status update"

**Code locations:**
- Backend: `backend/src/routes/mvpSessions.ts` line ~3066-3082
- Frontend: `frontend/Rally/src/services/realTimeService.ts`

#### Test 2.3: Player Removed
**Steps:**
1. Organizer removes a player
2. Check all connected devices

**Expected:**
- Removed player disappears from all screens immediately
- Backend logs: "📡 Socket.IO: Emitted player removal"

**Backend code:** `mvpSessions.ts` line ~3180-3196

#### Test 2.4: Game Saved
**Steps:**
1. Record match result
2. Check all devices

**Expected:**
- Match appears in all devices immediately
- Backend logs: "📡 Socket.IO: Emitted game save"

**Backend code:** `mvpSessions.ts` line ~3351-3370

---

### Feature 3: Organizer Claim Flow

#### Test 3.1: Session Creation Shows Secret
**Steps:**
1. Create a new session
2. Check the share modal

**Expected:**
- **Golden/yellow highlighted section** displays organizer secret
- 6-character secret (uppercase letters/numbers)
- Copy button works
- Warning message: "Save this secret! You'll need it to regain organizer access"

**Files:**
- `frontend/Rally/src/components/SessionShareModal.tsx`
- `frontend/Rally/src/screens/CreateSessionScreen.tsx`

**Screenshot areas:**
- Section with key icon (🔑)
- Orange/yellow highlighted secret code
- Red warning box with warning icon (⚠️)

#### Test 3.2: Claim Access on New Device
**Steps:**
1. Device A creates session (gets secret "ABC123")
2. Device B joins session as regular player
3. Device B clicks "⭐ I'm the organizer" button
4. Device B enters secret "ABC123"
5. Submit

**Expected:**
- Modal opens with secret input
- After submitting correct secret: Success alert
- Device B now has organizer permissions
- Can manage session (remove players, etc.)

**Files:**
- `frontend/Rally/src/components/OrganizerClaimModal.tsx`
- `frontend/Rally/src/screens/JoinSessionScreen.tsx`

**Backend endpoint:** `POST /api/v1/mvp-sessions/claim`

#### Test 3.3: Claim with Invalid Secret
**Steps:**
1. Try to claim with wrong secret "WRONG1"

**Expected:**
- Error alert: "Invalid organizer secret"
- Modal stays open
- Can retry

#### Test 3.4: Claim When Not Joined
**Steps:**
1. Device without player record tries to claim
2. Enter valid secret

**Expected:**
- Modal shows: "Player name required"
- Additional input field appears
- Can enter name and submit together
- Backend creates player AND grants organizer access

**Backend logic:** `backend/src/routes/mvpSessions.ts` line ~647-760

---

## 🔍 Backend API Testing

### Test MVP Endpoints (cURL)

#### 1. Create Session (with organizerSecret)
```bash
curl -X POST http://localhost:3001/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Session",
    "dateTime": "2025-01-30T18:00:00Z",
    "location": "Test Court",
    "maxPlayers": 20,
    "organizerName": "Test Organizer",
    "ownerDeviceId": "test-device-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "session": { ... },
    "shareLink": "http://localhost:3001/join/ABC123",
    "organizerSecret": "XYZ789"  // <-- NEW FIELD
  }
}
```

#### 2. Join Session
```bash
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/ABC123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Player",
    "deviceId": "test-device-002"
  }'
```

**Expected:**
- Success response
- Socket.io event emitted (check server logs)
- Player added to session

#### 3. Claim Organizer Access
```bash
curl -X POST http://localhost:3001/api/v1/mvp-sessions/claim \
  -H "Content-Type: application/json" \
  -d '{
    "shareCode": "ABC123",
    "secret": "XYZ789",
    "deviceId": "test-device-002"
  }'
```

**Expected:**
- Success: Device granted organizer access
- Player role updated to "ORGANIZER"
- `ownerDeviceId` updated in session

---

## 🐛 Known Issues (Non-Blocking)

### Backend
- ❌ `sessions.ts` route has schema mismatches (not used by MVP)
- ❌ `equipment.ts` has type errors (not used by MVP)
- ❌ `rankings.ts` has missing method errors (not used by MVP)

**Impact:** None - MVP uses `mvpSessions` route which has **0 errors**

### Frontend
- ⚠️ One test file has regex syntax error (`usePermissions.test.ts`) - doesn't affect runtime

---

## 📊 Success Criteria

### Feature 1: Device Fingerprinting ✅
- [ ] Device ID generated and persists
- [ ] All API calls include deviceId
- [ ] Database stores deviceId correctly

### Feature 2: Real-Time Updates ✅
- [ ] Player joins appear instantly on other devices
- [ ] Status changes propagate in real-time
- [ ] No manual refresh needed
- [ ] Socket.io logs show events being emitted

### Feature 3: Organizer Claim ✅
- [ ] Organizer secret displayed on creation
- [ ] Secret is 6 characters, prominent in UI
- [ ] Claim button visible on join screen
- [ ] Valid secret grants organizer access
- [ ] Invalid secret shows error
- [ ] Can claim even without being joined yet

---

## 🚀 Quick Start Testing

### Terminal 1: Start Backend
```bash
cd backend
npm run dev
```

**Check for:**
- "📡 Socket.io server initialized"
- "Server running on port 3001"
- No errors in mvpSessions route

### Terminal 2: Start Frontend (iOS)
```bash
cd frontend/Rally
npx expo start --clear
# Press 'i' for iOS simulator
```

### Terminal 3: Start Frontend (Android)
```bash
cd frontend/Rally
npx expo start --clear
# Press 'a' for Android emulator
```

### Test Flow
1. Create session on Device 1 → **Save the organizer secret**
2. Join session on Device 2 → Watch Device 1 update instantly
3. On Device 2: Click "I'm the organizer" → Enter secret
4. Verify Device 2 now has organizer powers

---

## 📝 Notes

- Socket.io requires both devices to be connected to same backend
- Use `http://localhost:3001` for iOS simulator
- Use `http://10.0.2.2:3001` for Android emulator
- Check browser DevTools/React Native Debugger for console logs
- Backend logs show Socket.io events with 📡 emoji

---

## ✅ Completion Status

| Feature | Code | Tests | Status |
|---------|------|-------|--------|
| Device Fingerprinting | ✅ | ⏳ | Ready |
| Real-Time Socket.io | ✅ | ⏳ | Ready |
| Organizer Claim Flow | ✅ | ⏳ | Ready |

**All features implemented and ready for manual testing!**
