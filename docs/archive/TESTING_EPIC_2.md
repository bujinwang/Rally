# 🧪 Testing Epic 2 - Quick Start Guide

**Commit:** 116aeeb  
**Date:** January 29, 2025  
**Status:** ✅ Epic 2 Committed, Ready for Testing

---

## ✅ What Was Just Committed

- **18 files changed** (5,598 insertions)
- **4 new React Native components**
- **1 new backend utility** (audit logger)
- **10 documentation files**
- **Permission system** with audit logging
- **Player status management** (rest/leave)
- **Fair pairing algorithm** with fairness scoring

---

## 🚀 Quick Start Testing (30 Minutes)

### Step 1: Start Backend (2 min)

```bash
cd backend
npm run dev
# Should see: 🚀 Server is running on port 3001
```

**Verify:**
- ✅ Server starts without errors
- ✅ Database connected
- ✅ All routes registered
- ✅ Socket.io initialized

### Step 2: Test Permission System (10 min)

**Create a session:**
```bash
curl -X POST http://localhost:3001/api/v1/mvp-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Session",
    "dateTime": "2025-02-01T10:00:00Z",
    "location": "Test Court",
    "organizerName": "Alice",
    "ownerDeviceId": "device-alice-123"
  }'
```

**Save the `shareCode` and `organizerCode` from response**

**Test organizer can update:**
```bash
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-alice-123",
    "courtCount": 3
  }'
```
Expected: ✅ 200 OK

**Test player cannot update:**
```bash
curl -X PUT http://localhost:3001/api/v1/mvp-sessions/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{
    "ownerDeviceId": "device-bob-456",
    "courtCount": 5
  }'
```
Expected: ❌ 403 Forbidden

### Step 3: Test Player Status (8 min)

**Join as player:**
```bash
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob",
    "deviceId": "device-bob-456"
  }'
```

**Get player ID from session:**
```bash
curl http://localhost:3001/api/v1/mvp-sessions/<SHARE_CODE> | jq '.data.session.players'
```

**Request rest (player-status route exists):**
```bash
curl -X POST http://localhost:3001/api/v1/player-status/<PLAYER_ID>/status \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rest",
    "reason": "Need a break",
    "deviceId": "device-bob-456"
  }'
```

Expected: ✅ 201 Created (request submitted)

**Check server console for Socket.io event:**
```
📡 Socket.IO: Emitted status_request
```

### Step 4: Test Pairing Generation (10 min)

**Add more players:**
```bash
# Add 3 more players so we have 4 total
curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{"name": "Charlie", "deviceId": "device-charlie-789"}'

curl -X POST http://localhost:3001/api/v1/mvp-sessions/join/<SHARE_CODE> \
  -H "Content-Type: application/json" \
  -d '{"name": "David", "deviceId": "device-david-101"}'
```

**Generate pairings:**
```bash
curl http://localhost:3001/api/v1/mvp-sessions/<SHARE_CODE>/rotation | jq
```

Expected: ✅ Response with:
- `suggestedGames` array
- `fairnessScore` (0-100)
- `fairnessReasons` array
- `nextInLine` array

**Sample response:**
```json
{
  "suggestedGames": [{
    "court": {"id": "1", "name": "Court 1"},
    "team1": [
      {"name": "Alice", "gamesPlayed": 0},
      {"name": "Bob", "gamesPlayed": 0}
    ],
    "team2": [
      {"name": "Charlie", "gamesPlayed": 0},
      {"name": "David", "gamesPlayed": 0}
    ],
    "fairnessScore": 100,
    "fairnessReasons": ["All players new - perfect balance"]
  }]
}
```

---

## 📱 Frontend Testing (Optional, 30 min)

### Start Frontend

```bash
cd frontend/BadmintonGroup
npm start
# Choose iOS/Android/Web
```

### Test Flows

**Flow 1: Organizer View**
1. Create session
2. See OrganizerControls panel (gold border)
3. Test add player
4. Test update court count
5. Test player removal

**Flow 2: Rest Request**
1. See RestingQueue component
2. Request rest as player
3. See pending request
4. Approve as organizer
5. See player in "Currently Resting"
6. Watch timer countdown

**Flow 3: Pairing Generation**
1. See PairingGeneratorPanel (blue border)
2. Add 4+ players
3. Click "Generate Fair Pairings"
4. See game preview
5. Check fairness metrics
6. Confirm to create games

---

## ✅ Success Criteria

### Must Pass (Critical)
- [ ] Server starts without errors
- [ ] Permission system blocks unauthorized actions (403)
- [ ] Organizer can perform all actions
- [ ] Player status API responds correctly
- [ ] Pairing generation works with 4+ players
- [ ] Fairness score calculated (0-100)

### Should Pass (Important)
- [ ] Socket.io events fire (check console)
- [ ] Audit logs appear in backend console
- [ ] Rate limiting works (try 15 requests quickly)
- [ ] Frontend components render without errors
- [ ] Real-time updates work

### Nice to Have (Polish)
- [ ] Fairness reasons make sense
- [ ] UI is responsive
- [ ] Error messages are clear
- [ ] Components look professional

---

## 🐛 Common Issues & Fixes

### Issue 1: Permission Denied (403)

**Symptom:** Getting 403 on organizer actions  
**Check:**
```bash
# Verify ownerDeviceId matches
curl http://localhost:3001/api/v1/mvp-sessions/<SHARE_CODE> | jq '.data.session.ownerDeviceId'
```
**Solution:** Use exact matching deviceId

### Issue 2: Pairing Returns Empty

**Symptom:** `suggestedGames: []`  
**Check:** Need at least 4 ACTIVE players  
**Solution:** Add more players or check player status

### Issue 3: Socket.io Not Firing

**Symptom:** No real-time updates  
**Check:** Server console for Socket.io messages  
**Solution:** Verify Socket.io initialized, check client connection

### Issue 4: Rate Limiting Blocking Tests

**Symptom:** 429 Too Many Requests  
**Solution:** Wait 1 minute or restart server

---

## 📊 Test Results Template

Copy this to track your testing:

```markdown
## Epic 2 Test Results

**Date:** [DATE]
**Tester:** [YOUR NAME]
**Environment:** [dev/staging/prod]

### Backend API Tests
- [ ] Server starts: PASS/FAIL
- [ ] Session creation: PASS/FAIL
- [ ] Permission system: PASS/FAIL
- [ ] Player status: PASS/FAIL
- [ ] Pairing generation: PASS/FAIL
- [ ] Rate limiting: PASS/FAIL
- [ ] Socket.io events: PASS/FAIL

### Frontend Tests
- [ ] Components render: PASS/FAIL
- [ ] OrganizerControls: PASS/FAIL
- [ ] RestingQueue: PASS/FAIL
- [ ] PairingGeneratorPanel: PASS/FAIL
- [ ] PermissionErrorAlert: PASS/FAIL

### Issues Found
1. [Description]
2. [Description]

### Notes
[Any observations or suggestions]
```

---

## 🎯 Next Steps After Testing

1. **If all tests pass:**
   - Move to Epic 3 (Scoring System)
   - Or start production prep

2. **If issues found:**
   - Document in GitHub Issues
   - Prioritize by severity
   - Fix critical bugs first
   - Retest after fixes

3. **If major problems:**
   - Review implementation
   - Check documentation
   - Ask for help
   - Consider rollback if needed

---

## 📞 Resources

- **Permission System Guide:** `PERMISSION_SYSTEM.md`
- **Integration Guide:** `EPIC_2_INTEGRATION_GUIDE.md`
- **API Test Script:** `TEST_PERMISSIONS.md`
- **Complete Summary:** `EPIC_2_COMPLETE.md`
- **What's Next:** `WHATS_NEXT.md`

---

## ⏱️ Time Budget

- **Quick smoke test:** 10 minutes
- **Comprehensive API test:** 30 minutes
- **Frontend integration test:** 30 minutes
- **Bug fixing:** 2-4 hours (if needed)
- **Total:** 1-2 days for thorough testing

---

**Good luck with testing! Epic 2 is a major milestone - you've built a production-quality management system!** 🚀

Remember: Finding bugs now is much better than finding them in production. Test thoroughly!
