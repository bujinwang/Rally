# BadmintonGroup Frontend Architecture Document

## Template and Framework Selection

### Current Framework & Architecture Analysis

**Framework**: React Native + Expo (v52.0.0) with TypeScript  
**State Management**: Redux Toolkit + Redux Persist  
**Navigation**: React Navigation v7  
**Real-time**: Socket.IO client already implemented  
**API Layer**: REST API with MVP service layer  
**UI Components**: React Native Elements + Custom Design System  

**Key Discovery**: You already have Socket.IO infrastructure in place! The `socketService.ts` already listens for `'mvp-session-updated'` events, which is perfect for implementing auto-refresh.

**Auto-Refresh Implementation Strategy**: Your app is perfectly positioned for real-time auto-refresh. The socket service already handles session updates, but the UI components need to be connected to respond to these real-time events.

## Frontend Tech Stack

### Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| Framework | React Native + Expo | 18.3.1 + ~52.0.0 | Cross-platform mobile app development | Already established, provides excellent real-time update performance on mobile |
| State Management | Redux Toolkit | ^2.8.2 | Global state management with real-time sync | Already configured; RTK's createSlice perfect for handling socket-driven state updates |
| Real-time Communication | Socket.IO Client | ^4.8.1 | WebSocket connection for live updates | Already implemented with reconnection logic; ideal for auto-refresh without polling overhead |
| Navigation | React Navigation | ^7.1.17 | Screen navigation and deep linking | Existing stack; v7 handles state persistence during real-time updates |
| UI Library | React Native Elements | ^3.4.3 | Base UI components | Already in use; provides consistent loading states and indicators |
| Network State | @react-native-community/netinfo | 11.4.1 | Network connectivity detection | Critical for auto-refresh fallback strategies when Socket.IO fails |
| Persistence | Redux Persist + AsyncStorage | ^6.0.0 + ~1.23.1 | State persistence and caching | Essential for offline-first auto-refresh with cached data |
| Performance | Memoize-One | ^6.0.0 | Component memoization | Already available; prevents unnecessary re-renders during frequent updates |
| Development | TypeScript + ESLint | ^5.8.3 + ^8.19.0 | Type safety and code quality | Existing setup ensures type-safe real-time data handling |

**Key Architectural Advantages for Auto-Refresh:**
- **Socket.IO + Redux**: Socket events directly dispatch Redux actions for seamless real-time updates
- **Network-aware**: NetInfo integration allows graceful degradation to polling when Socket.IO unavailable
- **Offline-first**: Redux Persist maintains player list state even when disconnected
- **Performance-optimized**: Memoize-One prevents PlayerCard re-renders unless actual player data changes

## Project Structure

```
frontend/BadmintonGroup/src/
├── components/
│   ├── design-system/
│   │   ├── Layout/
│   │   │   ├── PlayerCountIndicator.tsx     # Real-time player count
│   │   │   ├── SessionHeader.tsx            # Live session status
│   │   │   ├── LoadingStates/               # NEW: Auto-refresh loading indicators
│   │   │   │   ├── PlayerListSkeleton.tsx
│   │   │   │   ├── RefreshIndicator.tsx
│   │   │   │   └── index.ts
│   │   │   └── ConnectionStatus/            # NEW: Socket connection UI
│   │   │       ├── ConnectionBadge.tsx
│   │   │       ├── ReconnectingState.tsx
│   │   │       └── index.ts
│   │   ├── Card/
│   │   │   ├── PlayerCard.tsx               # Enhanced with real-time updates
│   │   │   ├── PlayerCard.realtime.tsx      # NEW: Real-time player card wrapper
│   │   │   └── PlayerList/                  # NEW: Auto-refreshing player list
│   │   │       ├── PlayerList.tsx
│   │   │       ├── PlayerList.hooks.ts
│   │   │       └── index.ts
│   │   └── Notifications/                   # NEW: Real-time notifications
│   │       ├── PlayerJoinedToast.tsx
│   │       ├── PlayerLeftToast.tsx
│   │       └── index.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useRealTimeSession.ts                # NEW: Main auto-refresh hook
│   ├── useSocketConnection.ts               # NEW: Socket.IO connection management
│   ├── usePlayerUpdates.ts                  # NEW: Player-specific real-time updates
│   └── useNetworkFallback.ts               # NEW: Fallback polling when offline
├── services/
│   ├── apiService.ts
│   ├── mvpApiService.ts
│   ├── socketService.ts                     # Enhanced for auto-refresh events
│   ├── syncManager.ts                       # Enhanced real-time sync logic
│   ├── storageService.ts
│   └── realTimeService.ts                   # NEW: Orchestrates auto-refresh logic
├── store/
│   ├── index.ts
│   ├── slices/
│   │   ├── authSlice.ts
│   │   ├── playerSlice.ts                   # Enhanced with real-time actions
│   │   ├── sessionSlice.ts                  # Enhanced with socket integration
│   │   ├── uiSlice.ts
│   │   ├── realTimeSlice.ts                 # NEW: Real-time connection state
│   │   └── notificationSlice.ts             # NEW: Real-time notifications
│   ├── middleware/
│   │   ├── socketMiddleware.ts              # NEW: Socket event → Redux action bridge
│   │   └── realTimeMiddleware.ts            # NEW: Auto-refresh orchestration
│   └── selectors/
│       ├── sessionSelectors.ts              # NEW: Memoized session data selectors
│       └── playerSelectors.ts               # NEW: Optimized player list selectors
├── screens/
│   ├── SessionDetailScreen.tsx              # Enhanced with auto-refresh
│   ├── SessionOverviewScreen.tsx            # Enhanced with real-time updates
│   └── sessions/
│       └── SessionListScreen.tsx            # Enhanced with live session updates
└── utils/
    ├── realTimeHelpers.ts                   # NEW: Auto-refresh utility functions
    ├── socketEventHandlers.ts               # NEW: Centralized socket event handling
    └── optimisticUpdates.ts                 # NEW: Optimistic UI update helpers
```

**Key Architectural Decisions:**

**Real-time Service Layer**: New `realTimeService.ts` orchestrates the interaction between Socket.IO, Redux, and components, keeping the auto-refresh logic centralized.

**Hook-based Architecture**: Custom hooks (`useRealTimeSession`, `useSocketConnection`) encapsulate real-time logic, making components clean and testable.

**Redux Middleware Pattern**: `socketMiddleware.ts` bridges Socket.IO events directly to Redux actions, ensuring all real-time updates flow through the store.

**Component Enhancement Strategy**: Existing components like `PlayerCard.tsx` get enhanced with real-time capabilities rather than complete rewrites, preserving existing functionality.

## Component Standards

### Component Template

```typescript
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { useRealTimeSession } from '@/hooks/useRealTimeSession';
import { selectPlayersForSession } from '@/store/selectors/playerSelectors';
import { RootState } from '@/store';
import { MvpPlayer } from '@/services/mvpApiService';

interface RealTimePlayerListProps {
  sessionId: string;
  onPlayerUpdate?: (player: MvpPlayer) => void;
  enableOptimisticUpdates?: boolean;
  refreshInterval?: number; // Fallback polling interval (ms)
}

export const RealTimePlayerList: React.FC<RealTimePlayerListProps> = memo(({
  sessionId,
  onPlayerUpdate,
  enableOptimisticUpdates = true,
  refreshInterval = 30000
}) => {
  // Real-time session hook handles Socket.IO connection and fallback polling
  const { 
    isConnected, 
    lastUpdated, 
    connectionStatus,
    manualRefresh 
  } = useRealTimeSession({
    sessionId,
    fallbackInterval: refreshInterval,
    enableOptimisticUpdates
  });

  // Memoized selector prevents unnecessary re-renders
  const players = useSelector((state: RootState) => 
    selectPlayersForSession(state, sessionId)
  );

  // Handle real-time player updates
  React.useEffect(() => {
    if (onPlayerUpdate && players.length > 0) {
      // Only trigger callback on actual changes, not initial load
      players.forEach(onPlayerUpdate);
    }
  }, [players, onPlayerUpdate]);

  const styles = getStyles();

  return (
    <View style={styles.container}>
      {/* Connection status indicator */}
      {!isConnected && (
        <ConnectionStatusBadge 
          status={connectionStatus}
          onRetry={manualRefresh}
        />
      )}
      
      {/* Player list with real-time updates */}
      <PlayerList 
        players={players}
        isRealTime={true}
        lastUpdated={lastUpdated}
      />
    </View>
  );
});

// Performance optimization: only re-render when props actually change
RealTimePlayerList.displayName = 'RealTimePlayerList';

const getStyles = () => StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default RealTimePlayerList;
```

### Naming Conventions

**Component Files:**
- Real-time components: `ComponentName.realtime.tsx`
- Hook files: `useFeatureName.ts` 
- Service files: `featureNameService.ts`
- Selector files: `featureNameSelectors.ts`

**Component Props:**
- Real-time props prefixed with `realTime` or `rt`: `realTimeEnabled`, `rtUpdateInterval`
- Callback props: `onPlayerUpdate`, `onConnectionChange`, `onSyncError`
- Configuration props: `enableOptimisticUpdates`, `fallbackInterval`, `maxRetries`

**State Management:**
- Real-time actions: `realtimeSlice/playerJoined`, `realtimeSlice/connectionLost`
- Socket events: `SOCKET_PLAYER_JOINED`, `SOCKET_SESSION_UPDATED`
- Selector naming: `selectRealTimeStatus`, `selectPlayersForSession`

**File Organization:**
- Real-time hooks: `/hooks/realtime/`
- Socket-related: `/services/socket/`
- Real-time selectors: `/store/selectors/realtime/`

## State Management

### Store Structure

```
store/
├── index.ts                    # Enhanced store with real-time middleware
├── middleware/
│   ├── socketMiddleware.ts     # Socket.IO event → Redux action bridge
│   └── realTimeMiddleware.ts   # Auto-refresh orchestration
├── slices/
│   ├── sessionSlice.ts         # Enhanced with real-time session updates
│   ├── playerSlice.ts          # Enhanced with real-time player updates
│   ├── realTimeSlice.ts        # Connection status and sync state
│   └── notificationSlice.ts    # Real-time notification management
└── selectors/
    ├── sessionSelectors.ts     # Memoized session data queries
    ├── playerSelectors.ts      # Optimized player list selectors
    └── realTimeSelectors.ts    # Connection and sync status selectors
```

### State Management Template

```typescript
// store/slices/realTimeSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MvpSession, MvpPlayer } from '@/services/mvpApiService';

interface RealTimeState {
  // Connection management
  socketConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastConnectionError: string | null;
  reconnectAttempts: number;
  
  // Auto-refresh state
  activeSessions: Set<string>; // Session IDs being actively refreshed
  lastUpdated: Record<string, string>; // sessionId → timestamp
  updateErrors: Record<string, string>; // sessionId → error message
  
  // Optimistic updates tracking
  pendingUpdates: Record<string, {
    type: 'player_join' | 'player_leave' | 'status_change';
    playerId: string;
    sessionId: string;
    timestamp: string;
  }[]>;
  
  // Fallback polling state
  pollingEnabled: Record<string, boolean>; // sessionId → enabled
  pollingIntervals: Record<string, number>; // sessionId → interval ID
}

const initialState: RealTimeState = {
  socketConnected: false,
  connectionStatus: 'disconnected',
  lastConnectionError: null,
  reconnectAttempts: 0,
  activeSessions: new Set(),
  lastUpdated: {},
  updateErrors: {},
  pendingUpdates: {},
  pollingEnabled: {},
  pollingIntervals: {},
};

const realTimeSlice = createSlice({
  name: 'realTime',
  initialState,
  reducers: {
    // Socket connection actions
    socketConnected: (state) => {
      state.socketConnected = true;
      state.connectionStatus = 'connected';
      state.lastConnectionError = null;
      state.reconnectAttempts = 0;
    },
    
    socketDisconnected: (state, action: PayloadAction<{ error?: string }>) => {
      state.socketConnected = false;
      state.connectionStatus = 'disconnected';
      state.lastConnectionError = action.payload.error || null;
    },
    
    socketReconnecting: (state) => {
      state.connectionStatus = 'reconnecting';
      state.reconnectAttempts += 1;
    },
    
    // Session auto-refresh management
    startAutoRefresh: (state, action: PayloadAction<{ sessionId: string }>) => {
      state.activeSessions.add(action.payload.sessionId);
      state.updateErrors[action.payload.sessionId] = '';
    },
    
    stopAutoRefresh: (state, action: PayloadAction<{ sessionId: string }>) => {
      state.activeSessions.delete(action.payload.sessionId);
      delete state.lastUpdated[action.payload.sessionId];
      delete state.updateErrors[action.payload.sessionId];
      delete state.pendingUpdates[action.payload.sessionId];
    },
    
    // Real-time update tracking
    sessionUpdated: (state, action: PayloadAction<{ 
      sessionId: string; 
      timestamp: string;
      source: 'socket' | 'polling' | 'manual';
    }>) => {
      const { sessionId, timestamp } = action.payload;
      state.lastUpdated[sessionId] = timestamp;
      state.updateErrors[sessionId] = '';
      
      // Clear any pending optimistic updates for this session
      delete state.pendingUpdates[sessionId];
    },
    
    updateError: (state, action: PayloadAction<{ 
      sessionId: string; 
      error: string 
    }>) => {
      const { sessionId, error } = action.payload;
      state.updateErrors[sessionId] = error;
    },
    
    // Optimistic updates
    addOptimisticUpdate: (state, action: PayloadAction<{
      sessionId: string;
      update: {
        type: 'player_join' | 'player_leave' | 'status_change';
        playerId: string;
        timestamp: string;
      };
    }>) => {
      const { sessionId, update } = action.payload;
      if (!state.pendingUpdates[sessionId]) {
        state.pendingUpdates[sessionId] = [];
      }
      state.pendingUpdates[sessionId].push({
        ...update,
        sessionId,
      });
    },
    
    // Fallback polling management
    enablePolling: (state, action: PayloadAction<{ 
      sessionId: string; 
      intervalId: number 
    }>) => {
      const { sessionId, intervalId } = action.payload;
      state.pollingEnabled[sessionId] = true;
      state.pollingIntervals[sessionId] = intervalId;
    },
    
    disablePolling: (state, action: PayloadAction<{ sessionId: string }>) => {
      const { sessionId } = action.payload;
      state.pollingEnabled[sessionId] = false;
      delete state.pollingIntervals[sessionId];
    },
  },
});

export const {
  socketConnected,
  socketDisconnected,
  socketReconnecting,
  startAutoRefresh,
  stopAutoRefresh,
  sessionUpdated,
  updateError,
  addOptimisticUpdate,
  enablePolling,
  disablePolling,
} = realTimeSlice.actions;

export default realTimeSlice.reducer;

// Selectors with memoization
export const selectRealTimeStatus = (state: RootState) => ({
  connected: state.realTime.socketConnected,
  status: state.realTime.connectionStatus,
  error: state.realTime.lastConnectionError,
  reconnectAttempts: state.realTime.reconnectAttempts,
});

export const selectSessionAutoRefreshStatus = (state: RootState, sessionId: string) => ({
  isActive: state.realTime.activeSessions.has(sessionId),
  lastUpdated: state.realTime.lastUpdated[sessionId],
  error: state.realTime.updateErrors[sessionId],
  pendingUpdates: state.realTime.pendingUpdates[sessionId] || [],
  pollingEnabled: state.realTime.pollingEnabled[sessionId] || false,
});
```

**Key Architecture Patterns:**

**Socket-Redux Bridge**: `socketMiddleware.ts` listens to Socket.IO events and dispatches corresponding Redux actions, maintaining single source of truth.

**Optimistic Updates**: Pending changes are tracked separately from confirmed server state, allowing instant UI feedback with rollback capability.

**Hybrid Sync Strategy**: Combines real-time Socket.IO with fallback polling, automatically switching based on connection status.

**Session-Scoped Management**: Each session's auto-refresh state is tracked independently, allowing multiple sessions with different refresh strategies.

## API Integration

### Service Template

```typescript
// services/realTimeService.ts
import { store } from '@/store';
import { socketService } from './socketService';
import { mvpApiService } from './mvpApiService';
import { 
  startAutoRefresh, 
  stopAutoRefresh, 
  sessionUpdated, 
  updateError,
  addOptimisticUpdate 
} from '@/store/slices/realTimeSlice';
import { updateSession } from '@/store/slices/sessionSlice';
import { updatePlayers } from '@/store/slices/playerSlice';
import { MvpSession, MvpPlayer } from './mvpApiService';

export interface RealTimeServiceConfig {
  fallbackPollingInterval: number;
  maxReconnectAttempts: number;
  optimisticUpdateTimeout: number;
}

class RealTimeService {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: RealTimeServiceConfig = {
    fallbackPollingInterval: 30000, // 30 seconds
    maxReconnectAttempts: 5,
    optimisticUpdateTimeout: 5000, // 5 seconds
  };

  constructor(config?: Partial<RealTimeServiceConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.setupSocketListeners();
  }

  // Start auto-refresh for a session
  async startSessionAutoRefresh(sessionId: string): Promise<void> {
    try {
      // Dispatch action to track this session
      store.dispatch(startAutoRefresh({ sessionId }));

      // Try to connect via Socket.IO first
      if (await this.connectSocket()) {
        await socketService.joinSession(sessionId);
        console.log(`🔄 Real-time auto-refresh started for session: ${sessionId}`);
      } else {
        // Fall back to polling
        this.startFallbackPolling(sessionId);
        console.log(`📊 Fallback polling started for session: ${sessionId}`);
      }

      // Initial data fetch
      await this.fetchSessionData(sessionId);
    } catch (error) {
      console.error('Failed to start auto-refresh:', error);
      store.dispatch(updateError({ 
        sessionId, 
        error: `Failed to start auto-refresh: ${error.message}` 
      }));
      
      // Start polling as fallback
      this.startFallbackPolling(sessionId);
    }
  }

  // Stop auto-refresh for a session
  stopSessionAutoRefresh(sessionId: string): void {
    // Stop Socket.IO updates
    if (socketService.getCurrentSession() === sessionId) {
      socketService.leaveSession();
    }

    // Stop polling if active
    this.stopFallbackPolling(sessionId);

    // Clean up Redux state
    store.dispatch(stopAutoRefresh({ sessionId }));
    
    console.log(`⏹️ Auto-refresh stopped for session: ${sessionId}`);
  }

  // Manual refresh with optimistic updates
  async refreshSession(sessionId: string, optimistic: boolean = false): Promise<MvpSession> {
    const startTime = Date.now();
    
    try {
      // Optimistic update: show loading state immediately
      if (optimistic) {
        store.dispatch(addOptimisticUpdate({
          sessionId,
          update: {
            type: 'player_join', // Generic update type
            playerId: 'system',
            timestamp: new Date().toISOString(),
          }
        }));
      }

      // Fetch fresh data
      const response = await mvpApiService.getSessionByShareCode(sessionId);
      
      if (response.success && response.data?.session) {
        const session = response.data.session;
        
        // Update Redux store
        store.dispatch(updateSession(session));
        store.dispatch(updatePlayers(session.players));
        store.dispatch(sessionUpdated({
          sessionId,
          timestamp: new Date().toISOString(),
          source: 'manual'
        }));

        // Performance tracking
        const refreshTime = Date.now() - startTime;
        if (refreshTime > 1000) {
          console.warn(`⚠️ Manual refresh took ${refreshTime}ms (target: <1000ms)`);
        }

        return session;
      } else {
        throw new Error(response.message || 'Failed to fetch session data');
      }
    } catch (error) {
      store.dispatch(updateError({ 
        sessionId, 
        error: `Refresh failed: ${error.message}` 
      }));
      throw error;
    }
  }

  // Optimistic player join (instant UI feedback)
  async optimisticPlayerJoin(sessionId: string, playerName: string): Promise<void> {
    const tempPlayerId = `temp_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Immediately show player in UI
    store.dispatch(addOptimisticUpdate({
      sessionId,
      update: {
        type: 'player_join',
        playerId: tempPlayerId,
        timestamp,
      }
    }));

    // Add temporary player to store
    const tempPlayer: MvpPlayer = {
      id: tempPlayerId,
      name: playerName,
      status: 'ACTIVE',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      joinedAt: timestamp,
    };

    store.dispatch(updatePlayers([tempPlayer]));

    try {
      // Send to server
      const deviceId = await mvpApiService.getDeviceId();
      const response = await mvpApiService.joinSession(sessionId, {
        name: playerName,
        deviceId,
      });

      if (response.success) {
        // Replace optimistic update with real data
        await this.fetchSessionData(sessionId);
      } else {
        throw new Error(response.message || 'Join failed');
      }
    } catch (error) {
      // Rollback optimistic update
      this.rollbackOptimisticUpdate(sessionId, tempPlayerId);
      throw error;
    }
  }

  private async connectSocket(): Promise<boolean> {
    try {
      await socketService.connect();
      return socketService.isConnected();
    } catch (error) {
      console.error('Socket connection failed:', error);
      return false;
    }
  }

  private setupSocketListeners(): void {
    // Listen for session updates
    socketService.on('mvp-session-updated', (data) => {
      const { session, timestamp } = data;
      
      // Update Redux store with real-time data
      store.dispatch(updateSession(session));
      store.dispatch(updatePlayers(session.players));
      store.dispatch(sessionUpdated({
        sessionId: session.shareCode,
        timestamp,
        source: 'socket'
      }));

      console.log(`🔄 Real-time update received for session: ${session.shareCode}`);
    });

    // Handle socket errors
    socketService.on('error', (error) => {
      console.error('Socket error:', error);
      
      // Get current session from Redux state
      const state = store.getState();
      const activeSessions = Array.from(state.realTime.activeSessions);
      
      // Start fallback polling for all active sessions
      activeSessions.forEach(sessionId => {
        this.startFallbackPolling(sessionId);
      });
    });
  }

  private async fetchSessionData(sessionId: string): Promise<void> {
    try {
      const response = await mvpApiService.getSessionByShareCode(sessionId);
      
      if (response.success && response.data?.session) {
        const session = response.data.session;
        
        store.dispatch(updateSession(session));
        store.dispatch(updatePlayers(session.players));
        store.dispatch(sessionUpdated({
          sessionId,
          timestamp: new Date().toISOString(),
          source: 'polling'
        }));
      }
    } catch (error) {
      console.error(`Failed to fetch session data: ${sessionId}`, error);
      store.dispatch(updateError({ sessionId, error: error.message }));
    }
  }

  private startFallbackPolling(sessionId: string): void {
    // Clear any existing interval
    this.stopFallbackPolling(sessionId);

    const interval = setInterval(() => {
      this.fetchSessionData(sessionId);
    }, this.config.fallbackPollingInterval);

    this.pollingIntervals.set(sessionId, interval);
  }

  private stopFallbackPolling(sessionId: string): void {
    const interval = this.pollingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(sessionId);
    }
  }

  private rollbackOptimisticUpdate(sessionId: string, playerId: string): void {
    // Remove temporary player and optimistic update
    // This would require additional Redux actions to handle rollbacks
    console.log(`🔄 Rolling back optimistic update for player: ${playerId}`);
  }
}

// Export singleton instance
export const realTimeService = new RealTimeService({
  fallbackPollingInterval: 15000, // 15 seconds for better responsiveness
  maxReconnectAttempts: 3,
  optimisticUpdateTimeout: 3000, // 3 seconds
});

export default realTimeService;
```

### API Client Configuration

```typescript
// services/apiClient.config.ts
import NetInfo from '@react-native-community/netinfo';
import { store } from '@/store';
import { socketConnected, socketDisconnected } from '@/store/slices/realTimeSlice';

export class RealTimeApiClient {
  private static instance: RealTimeApiClient;
  private networkState: any = null;

  constructor() {
    this.setupNetworkMonitoring();
  }

  static getInstance(): RealTimeApiClient {
    if (!RealTimeApiClient.instance) {
      RealTimeApiClient.instance = new RealTimeApiClient();
    }
    return RealTimeApiClient.instance;
  }

  private setupNetworkMonitoring(): void {
    // Monitor network state for auto-refresh strategies
    NetInfo.addEventListener(state => {
      this.networkState = state;
      
      if (state.isConnected && state.isInternetReachable) {
        // Network restored - attempt Socket.IO reconnection
        this.handleNetworkRestore();
      } else {
        // Network lost - switch to offline mode
        this.handleNetworkLost();
      }
    });
  }

  private handleNetworkRestore(): void {
    console.log('📶 Network restored - reconnecting real-time services');
    store.dispatch(socketConnected());
    
    // Trigger reconnection for all active sessions
    const state = store.getState();
    const activeSessions = Array.from(state.realTime.activeSessions);
    
    activeSessions.forEach(sessionId => {
      realTimeService.startSessionAutoRefresh(sessionId);
    });
  }

  private handleNetworkLost(): void {
    console.log('📴 Network lost - switching to offline mode');
    store.dispatch(socketDisconnected({ error: 'Network unavailable' }));
  }

  // Enhanced request with real-time considerations
  async requestWithRealTimeHandling<T>(
    url: string,
    options: RequestInit,
    sessionId?: string
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: 5000, // Shorter timeout for real-time requests
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      // If this was for a specific session, mark it for fallback polling
      if (sessionId) {
        store.dispatch(updateError({ 
          sessionId, 
          error: `API request failed: ${error.message}` 
        }));
      }
      
      throw error;
    }
  }
}
```

## Routing

### Route Configuration

```typescript
// navigation/RealTimeNavigator.tsx
import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { realTimeService } from '@/services/realTimeService';
import { selectCurrentSessionId } from '@/store/selectors/sessionSelectors';
import { selectRealTimeStatus } from '@/store/slices/realTimeSlice';

// Enhanced navigation params with real-time context
export type RootStackParamList = {
  SessionDetail: { 
    sessionId: string; 
    shareCode: string;
    enableAutoRefresh?: boolean;
    refreshInterval?: number;
  };
  SessionOverview: { 
    sessionId: string;
    autoRefreshEnabled?: boolean;
  };
  PlayerList: { 
    sessionId: string;
    realTimeMode?: 'socket' | 'polling' | 'manual';
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Screen wrapper with auto-refresh lifecycle management
export const withRealTimeSession = <P extends object>(
  ScreenComponent: React.ComponentType<P>,
  options: {
    autoRefreshEnabled?: boolean;
    refreshInterval?: number;
    suspendOnBlur?: boolean;
  } = {}
) => {
  return (props: P & { route: any }) => {
    const dispatch = useDispatch();
    const sessionId = props.route?.params?.sessionId;
    const realTimeStatus = useSelector(selectRealTimeStatus);

    // Start auto-refresh when screen focuses
    useFocusEffect(
      React.useCallback(() => {
        if (sessionId && options.autoRefreshEnabled !== false) {
          console.log(`🎯 Starting auto-refresh for focused session: ${sessionId}`);
          realTimeService.startSessionAutoRefresh(sessionId);

          // Cleanup when screen unfocuses
          return () => {
            if (options.suspendOnBlur !== false) {
              console.log(`⏸️ Suspending auto-refresh for unfocused session: ${sessionId}`);
              realTimeService.stopSessionAutoRefresh(sessionId);
            }
          };
        }
      }, [sessionId])
    );

    // Handle app state changes (background/foreground)
    useEffect(() => {
      const handleAppStateChange = (nextAppState: string) => {
        if (sessionId) {
          if (nextAppState === 'background' && options.suspendOnBlur !== false) {
            // Suspend real-time updates when app goes to background
            realTimeService.stopSessionAutoRefresh(sessionId);
          } else if (nextAppState === 'active' && options.autoRefreshEnabled !== false) {
            // Resume real-time updates when app comes to foreground
            realTimeService.startSessionAutoRefresh(sessionId);
          }
        }
      };

      const subscription = require('react-native').AppState.addEventListener('change', handleAppStateChange);
      return () => subscription?.remove();
    }, [sessionId]);

    return <ScreenComponent {...props} />;
  };
};

// Enhanced SessionDetailScreen with auto-refresh
const SessionDetailScreen = withRealTimeSession(
  ({ route, navigation }) => {
    const { sessionId, shareCode, enableAutoRefresh = true } = route.params;
    const realTimeStatus = useSelector(selectRealTimeStatus);

    // Screen header with connection status
    React.useLayoutEffect(() => {
      navigation.setOptions({
        title: 'Session Details',
        headerRight: () => (
          <ConnectionStatusIndicator 
            status={realTimeStatus.status}
            onManualRefresh={() => realTimeService.refreshSession(sessionId, true)}
          />
        ),
      });
    }, [navigation, realTimeStatus.status, sessionId]);

    return (
      <SessionDetailView 
        sessionId={sessionId}
        shareCode={shareCode}
        realTimeEnabled={enableAutoRefresh}
      />
    );
  },
  { 
    autoRefreshEnabled: true,
    refreshInterval: 15000,
    suspendOnBlur: false, // Keep session active even when not focused
  }
);

// Route configuration with real-time considerations
export function RealTimeNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        gestureEnabled: true,
        // Optimize for real-time updates
        animation: 'slide_from_right',
        animationDuration: 200, // Faster transitions for responsive feel
      }}
    >
      <Stack.Screen 
        name="SessionDetail" 
        component={SessionDetailScreen}
        options={({ route }) => ({
          title: `Session ${route.params?.shareCode || ''}`,
          // Dynamic header based on real-time connection status
          headerStyle: {
            backgroundColor: route.params?.enableAutoRefresh ? '#e8f5e8' : '#f5f5f5'
          }
        })}
      />
      
      <Stack.Screen 
        name="SessionOverview" 
        component={withRealTimeSession(SessionOverviewScreen, {
          autoRefreshEnabled: true,
          suspendOnBlur: true, // Suspend when not actively viewing
        })}
        options={{
          title: 'Session Overview',
        }}
      />
      
      <Stack.Screen 
        name="PlayerList" 
        component={withRealTimeSession(PlayerListScreen, {
          autoRefreshEnabled: true,
          refreshInterval: 10000, // More frequent updates for player list
          suspendOnBlur: false,
        })}
        options={{
          title: 'Players',
        }}
      />
    </Stack.Navigator>
  );
}

// Deep linking configuration for shared sessions with auto-refresh
export const linkingConfig = {
  prefixes: ['badmintongroup://', 'https://badminton.app'],
  config: {
    screens: {
      SessionDetail: {
        path: '/session/:shareCode',
        parse: {
          shareCode: (shareCode: string) => shareCode,
        },
        stringify: {
          shareCode: (shareCode: string) => shareCode,
        },
        // Automatically enable auto-refresh for shared links
        initialParams: {
          enableAutoRefresh: true,
          refreshInterval: 15000,
        },
      },
    },
  },
};

// Navigation helpers for real-time context
export const navigateToSessionWithAutoRefresh = (
  navigation: any,
  sessionId: string,
  shareCode: string,
  options: {
    enableAutoRefresh?: boolean;
    refreshInterval?: number;
  } = {}
) => {
  navigation.navigate('SessionDetail', {
    sessionId,
    shareCode,
    enableAutoRefresh: options.enableAutoRefresh ?? true,
    refreshInterval: options.refreshInterval ?? 15000,
  });
};

// Connection status indicator component
const ConnectionStatusIndicator: React.FC<{
  status: string;
  onManualRefresh: () => void;
}> = ({ status, onManualRefresh }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'connected': return '#4CAF50';
      case 'connecting': return '#FF9800';
      case 'reconnecting': return '#FF9800';
      case 'disconnected': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <TouchableOpacity onPress={onManualRefresh} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View 
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: getStatusColor(),
          marginRight: 8,
        }}
      />
      {status === 'disconnected' && (
        <Text style={{ color: '#666', fontSize: 12 }}>Tap to refresh</Text>
      )}
    </TouchableOpacity>
  );
};
```

**Key Routing Features for Auto-Refresh:**

**Session Lifecycle Management**: The `withRealTimeSession` HOC automatically starts/stops auto-refresh based on screen focus and app state changes.

**Smart Background Handling**: Auto-refresh suspends when screens are unfocused or app is backgrounded to preserve battery and bandwidth.

**Deep Link Auto-Refresh**: Shared session links automatically enable auto-refresh for immediate real-time updates.

**Connection Status UI**: Navigation headers show real-time connection status with manual refresh fallback.

## Styling Guidelines

### Styling Approach

**Real-Time UI Design System**: The auto-refresh functionality requires specialized styling patterns that communicate connection status, update states, and provide clear feedback for real-time changes.

**Style Architecture**: Leveraging your existing React Native Elements + custom design system, enhanced with real-time specific components and animations.

### Global Theme Variables

```css
/* theme/realTimeTheme.css */
:root {
  /* Real-time Status Colors */
  --rt-connected: #4CAF50;
  --rt-connecting: #FF9800;
  --rt-reconnecting: #FFC107;
  --rt-disconnected: #F44336;
  --rt-error: #D32F2F;
  --rt-offline: #9E9E9E;
  
  /* Update State Colors */
  --rt-fresh-data: rgba(76, 175, 80, 0.1);
  --rt-stale-data: rgba(255, 152, 0, 0.1);
  --rt-updating: rgba(33, 150, 243, 0.1);
  --rt-error-state: rgba(244, 67, 54, 0.1);
  
  /* Animation Timings */
  --rt-pulse-duration: 2s;
  --rt-fade-duration: 300ms;
  --rt-slide-duration: 200ms;
  --rt-bounce-duration: 600ms;
  
  /* Real-time Component Spacing */
  --rt-indicator-size: 8px;
  --rt-badge-padding: 4px 8px;
  --rt-toast-padding: 12px 16px;
  --rt-loading-height: 2px;
  
  /* Z-index Hierarchy */
  --rt-connection-badge: 1000;
  --rt-toast-notification: 1100;
  --rt-loading-overlay: 900;
  
  /* Shadow Depths */
  --rt-subtle-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --rt-notification-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  --rt-overlay-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  
  /* Border Styles */
  --rt-border-radius: 4px;
  --rt-pill-radius: 12px;
  --rt-notification-radius: 8px;
  
  /* Typography */
  --rt-status-font: 10px;
  --rt-timestamp-font: 12px;
  --rt-notification-font: 14px;
  --rt-error-font: 13px;
}

/* Dark Mode Variables */
@media (prefers-color-scheme: dark) {
  :root {
    --rt-fresh-data: rgba(76, 175, 80, 0.2);
    --rt-stale-data: rgba(255, 152, 0, 0.2);
    --rt-updating: rgba(33, 150, 243, 0.2);
    --rt-error-state: rgba(244, 67, 54, 0.2);
    
    --rt-subtle-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    --rt-notification-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    --rt-overlay-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
}

/* Connection Status Animations */
@keyframes rt-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

@keyframes rt-connecting-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes rt-slide-in-toast {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes rt-fade-in-content {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes rt-loading-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Real-time Component Base Styles */
.rt-connection-indicator {
  width: var(--rt-indicator-size);
  height: var(--rt-indicator-size);
  border-radius: 50%;
  transition: all var(--rt-fade-duration) ease;
}

.rt-connection-indicator--connected {
  background-color: var(--rt-connected);
  animation: rt-pulse var(--rt-pulse-duration) infinite;
}

.rt-connection-indicator--connecting {
  background-color: var(--rt-connecting);
  animation: rt-connecting-spin 1s linear infinite;
}

.rt-connection-indicator--disconnected {
  background-color: var(--rt-disconnected);
  animation: none;
}

.rt-toast-notification {
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  padding: var(--rt-toast-padding);
  border-radius: var(--rt-notification-radius);
  box-shadow: var(--rt-notification-shadow);
  z-index: var(--rt-toast-notification);
  animation: rt-slide-in-toast var(--rt-slide-duration) ease-out;
}

.rt-toast-notification--player-joined {
  background-color: var(--rt-fresh-data);
  border-left: 4px solid var(--rt-connected);
}

.rt-toast-notification--player-left {
  background-color: var(--rt-stale-data);
  border-left: 4px solid var(--rt-connecting);
}

.rt-loading-bar {
  height: var(--rt-loading-height);
  background-color: var(--rt-updating);
  position: relative;
  overflow: hidden;
}

.rt-loading-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: rt-loading-shimmer 1.5s infinite;
}

.rt-player-card {
  transition: all var(--rt-fade-duration) ease;
}

.rt-player-card--fresh {
  background-color: var(--rt-fresh-data);
  border-left: 3px solid var(--rt-connected);
}

.rt-player-card--updating {
  background-color: var(--rt-updating);
  opacity: 0.8;
}

.rt-timestamp {
  font-size: var(--rt-timestamp-font);
  color: var(--rt-offline);
  font-style: italic;
}

/* Accessibility Enhancements */
@media (prefers-reduced-motion: reduce) {
  .rt-connection-indicator--connected {
    animation: none;
  }
  
  .rt-loading-bar::after {
    animation: none;
  }
  
  .rt-toast-notification {
    animation: none;
  }
}

/* High Contrast Mode */
@media (prefers-contrast: high) {
  :root {
    --rt-connected: #00C853;
    --rt-connecting: #FF6F00;
    --rt-disconnected: #D50000;
    --rt-error: #B71C1C;
  }
}

/* Battery-Conscious Animations */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Real-Time Styling Patterns:**

**Connection Status**: Visual indicators use consistent color coding with accessibility considerations for colorblind users.

**Update States**: Subtle background changes communicate data freshness without overwhelming the interface.

**Performance-First**: Animations are optimized for mobile performance with respect for user preferences (reduced motion, battery-conscious).

**Progressive Enhancement**: Base styles work without animations, with enhancements layered on top.

## Testing Requirements

### Component Test Template

```typescript
// __tests__/components/RealTimePlayerList.test.tsx
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { RealTimePlayerList } from '@/components/RealTimePlayerList';
import { realTimeService } from '@/services/realTimeService';
import { socketService } from '@/services/socketService';

// Mock services
jest.mock('@/services/realTimeService');
jest.mock('@/services/socketService');
jest.mock('@react-native-community/netinfo');

describe('RealTimePlayerList', () => {
  let store: any;
  let mockRealTimeService: jest.Mocked<typeof realTimeService>;
  let mockSocketService: jest.Mocked<typeof socketService>;

  beforeEach(() => {
    // Create test store with real-time state
    store = configureStore({
      reducer: {
        realTime: realTimeReducer,
        sessions: sessionReducer,
        players: playerReducer,
      },
      preloadedState: {
        realTime: {
          socketConnected: true,
          connectionStatus: 'connected',
          activeSessions: new Set(['test-session-1']),
          lastUpdated: { 'test-session-1': '2024-01-01T12:00:00Z' },
          updateErrors: {},
          pendingUpdates: {},
        },
        sessions: {
          'test-session-1': mockSession,
        },
        players: {
          'player-1': mockPlayer1,
          'player-2': mockPlayer2,
        },
      },
    });

    mockRealTimeService = realTimeService as jest.Mocked<typeof realTimeService>;
    mockSocketService = socketService as jest.Mocked<typeof socketService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real-time Connection Management', () => {
    it('should start auto-refresh when component mounts', async () => {
      render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      expect(mockRealTimeService.startSessionAutoRefresh).toHaveBeenCalledWith('test-session-1');
    });

    it('should stop auto-refresh when component unmounts', async () => {
      const { unmount } = render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      unmount();

      expect(mockRealTimeService.stopSessionAutoRefresh).toHaveBeenCalledWith('test-session-1');
    });

    it('should display connection status indicator', () => {
      render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      const connectionIndicator = screen.getByTestId('connection-status-indicator');
      expect(connectionIndicator).toHaveStyle({ backgroundColor: '#4CAF50' }); // connected color
    });

    it('should show manual refresh option when disconnected', () => {
      const disconnectedStore = configureStore({
        reducer: { realTime: realTimeReducer },
        preloadedState: {
          realTime: {
            ...store.getState().realTime,
            socketConnected: false,
            connectionStatus: 'disconnected',
          },
        },
      });

      render(
        <Provider store={disconnectedStore}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      expect(screen.getByText('Tap to refresh')).toBeVisible();
    });
  });

  describe('Real-time Updates', () => {
    it('should update player list when socket event received', async () => {
      render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      // Simulate socket event
      act(() => {
        const mockSessionUpdate = {
          session: {
            ...mockSession,
            players: [...mockSession.players, mockNewPlayer],
          },
          timestamp: '2024-01-01T12:01:00Z',
        };

        // Trigger socket event callback
        const socketCallback = mockSocketService.on.mock.calls.find(
          call => call[0] === 'mvp-session-updated'
        )[1];
        socketCallback(mockSessionUpdate);
      });

      await waitFor(() => {
        expect(screen.getByText('New Player')).toBeVisible();
      });
    });

    it('should show optimistic updates immediately', async () => {
      const { rerender } = render(
        <Provider store={store}>
          <RealTimePlayerList 
            sessionId="test-session-1" 
            enableOptimisticUpdates={true}
          />
        </Provider>
      );

      // Trigger optimistic player join
      act(() => {
        mockRealTimeService.optimisticPlayerJoin.mockResolvedValue();
        store.dispatch(addOptimisticUpdate({
          sessionId: 'test-session-1',
          update: {
            type: 'player_join',
            playerId: 'temp-player-123',
            timestamp: '2024-01-01T12:00:30Z',
          }
        }));
      });

      // Should show loading state immediately
      await waitFor(() => {
        expect(screen.getByTestId('optimistic-player-temp-player-123')).toBeVisible();
      });
    });

    it('should handle update errors gracefully', async () => {
      const errorStore = configureStore({
        reducer: { realTime: realTimeReducer },
        preloadedState: {
          realTime: {
            ...store.getState().realTime,
            updateErrors: { 'test-session-1': 'Failed to fetch updates' },
          },
        },
      });

      render(
        <Provider store={errorStore}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      expect(screen.getByText('Failed to fetch updates')).toBeVisible();
      expect(screen.getByText('Retry')).toBeVisible();
    });
  });

  describe('Performance Optimization', () => {
    it('should not re-render when unrelated state changes', () => {
      const spy = jest.spyOn(React, 'createElement');
      
      const { rerender } = render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      const initialRenderCount = spy.mock.calls.length;

      // Change unrelated state
      act(() => {
        store.dispatch({ type: 'UNRELATED_ACTION' });
      });

      rerender(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      // Should not trigger additional renders
      expect(spy.mock.calls.length).toBe(initialRenderCount);
    });

    it('should debounce rapid updates', async () => {
      const onPlayerUpdate = jest.fn();

      render(
        <Provider store={store}>
          <RealTimePlayerList 
            sessionId="test-session-1" 
            onPlayerUpdate={onPlayerUpdate}
          />
        </Provider>
      );

      // Simulate rapid updates
      act(() => {
        for (let i = 0; i < 10; i++) {
          store.dispatch(updatePlayers([{ ...mockPlayer1, status: `ACTIVE-${i}` }]));
        }
      });

      // Should debounce and only call once
      await waitFor(() => {
        expect(onPlayerUpdate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Network Resilience', () => {
    it('should switch to polling when socket disconnects', async () => {
      render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" refreshInterval={5000} />
        </Provider>
      );

      // Simulate socket disconnection
      act(() => {
        store.dispatch(socketDisconnected({ error: 'Network error' }));
      });

      await waitFor(() => {
        expect(mockRealTimeService.startFallbackPolling).toHaveBeenCalledWith('test-session-1');
      });
    });

    it('should resume socket connection when network restored', async () => {
      const disconnectedStore = configureStore({
        reducer: { realTime: realTimeReducer },
        preloadedState: {
          realTime: {
            ...store.getState().realTime,
            socketConnected: false,
          },
        },
      });

      render(
        <Provider store={disconnectedStore}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      // Simulate network restoration
      act(() => {
        disconnectedStore.dispatch(socketConnected());
      });

      await waitFor(() => {
        expect(mockRealTimeService.startSessionAutoRefresh).toHaveBeenCalledWith('test-session-1');
      });
    });
  });

  describe('Accessibility', () => {
    it('should announce real-time updates to screen readers', async () => {
      render(
        <Provider store={store}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      // Simulate player joining
      act(() => {
        store.dispatch(updatePlayers([...mockSession.players, mockNewPlayer]));
      });

      await waitFor(() => {
        const announcement = screen.getByLabelText('New Player joined the session');
        expect(announcement).toBeVisible();
      });
    });

    it('should provide keyboard navigation for manual refresh', () => {
      const disconnectedStore = configureStore({
        reducer: { realTime: realTimeReducer },
        preloadedState: {
          realTime: {
            ...store.getState().realTime,
            socketConnected: false,
          },
        },
      });

      render(
        <Provider store={disconnectedStore}>
          <RealTimePlayerList sessionId="test-session-1" />
        </Provider>
      );

      const refreshButton = screen.getByRole('button', { name: 'Manual refresh' });
      expect(refreshButton).toHaveAccessibilityState({ disabled: false });
    });
  });
});

// Integration tests
describe('RealTimePlayerList Integration', () => {
  it('should handle complete socket reconnection flow', async () => {
    // This test verifies the entire flow from disconnection to reconnection
    // with fallback polling and data synchronization
  });

  it('should maintain data consistency during rapid updates', async () => {
    // This test ensures data integrity during high-frequency updates
  });
});

// Performance tests
describe('RealTimePlayerList Performance', () => {
  it('should handle 50+ rapid updates without performance degradation', async () => {
    // Performance benchmark test
  });

  it('should cleanup properly to prevent memory leaks', async () => {
    // Memory leak detection test
  });
});
```

### Testing Best Practices

**Real-Time Testing Strategy:**
1. **Unit Tests**: Test individual real-time components in isolation with mocked services
2. **Integration Tests**: Test Socket.IO → Redux → Component data flow end-to-end
3. **Performance Tests**: Benchmark update frequency and memory usage under load
4. **Network Simulation Tests**: Test fallback behavior during connection issues
5. **Accessibility Tests**: Ensure screen readers announce real-time updates properly
6. **Battery Impact Tests**: Monitor power consumption during extended auto-refresh sessions

**Mock Strategy**: Mock Socket.IO and API services while preserving Redux state management for realistic component behavior testing.

**Test Data Management**: Use consistent mock data that reflects real session/player structures for reliable test outcomes.

## Environment Configuration

```bash
# .env.development
# Backend API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
EXPO_PUBLIC_SOCKET_URL=http://localhost:3001

# Real-time Configuration
EXPO_PUBLIC_SOCKET_RECONNECT_ATTEMPTS=5
EXPO_PUBLIC_SOCKET_RECONNECT_DELAY=1000
EXPO_PUBLIC_FALLBACK_POLLING_INTERVAL=30000
EXPO_PUBLIC_OPTIMISTIC_UPDATE_TIMEOUT=5000

# Performance Tuning
EXPO_PUBLIC_MAX_CONCURRENT_SESSIONS=3
EXPO_PUBLIC_UPDATE_DEBOUNCE_MS=500
EXPO_PUBLIC_BACKGROUND_SYNC_ENABLED=true

# Development Features
EXPO_PUBLIC_ENABLE_SOCKET_LOGGING=true
EXPO_PUBLIC_ENABLE_PERFORMANCE_MONITORING=true
EXPO_PUBLIC_MOCK_SLOW_NETWORK=false

# .env.production
# Backend API Configuration  
EXPO_PUBLIC_API_URL=https://api.badmintongroup.com/api/v1
EXPO_PUBLIC_SOCKET_URL=https://api.badmintongroup.com

# Real-time Configuration (Production-optimized)
EXPO_PUBLIC_SOCKET_RECONNECT_ATTEMPTS=3
EXPO_PUBLIC_SOCKET_RECONNECT_DELAY=2000
EXPO_PUBLIC_FALLBACK_POLLING_INTERVAL=60000
EXPO_PUBLIC_OPTIMISTIC_UPDATE_TIMEOUT=3000

# Performance Tuning
EXPO_PUBLIC_MAX_CONCURRENT_SESSIONS=2
EXPO_PUBLIC_UPDATE_DEBOUNCE_MS=1000
EXPO_PUBLIC_BACKGROUND_SYNC_ENABLED=false

# Production Features
EXPO_PUBLIC_ENABLE_SOCKET_LOGGING=false
EXPO_PUBLIC_ENABLE_PERFORMANCE_MONITORING=true
EXPO_PUBLIC_MOCK_SLOW_NETWORK=false

# .env.test
# Test Environment Configuration
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
EXPO_PUBLIC_SOCKET_URL=http://localhost:3001

# Test-specific Settings
EXPO_PUBLIC_SOCKET_RECONNECT_ATTEMPTS=1
EXPO_PUBLIC_SOCKET_RECONNECT_DELAY=100
EXPO_PUBLIC_FALLBACK_POLLING_INTERVAL=1000
EXPO_PUBLIC_OPTIMISTIC_UPDATE_TIMEOUT=100

# Testing Features
EXPO_PUBLIC_ENABLE_SOCKET_LOGGING=true
EXPO_PUBLIC_ENABLE_PERFORMANCE_MONITORING=false
EXPO_PUBLIC_MOCK_SLOW_NETWORK=true
```

## Frontend Developer Standards

### Critical Coding Rules

1. **Real-time State Management**
   - NEVER directly mutate Redux state - always use RTK actions
   - ALWAYS use memoized selectors for frequently updated real-time data
   - NEVER store Socket.IO instances in component state - use service layer only

2. **Socket.IO Integration**
   - ALWAYS handle socket disconnection gracefully with fallback polling
   - NEVER emit socket events directly from components - use service layer
   - ALWAYS cleanup socket listeners in useEffect cleanup functions

3. **Performance Optimization**
   - ALWAYS use React.memo for components that receive real-time data
   - NEVER render large lists without virtualization during auto-refresh
   - ALWAYS debounce rapid state updates to prevent UI thrashing

4. **Error Handling**
   - ALWAYS provide fallback UI states for connection failures
   - NEVER let socket errors crash the app - catch and log appropriately
   - ALWAYS show user-friendly error messages with retry options

5. **Network Efficiency**
   - ALWAYS suspend auto-refresh when app is backgrounded
   - NEVER poll more frequently than 10 seconds without user consent
   - ALWAYS batch multiple rapid updates into single renders

### Quick Reference

```bash
# Development Commands
npm start                    # Start Expo dev server
npm run ios                  # Run iOS simulator (with auto-refresh)
npm run android             # Run Android emulator (with auto-refresh)

# Testing Real-time Features  
npm run test:realtime       # Run real-time specific tests
npm run test:socket         # Test Socket.IO integration
npm run test:performance    # Performance benchmarks

# Debug Commands
npm run debug:socket        # Enable Socket.IO debug logging
npm run debug:redux         # Enable Redux DevTools
npm run debug:network       # Monitor network requests

# Build Commands
npm run build               # Production build with optimized real-time
npm run build:analyze       # Bundle analysis including Socket.IO
```

**Key Import Patterns:**
```typescript
// Services
import { realTimeService } from '@/services/realTimeService';
import { socketService } from '@/services/socketService';

// Hooks
import { useRealTimeSession } from '@/hooks/useRealTimeSession';
import { useSocketConnection } from '@/hooks/useSocketConnection';

// Redux
import { useSelector, useDispatch } from 'react-redux';
import { selectRealTimeStatus } from '@/store/slices/realTimeSlice';
```

**File Naming Conventions:**
- Real-time components: `ComponentName.realtime.tsx`
- Socket services: `socketService.ts`, `realTimeService.ts`
- Real-time hooks: `useRealTime*.ts`
- Real-time tests: `*.realtime.test.tsx`

**Project-Specific Patterns:**
- Use `mvpApiService` for all session/player API calls
- Leverage existing `StorageService` for offline caching
- Follow existing Redux pattern with RTK slices
- Use React Native Elements for consistent UI components