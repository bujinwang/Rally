import { store } from '../store';
import { socketService } from './socketService';
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
    console.log(`⏹️ Stopping auto-refresh for session: ${sessionId}`);
    
    // Stop Socket.IO updates
    if (socketService.getCurrentSession() === sessionId) {
      socketService.leaveSession();
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
    } catch (error) {
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
      await socketService.connect();
      const isConnected = socketService.isConnected();
      
      if (isConnected) {
        store.dispatch(socketConnected());
      } else {
        store.dispatch(socketDisconnected({ error: 'Failed to establish connection' }));
      }
      
      return isConnected;
    } catch (error) {
      console.error('Socket connection failed:', error);
      store.dispatch(socketDisconnected({ error: error.message }));
      return false;
    }
  }

  private setupSocketListeners(): void {
    console.log('📡 Setting up socket listeners for real-time updates');
    
    // Listen for session updates
    socketService.on('mvp-session-updated', (data) => {
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
      } catch (error) {
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

        // TODO: This is where we'd update the actual session and player data
        // For now, we'll trigger a custom event that components can listen to
        try {
          const { DeviceEventEmitter } = require('react-native');
          DeviceEventEmitter.emit('sessionDataUpdated', {
            session,
            sessionId
          });
        } catch (error) {
          // Fallback for testing environments
          console.log('DeviceEventEmitter not available:', error.message);
        }
      }
    } catch (error) {
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