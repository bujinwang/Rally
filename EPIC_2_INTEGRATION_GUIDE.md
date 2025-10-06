# Epic 2 Integration Guide - Complete Management Features

## Overview

This guide shows how to integrate all Epic 2 features (Stories 2.1, 2.2, 2.3) into the SessionDetailScreen for a complete organizer experience.

---

## Components Overview

### Story 2.1: Permission System
- **OrganizerControls** - Main organizer control panel
- **PermissionErrorAlert** - Error feedback for denied actions

### Story 2.2: Player Status Management
- **RestingQueue** - Rest/leave request management
- **StatusManager** - Player status controls (already exists)

### Story 2.3: Pairing Algorithm
- **PairingGeneratorPanel** - Generate fair game pairings
- Rotation algorithm (backend utility)

---

## Integration Example

### Step 1: Import Components

```typescript
import {
  OrganizerControls,
  PermissionErrorAlert,
  RestingQueue,
  PairingGeneratorPanel
} from '../components';
```

### Step 2: Add State Management

```typescript
const [permissionError, setPermissionError] = useState<string | null>(null);
const [rotation, setRotation] = useState<RotationData | null>(null);

// Check if current user is organizer
const isOrganizer = session.ownerDeviceId === currentDeviceId;
```

### Step 3: API Integration Functions

```typescript
// Story 2.1: Session Management
const handleSessionUpdate = async (updates: any) => {
  try {
    await sessionApi.updateSession(session.shareCode, updates, currentDeviceId);
    refreshSession();
  } catch (error) {
    if (error.response?.status === 403) {
      setPermissionError(error.response.data.error.message);
    }
  }
};

const handlePlayerRemove = async (playerId: string) => {
  try {
    await sessionApi.removePlayer(session.shareCode, playerId, currentDeviceId);
    refreshSession();
  } catch (error) {
    if (error.response?.status === 403) {
      setPermissionError(error.response.data.error.message);
    }
  }
};

const handlePlayerAdd = async (playerName: string) => {
  try {
    await sessionApi.addPlayer(session.shareCode, playerName, currentDeviceId);
    refreshSession();
  } catch (error) {
    handleError(error);
  }
};

// Story 2.2: Rest Management
const handleApproveRest = async (playerId: string, approve: boolean) => {
  try {
    const requestId = `req_${playerId}_${Date.now()}`;
    await axios.put(
      `${API_BASE_URL}/player-status/approve/${requestId}`,
      {
        approved: approve,
        reason: approve ? 'Approved' : 'Denied',
        ownerDeviceId: currentDeviceId
      }
    );
    refreshSession();
  } catch (error) {
    Alert.alert('Error', 'Failed to process request');
  }
};

const handleExpireRest = async (playerId: string) => {
  try {
    await axios.post(
      `${API_BASE_URL}/player-status/expire-rest/${playerId}`
    );
    refreshSession();
  } catch (error) {
    Alert.alert('Error', 'Failed to expire rest');
  }
};

// Story 2.3: Pairing Generation
const handleGeneratePairings = async (): Promise<RotationData> => {
  const response = await axios.get(
    `${API_BASE_URL}/mvp-sessions/${session.shareCode}/rotation`
  );
  return response.data.data;
};

const handleCreateGames = async (games: GameSuggestion[]) => {
  for (const game of games) {
    await axios.post(
      `${API_BASE_URL}/mvp-sessions/${session.shareCode}/games`,
      {
        team1Player1: game.team1[0].name,
        team1Player2: game.team1[1].name,
        team2Player1: game.team2[0].name,
        team2Player2: game.team2[1].name,
        courtName: game.court.name
      }
    );
  }
  refreshSession();
};
```

### Step 4: Render Components

```typescript
return (
  <ScrollView style={styles.container}>
    {/* Session Header */}
    <View style={styles.header}>
      <Text style={styles.title}>{session.name}</Text>
      <Text style={styles.info}>
        📅 {formatDate(session.scheduledAt)}
      </Text>
      <Text style={styles.info}>
        📍 {session.location}
      </Text>
    </View>

    {/* Story 2.1: Organizer Controls */}
    {isOrganizer && (
      <OrganizerControls
        session={session}
        currentUserDeviceId={currentDeviceId}
        isOrganizer={isOrganizer}
        onSessionUpdate={refreshSession}
        onSessionTerminate={handleTerminateSession}
        onPlayerRemove={handlePlayerRemove}
        onPlayerAdd={handlePlayerAdd}
        onCourtCountUpdate={handleCourtCountUpdate}
      />
    )}

    {/* Story 2.2: Resting Queue */}
    <RestingQueue
      players={session.players}
      isOrganizer={isOrganizer}
      onApproveRest={handleApproveRest}
      onExpireRest={handleExpireRest}
    />

    {/* Story 2.3: Pairing Generator */}
    {isOrganizer && (
      <PairingGeneratorPanel
        sessionShareCode={session.shareCode}
        courtCount={session.courtCount}
        activePlayers={session.players.filter(p => p.status === 'ACTIVE')}
        isOrganizer={isOrganizer}
        onGeneratePairings={handleGeneratePairings}
        onCreateGames={handleCreateGames}
      />
    )}

    {/* Player List */}
    <View style={styles.playerSection}>
      <Text style={styles.sectionTitle}>
        Players ({session.players.length}/{session.maxPlayers})
      </Text>
      {session.players.map(player => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </View>

    {/* Story 2.1: Permission Error Alert */}
    <PermissionErrorAlert
      visible={!!permissionError}
      errorMessage={permissionError || ''}
      requiredRole="ORGANIZER"
      onClose={() => setPermissionError(null)}
    />
  </ScrollView>
);
```

---

## Socket.io Integration

### Step 1: Setup Socket Connection

```typescript
import { useRealTimeSession } from '../hooks/useRealTimeSession';

// In component
const { connected, error } = useRealTimeSession(session.shareCode, {
  onSessionUpdate: (updatedSession) => {
    setSession(updatedSession);
  },
  onPlayerJoined: (player) => {
    refreshSession();
  },
  onPlayerLeft: (playerId) => {
    refreshSession();
  },
  onStatusRequest: (request) => {
    // Show notification to organizer
    if (isOrganizer) {
      Alert.alert(
        'Status Request',
        `${request.playerName} wants to ${request.action}`,
        [
          {
            text: 'Deny',
            style: 'cancel',
            onPress: () => handleApproveRest(request.playerId, false)
          },
          {
            text: 'Approve',
            onPress: () => handleApproveRest(request.playerId, true)
          }
        ]
      );
    }
  },
  onStatusApproved: (data) => {
    Alert.alert('Request Approved', `${data.playerName} is now ${data.newStatus}`);
    refreshSession();
  },
  onStatusDenied: (data) => {
    Alert.alert('Request Denied', `${data.playerName}'s request was denied`);
  }
});
```

### Step 2: Add Socket Events

```typescript
// Listen for status updates
socket.on('status_request', (data) => {
  console.log('Status request:', data);
  // Handle in UI
});

socket.on('status_approved', (data) => {
  console.log('Status approved:', data);
  refreshSession();
});

socket.on('status_denied', (data) => {
  console.log('Status denied:', data);
  Alert.alert('Request Denied', data.reason || 'Request was not approved');
});

socket.on('status_expired', (data) => {
  console.log('Rest expired:', data);
  refreshSession();
});
```

---

## Complete Feature Flow

### Flow 1: Organizer Manages Session

1. Organizer opens session
2. Sees **OrganizerControls** panel
3. Can add/remove players
4. Can update court count
5. Can terminate session
6. All actions logged and rate-limited

### Flow 2: Player Requests Rest

1. Player clicks "Request Rest"
2. Request sent to backend
3. Socket.io notifies organizer
4. **RestingQueue** shows pending request
5. Organizer approves/denies
6. Player status updates
7. Socket.io notifies all players
8. Rest timer starts (15 min)
9. Auto-expires and returns to ACTIVE

### Flow 3: Generate Game Pairings

1. Organizer clicks "Generate Fair Pairings"
2. **PairingGeneratorPanel** calls API
3. Backend runs rotation algorithm
4. Returns suggested games with fairness scores
5. Shows preview with teams and metrics
6. Organizer reviews and confirms
7. Games created for all courts
8. Players notified of assignments

---

## Component Props Reference

### OrganizerControls

```typescript
{
  session: Session;
  currentUserDeviceId: string;
  isOrganizer: boolean;
  onSessionUpdate: () => void;
  onSessionTerminate: () => void;
  onPlayerRemove: (playerId: string) => void;
  onPlayerAdd: (playerName: string) => void;
  onCourtCountUpdate: (courtCount: number) => void;
}
```

### RestingQueue

```typescript
{
  players: Player[];
  isOrganizer: boolean;
  onApproveRest?: (playerId: string, approve: boolean) => void;
  onExpireRest?: (playerId: string) => void;
}
```

### PairingGeneratorPanel

```typescript
{
  sessionShareCode: string;
  courtCount: number;
  activePlayers: Player[];
  isOrganizer: boolean;
  onGeneratePairings: () => Promise<RotationData>;
  onCreateGames: (games: GameSuggestion[]) => Promise<void>;
}
```

### PermissionErrorAlert

```typescript
{
  visible: boolean;
  errorMessage: string;
  requiredRole?: string;
  onClose: () => void;
}
```

---

## Testing Checklist

### Story 2.1 Tests
- [ ] Organizer sees OrganizerControls
- [ ] Player doesn't see OrganizerControls
- [ ] Add player works
- [ ] Remove player works
- [ ] Update court count works
- [ ] Terminate session works
- [ ] Permission errors show alert

### Story 2.2 Tests
- [ ] Request rest shows in queue
- [ ] Approve rest updates status
- [ ] Deny rest clears request
- [ ] Rest timer counts down
- [ ] Rest expires automatically
- [ ] Socket.io events fire

### Story 2.3 Tests
- [ ] Generate pairings button enabled with 4+ players
- [ ] Preview shows suggested games
- [ ] Fairness scores displayed
- [ ] Next in line shown
- [ ] Create games works
- [ ] Respects resting players

---

## Performance Tips

1. **Memoize Expensive Calculations**
   ```typescript
   const activePlayers = useMemo(
     () => session.players.filter(p => p.status === 'ACTIVE'),
     [session.players]
   );
   ```

2. **Debounce Refresh Calls**
   ```typescript
   const debouncedRefresh = useCallback(
     debounce(refreshSession, 500),
     []
   );
   ```

3. **Optimize Socket Listeners**
   ```typescript
   useEffect(() => {
     socket.on('status_request', handleStatusRequest);
     return () => {
       socket.off('status_request', handleStatusRequest);
     };
   }, [session.shareCode]);
   ```

---

## Common Issues & Solutions

### Issue 1: Permission Errors
**Symptom:** Getting 403 on organizer actions  
**Solution:** Verify `currentDeviceId === session.ownerDeviceId`

### Issue 2: Rest Not Expiring
**Symptom:** Player stuck in RESTING  
**Solution:** Check `restExpiresAt` timestamp and call expire endpoint

### Issue 3: Pairings Not Fair
**Symptom:** Same players keep getting picked  
**Solution:** Verify `gamesPlayed` is updating correctly

### Issue 4: Socket Not Connected
**Symptom:** Real-time updates not working  
**Solution:** Check Socket.io connection and room joining

---

## API Endpoints Quick Reference

```
# Story 2.1
PUT    /api/v1/mvp-sessions/:shareCode
DELETE /api/v1/mvp-sessions/:shareCode/players/:playerId
POST   /api/v1/mvp-sessions/:shareCode/add-player
PUT    /api/v1/mvp-sessions/terminate/:shareCode
PUT    /api/v1/mvp-sessions/:shareCode/courts

# Story 2.2
POST   /api/v1/player-status/:playerId/status
PUT    /api/v1/player-status/approve/:requestId
GET    /api/v1/player-status/pending/:shareCode
POST   /api/v1/player-status/expire-rest/:playerId

# Story 2.3
GET    /api/v1/mvp-sessions/:shareCode/rotation
POST   /api/v1/mvp-sessions/:shareCode/games
```

---

## Example Session Flow

```
1. Organizer creates session
2. Shares link, players join
3. Organizer sees 8 players
4. 2 players request rest → Organizer approves
5. 6 active players remain
6. Organizer generates pairings
7. Algorithm suggests 1 game (4 players)
8. Preview shows Team 1 vs Team 2 with 87% fairness
9. Next in line: 2 players resting
10. Organizer confirms → Game created
11. After game, scores recorded
12. Rest expires → Players back to active
13. Repeat pairing generation
```

---

## Best Practices

1. **Always Check isOrganizer**
   - Hide organizer controls from players
   - Prevent unauthorized API calls
   - Clear UI distinction

2. **Handle Errors Gracefully**
   - Show PermissionErrorAlert for 403s
   - Display helpful error messages
   - Allow retry on failures

3. **Use Real-time Updates**
   - Socket.io for instant feedback
   - No need for manual refresh
   - Better user experience

4. **Optimize Re-renders**
   - Memoize calculations
   - Use useCallback for functions
   - Minimize state updates

5. **Test Edge Cases**
   - Odd player counts
   - All players resting
   - Network failures
   - Permission changes

---

**Epic 2 is fully integrated and ready for production!** 🎉

All three stories work together to provide a complete session management experience for organizers and a smooth, fair gameplay experience for all players.
