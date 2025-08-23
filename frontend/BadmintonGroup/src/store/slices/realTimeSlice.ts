import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MvpSession, MvpPlayer } from '../../services/mvpApiService';

interface RealTimeState {
  // Connection management
  socketConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastConnectionError: string | null;
  reconnectAttempts: number;
  
  // Auto-refresh state
  activeSessions: string[]; // Session IDs being actively refreshed
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
  activeSessions: [],
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
      if (!state.activeSessions.includes(action.payload.sessionId)) {
        state.activeSessions.push(action.payload.sessionId);
      }
      state.updateErrors[action.payload.sessionId] = '';
    },
    
    stopAutoRefresh: (state, action: PayloadAction<{ sessionId: string }>) => {
      state.activeSessions = state.activeSessions.filter(id => id !== action.payload.sessionId);
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

// Selectors
export const selectRealTimeStatus = (state: { realTime: RealTimeState }) => ({
  connected: state.realTime.socketConnected,
  status: state.realTime.connectionStatus,
  error: state.realTime.lastConnectionError,
  reconnectAttempts: state.realTime.reconnectAttempts,
});

export const selectSessionAutoRefreshStatus = (state: { realTime: RealTimeState }, sessionId: string) => ({
  isActive: state.realTime.activeSessions.includes(sessionId),
  lastUpdated: state.realTime.lastUpdated[sessionId],
  error: state.realTime.updateErrors[sessionId],
  pendingUpdates: state.realTime.pendingUpdates[sessionId] || [],
  pollingEnabled: state.realTime.pollingEnabled[sessionId] || false,
});