# 🧪 Epic 3 Testing Guide - Scoring and Statistics System

**Date:** January 29, 2025  
**Status:** Ready for Testing  
**Backend:** ✅ Running on http://localhost:3001

---

## 🎯 Testing Overview

This guide will help you test all Epic 3 features:
- Score recording (2-0 or 2-1 validation)
- Player statistics tracking
- Leaderboard with rankings
- CSV export functionality

---

## ✅ Backend Status Check

### 1. Verify Backend is Running

```bash
# Health check
curl http://localhost:3001/health

# Should return:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "version": "1.0.0"
# }
```

### 2. Verify Scoring Routes are Registered

**Expected output from server startup:**
```
📍 Registering routes:
  - /auth
  - /users
  - /mvp-sessions
  - /player-status
  - /scoring ← ✅ THIS IS NEW!
  - /pairings
  ...
✅ All routes registered successfully
```

---

## 🧪 Manual API Testing

### Test 1: Get Leaderboard (Empty State)

```bash
SHARE_CODE="EJBZOO"  # Use your session share code

curl -X GET "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/leaderboard" \
  -H "Content-Type: application/json" | json_pp
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [],
    "sessionName": "Test Scoring Session",
    "totalPlayers": 0,
    "sortedBy": "winRate"
  },
  "message": "Leaderboard retrieved (0 players)",
  "timestamp": "..."
}
```

---

### Test 2: Get Score History (Empty State)

```bash
curl -X GET "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/scores" \
  -H "Content-Type: application/json" | json_pp
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "scores": [],
    "total": 0
  },
  "message": "Retrieved 0 completed match(es)",
  "timestamp": "..."
}
```

---

### Test 3: Record Match Score (Valid: 2-0)

**Prerequisites:**
- Must have an existing match with status "IN_PROGRESS"
- Must be organizer (have organizer code)

```bash
MATCH_ID="<your-match-id>"
SHARE_CODE="EJBZOO"

curl -X POST "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/matches/${MATCH_ID}/score" \
  -H "Content-Type: application/json" \
  -H "x-organizer-code: <organizer-code>" \
  -d '{
    "team1Score": 2,
    "team2Score": 0,
    "recordedBy": "Alice",
    "deviceId": "test-device"
  }' | json_pp
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "match": {
      "id": "...",
      "matchNumber": 1,
      "team1GamesWon": 2,
      "team2GamesWon": 0,
      "winnerTeam": 1,
      "scoreType": "2-0",
      "status": "COMPLETED"
    }
  },
  "message": "Score recorded: 2-0",
  "timestamp": "..."
}
```

---

### Test 4: Record Match Score (Valid: 2-1)

```bash
curl -X POST "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/matches/${MATCH_ID}/score" \
  -H "Content-Type: application/json" \
  -H "x-organizer-code: <organizer-code>" \
  -d '{
    "team1Score": 2,
    "team2Score": 1,
    "recordedBy": "Alice",
    "deviceId": "test-device"
  }' | json_pp
```

**Expected:** Same as above but with `"scoreType": "2-1"`

---

### Test 5: Record Invalid Score (Should Fail)

```bash
# Test 1-1 (invalid tie)
curl -X POST "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/matches/${MATCH_ID}/score" \
  -H "Content-Type: application/json" \
  -d '{
    "team1Score": 1,
    "team2Score": 1,
    "recordedBy": "Alice"
  }' | json_pp
```

**Expected Error:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_SCORE",
    "message": "Invalid match score. Must be 2-0 or 2-1 (best of 3)"
  },
  "timestamp": "..."
}
```

---

### Test 6: Get Player Statistics

```bash
curl -X GET "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/statistics/Alice" \
  -H "Content-Type: application/json" | json_pp
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "player": {
      "name": "Alice",
      "gamesPlayed": 5,
      "wins": 3,
      "losses": 2,
      "winRate": 0.6,
      "matchesPlayed": 3,
      "matchWins": 2,
      "matchLosses": 1,
      "matchWinRate": 0.6666666666666666,
      "totalSetsWon": 10,
      "totalSetsLost": 6,
      "totalPlayTime": 90,
      "averageGameDuration": 18
    }
  },
  "message": "Player statistics retrieved",
  "timestamp": "..."
}
```

---

### Test 7: Get Leaderboard with Sorting

```bash
# Sort by game win rate (default)
curl "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/leaderboard?sortBy=winRate" | json_pp

# Sort by match win rate
curl "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/leaderboard?sortBy=matchWinRate" | json_pp

# Sort by total wins
curl "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/leaderboard?sortBy=wins" | json_pp
```

---

### Test 8: CSV Export - Leaderboard

```bash
curl "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/leaderboard/export" \
  --output leaderboard.csv

# View the CSV
cat leaderboard.csv
```

**Expected CSV Format:**
```csv
# Test Scoring Session - Leaderboard Export
# Generated: 2025-01-29T...
# Total Players: 4
# Sorted By: winRate

Rank,Player Name,Games Played,Wins,Losses,Game Win %,Matches Played,Match Wins,Match Losses,Match Win %,Total Sets Won,Total Sets Lost,Sets Differential,Total Play Time (min),Avg Game Duration (min)
1,Alice,5,4,1,80.0,3,2,1,66.7,12,5,7,90,18.0
2,Bob,5,3,2,60.0,3,2,1,66.7,10,8,2,85,17.0
3,Charlie,4,2,2,50.0,2,1,1,50.0,7,7,0,72,18.0
4,Diana,4,1,3,25.0,2,0,2,0.0,4,9,-5,68,17.0
```

---

### Test 9: CSV Export - Score History

```bash
curl "http://localhost:3001/api/v1/scoring/${SHARE_CODE}/scores/export" \
  --output scores.csv

# View the CSV
cat scores.csv
```

**Expected CSV Format:**
```csv
# Test Scoring Session - Score History Export
# Generated: 2025-01-29T...
# Total Matches: 3

Match #,Team 1 Player 1,Team 1 Player 2,Team 1 Score,Team 2 Player 1,Team 2 Player 2,Team 2 Score,Winner,Score Type,Duration (min),Completed At
1,Alice,Bob,2,Charlie,Diana,0,Team 1,2-0,20,2025-01-29T10:15:00.000Z
2,Charlie,Bob,2,Alice,Diana,1,Team 1,2-1,25,2025-01-29T10:45:00.000Z
3,Alice,Charlie,1,Bob,Diana,2,Team 2,1-2,22,2025-01-29T11:15:00.000Z
```

---

## 🎨 Frontend Component Testing

### QuickScoreEntry Component

**Location:** `frontend/src/components/QuickScoreEntry.tsx`

**Manual Test Steps:**
1. Run the mobile app
2. Navigate to active session
3. Find a completed match
4. Click "Record Score" button
5. QuickScoreEntry modal should open

**Visual Verification:**
- ✅ Modal appears with match info
- ✅ Team names displayed correctly
- ✅ Score buttons (0, 1, 2) are large and clickable
- ✅ Selected button highlights in blue
- ✅ Score preview shows "2-0" or "2-1"
- ✅ Validation error shows for invalid scores (1-1, 3-0, etc.)
- ✅ Submit button disabled for invalid scores
- ✅ Success message after submission

---

### LeaderboardScreen Component

**Location:** `frontend/src/screens/LeaderboardScreen.tsx`

**Manual Test Steps:**
1. Navigate to Leaderboard tab/screen
2. View player rankings

**Visual Verification:**
- ✅ Session name displayed at top
- ✅ Sort buttons work (Game Win %, Match Win %, Total Wins)
- ✅ Top 3 players have medals (🥇🥈🥉)
- ✅ Player cards show:
  - Rank
  - Name
  - Games played
  - Win/loss record
  - Win percentage
  - Sets won/lost
- ✅ Pull-to-refresh works
- ✅ Empty state shows when no players

---

### StatisticsCard Component

**Location:** `frontend/src/components/StatisticsCard.tsx`

**Manual Test Steps:**
1. View a player's detailed statistics
2. Toggle between compact and detailed modes

**Visual Verification:**
- ✅ Player name and rank displayed
- ✅ Performance indicator (Excellent/Good/Fair/Needs Work)
- ✅ Main stats grid shows:
  - Games played
  - Game win %
  - Matches played
  - Match win %
- ✅ Detailed mode shows:
  - Sets performance
  - Time statistics
  - Consistency metrics
- ✅ Color-coded values (green for positive, red for negative)
- ✅ Compact mode shows quick stats bar

---

## ✅ Feature Verification Checklist

### Score Recording
- [ ] Can record 2-0 scores
- [ ] Can record 0-2 scores
- [ ] Can record 2-1 scores
- [ ] Can record 1-2 scores
- [ ] Rejects 0-0 (no winner)
- [ ] Rejects 1-1 (tie)
- [ ] Rejects 3-0 (impossible)
- [ ] Rejects 2-2 (impossible)
- [ ] Only organizer can record scores
- [ ] Match status updates to COMPLETED
- [ ] Winner team is correctly determined

### Statistics Calculation
- [ ] Games played increments correctly
- [ ] Wins tracked correctly for winners
- [ ] Losses tracked correctly for losers
- [ ] Win rate calculates correctly (wins / games)
- [ ] Matches played increments correctly
- [ ] Match wins tracked correctly
- [ ] Match win rate calculates correctly
- [ ] Sets won/lost tracked correctly
- [ ] Total play time accumulates
- [ ] Average game duration calculates

### Leaderboard
- [ ] Players ranked by win rate (default)
- [ ] Can sort by match win rate
- [ ] Can sort by total wins
- [ ] Top 3 have special highlighting
- [ ] Pull-to-refresh updates data
- [ ] Empty state displays correctly
- [ ] Loading state displays during fetch

### CSV Export
- [ ] Leaderboard exports to CSV
- [ ] Score history exports to CSV
- [ ] CSV includes metadata (session name, timestamp)
- [ ] CSV formatted correctly
- [ ] File downloads successfully
- [ ] Data matches API responses

### Real-time Updates
- [ ] Socket.io event fires on score recording
- [ ] All clients receive score update
- [ ] Leaderboard updates in real-time
- [ ] Statistics update in real-time

### Audit Trail
- [ ] Score recordings logged to audit log
- [ ] Audit log includes recorder name
- [ ] Audit log includes timestamp
- [ ] Audit log includes IP address
- [ ] Audit log includes scores

---

## 🐛 Common Issues and Solutions

### Issue 1: "Session not found"
**Solution:** Make sure the shareCode is correct and the session exists.

### Issue 2: "Match not found"
**Solution:** Match ID must be valid and belong to the session.

### Issue 3: "Unauthorized"
**Solution:** Must provide organizer code in `x-organizer-code` header.

### Issue 4: "Invalid score"
**Solution:** Score must be 2-0, 0-2, 2-1, or 1-2 only.

### Issue 5: Statistics not updating
**Solution:** Verify `updatePlayerMatchStatistics` function is being called.

### Issue 6: CSV download not working
**Solution:** Check Content-Type and Content-Disposition headers.

---

## 📊 Expected Results After Full Test

After recording several match scores, you should see:

**Leaderboard:**
- 4 players ranked by win rate
- Top player has 🥇 medal
- Second player has 🥈 medal
- Third player has 🥉 medal
- Fourth player has rank #4

**Statistics (Example for top player):**
- Games Played: 10
- Wins: 7
- Losses: 3
- Win Rate: 70%
- Matches Played: 5
- Match Wins: 3
- Match Losses: 2
- Match Win Rate: 60%
- Sets Won: 16
- Sets Lost: 9
- Sets Differential: +7

**CSV Exports:**
- leaderboard.csv with 4 player rows
- scores.csv with 5 match rows

---

## 🎯 Success Criteria

| Feature | Expected | Pass/Fail |
|---------|----------|-----------|
| Score recording works | ✅ Yes | ⏳ Testing |
| Validation rejects invalid scores | ✅ Yes | ⏳ Testing |
| Statistics calculate correctly | ✅ Yes | ⏳ Testing |
| Leaderboard sorts correctly | ✅ Yes | ⏳ Testing |
| CSV export works | ✅ Yes | ⏳ Testing |
| Real-time updates work | ✅ Yes | ⏳ Testing |
| UI components render | ✅ Yes | ⏳ Testing |

---

## 📝 Testing Notes

**Date:** January 29, 2025  
**Tester:** ___________  
**Backend Status:** ✅ Running  
**Database:** ✅ Connected  
**Routes:** ✅ Registered  

**Test Results:**
- Total Tests: 15
- Passed: ___
- Failed: ___
- Blocked: ___

**Bugs Found:**
1. _______________
2. _______________
3. _______________

**Notes:**
_________________
_________________
_________________

---

## 🚀 Next Steps After Testing

1. **If all tests pass:**
   - Document test results
   - Mark Epic 3 as tested and verified
   - Move to production deployment prep

2. **If bugs found:**
   - Document each bug with steps to reproduce
   - Priority: Critical / High / Medium / Low
   - Assign for fixing
   - Retest after fixes

3. **Production checklist:**
   - [ ] All API endpoints tested
   - [ ] All UI components tested
   - [ ] CSV export verified
   - [ ] Real-time updates verified
   - [ ] Performance acceptable
   - [ ] No security issues
   - [ ] Documentation complete
   - [ ] Ready for deployment

---

**Epic 3 Testing Status:** 🔄 In Progress

**Once testing is complete, update this document with results!**
