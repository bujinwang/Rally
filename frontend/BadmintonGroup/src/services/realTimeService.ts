// @ts-nocheck
import { store } from '../store';
import socketService from './socketService';
import { mvpApiService } from './mvpApiService';
import {
  startAutoRefresh,
  stopAutoRefresh,
  sessionUpdated,
  updateError,
  addOptimisticUpdate,
  socketConnected,
  socketDisconnected,
  socketReconnecting,
} from '../store/slices/realTimeSlice';
import { setCurrentSession } from '../store/slices/sessionSlice';
import { setPlayers } from '../store/slices/playerSlice';
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
  private isInitialized = false;

  constructor(config?: Partial<RealTimeServiceConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // Initialize socket listeners (call once)
  initialize(): void {
    if (this.isInitialized) return;
    
    this.setupSocketListeners();
    this.isInitialized = true;
    console.log('🔄 RealTimeService initialized');
  }

  // Start auto-refresh for a session
  async startSessionAutoRefresh(sessionId: string): Promise<void> {
    try {
      console.log(`🎯 Starting auto-refresh for session: ${sessionId}`);
      
      // Initialize if needed
      this.initialize();
      
      // Dispatch action to track this session
      store.dispatch(startAutoRefresh({ sessionId }));

      // Try to connect via Socket.IO first
      if (await this.connectSocket()) {
        // Join the session room to receive real-time updates
        try {
          // For real-time updates, we just need to join the session room
          if (socketService.isConnected()) {
            socketService.emit('join-session', sessionId);
            console.log(`🔄 Real-time auto-refresh started for session: ${sessionId}`);
            console.log(`🔥 DEBUG: Successfully joined session room: ${sessionId}`);
          } else {
            console.log(`🔥 DEBUG: Socket not connected, cannot join session room: ${sessionId}`);
          }
        } catch (error: any) {
          console.warn('Failed to join session room:', error);
        }
      } else {
        // Fall back to polling
        this.startFallbackPolling(sessionId);
        console.log(`📊 Fallback polling started for session: ${sessionId}`);
      }

      // Initial data fetch
      await this.fetchSessionData(sessionId);
    } catch (error: any) {
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
    console.log(`⏹️ Stopping auto-refresh for session: ${sessionId}`);
    
    // Stop Socket.IO updates
    // Leave the session room if connected
    if (socketService.isConnected()) {
      try {
        socketService.emit('leave-session', sessionId);
        console.log(`📤 Left session room: ${sessionId}`);
      } catch (error: any) {
        console.warn('Failed to leave session room:', error);
      }
    }

    // Stop polling if active
    this.stopFallbackPolling(sessionId);

    // Clean up Redux state
    store.dispatch(stopAutoRefresh({ sessionId }));
  }

  // Manual refresh with optimistic updates
  async refreshSession(sessionId: string, optimistic: boolean = false): Promise<MvpSession | null> {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Manual refresh for session: ${sessionId}`);
      
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
        
        // Update Redux store would happen here if we had session/player actions
        // For now, we'll just dispatch the update timestamp
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
    } catch (error: any) {
      console.error('Manual refresh failed:', error);
      store.dispatch(updateError({ 
        sessionId, 
        error: `Refresh failed: ${error.message}` 
      }));
      throw error;
    }
  }

  private async connectSocket(): Promise<boolean> {
    try {
      store.dispatch(socketReconnecting());
      socketService.connect();
      
      // Give a small delay to allow connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const isConnected = socketService.isConnected();
      
      if (isConnected) {
        store.dispatch(socketConnected());
      } else {
        store.dispatch(socketDisconnected({ error: 'Failed to establish connection' }));
      }
      
      return isConnected;
    } catch (error: any) {
      console.error('Socket connection failed:', error);
      store.dispatch(socketDisconnected({ error: error.message }));
      return false;
    }
  }

  private setupSocketListeners(): void {
    console.log('📡 Setting up socket listeners for real-time updates');
    
    // Debug: Listen for ALL socket events to see what's being received
    socketService.on('connect', () => {
      console.log('🔥 DEBUG: Socket connected event received');
    });
    
    socketService.on('disconnect', () => {
      console.log('🔥 DEBUG: Socket disconnected event received');
    });
    
    // Listen for session updates
    socketService.on('mvp-session-updated', (data) => {
      console.log('🔥 DEBUG: mvp-session-updated event received:', data);
      const { session, timestamp } = data;
      
      console.log(`🔄 Real-time update received for session: ${session.shareCode}`, {
        playerCount: session.players?.length || 0,
        players: session.players?.map(p => p.name) || []
      });
      
      // Dispatch session updated to mark timestamp
      store.dispatch(sessionUpdated({
        sessionId: session.shareCode,
        timestamp,
        source: 'socket'
      }));

      // Emit DeviceEventEmitter event to trigger UI refresh
      try {
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('sessionDataUpdated', {
          session,
          sessionId: session.shareCode
        });
        console.log(`📱 DeviceEventEmitter: Emitted sessionDataUpdated for ${session.shareCode}`);
      } catch (error: any) {
        console.log('DeviceEventEmitter not available:', error.message);
      }
    });

    // Handle socket errors
    socketService.on('error', (error) => {
      console.error('Socket error:', error);
      store.dispatch(socketDisconnected({ error: error.message }));
      
      // Get current session from Redux state
      const state = store.getState();
      const activeSessions = state.realTime.activeSessions;
      
      // Start fallback polling for all active sessions
      activeSessions.forEach(sessionId => {
        this.startFallbackPolling(sessionId);
      });
    });

    // Handle user joined events
    socketService.on('user-joined', (data) => {
      console.log('👋 User joined:', data);
      // Refresh all active sessions when someone joins
      const state = store.getState();
      const activeSessions = state.realTime.activeSessions;
      
      activeSessions.forEach(sessionId => {
        this.fetchSessionData(sessionId);
      });
    });
  }

  private async fetchSessionData(sessionId: string): Promise<void> {
    try {
      console.log(`📊 Fetching fresh data for session: ${sessionId}`);
      const response = await mvpApiService.getSessionByShareCode(sessionId);
      
      if (response.success && response.data?.session) {
        const session = response.data.session;
        
        console.log(`✅ Session data updated:`, {
          sessionId,
          playerCount: session.players?.length || 0,
          players: session.players?.map(p => p.name) || []
        });
        
        // Mark as updated
        store.dispatch(sessionUpdated({
          sessionId,
          timestamp: new Date().toISOString(),
          source: 'polling'
        }));

        // Update Redux store with fresh session and player data
        store.dispatch(setCurrentSession({
          id: session.id,
          name: session.name,
          scheduledAt: session.scheduledAt,
          location: session.location,
          maxPlayers: session.maxPlayers,
          skillLevel: session.skillLevel,
          cost: session.cost,
          status: session.status,
          owner: session.owner,
          playerCount: session.players?.length || 0,
          isOwner: false
        }));

        if (session.players) {
          store.dispatch(setPlayers(session.players.map((p: any) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            status: p.status,
            gamesPlayed: p.gamesPlayed || 0,
            wins: p.wins || 0,
            losses: p.losses || 0,
            joinedAt: p.joinedAt
          }))));
        }
      }
    } catch (error: any) {
      console.error(`Failed to fetch session data: ${sessionId}`, error);
      store.dispatch(updateError({ sessionId, error: error.message }));
    }
  }

  private startFallbackPolling(sessionId: string): void {
    console.log(`📊 Starting fallback polling for session: ${sessionId}`);
    
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
      console.log(`⏹️ Stopped fallback polling for session: ${sessionId}`);
    }
  }
}

// Export singleton instance
export const realTimeService = new RealTimeService({
  fallbackPollingInterval: 15000, // 15 seconds for better responsiveness
  maxReconnectAttempts: 3,
  optimisticUpdateTimeout: 3000, // 3 seconds
});

export default realTimeService;