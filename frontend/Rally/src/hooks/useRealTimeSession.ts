import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { realTimeService } from '../services/realTimeService';
import { selectRealTimeStatus, selectSessionAutoRefreshStatus } from '../store/slices/realTimeSlice';
import { RootState } from '../store';

interface UseRealTimeSessionOptions {
  sessionId: string;
  fallbackInterval?: number;
  enableOptimisticUpdates?: boolean;
  autoStart?: boolean;
}

interface UseRealTimeSessionReturn {
  isConnected: boolean;
  connectionStatus: string;
  lastUpdated?: string;
  error?: string;
  isActive: boolean;
  manualRefresh: () => Promise<void>;
  startAutoRefresh: () => Promise<void>;
  stopAutoRefresh: () => void;
}

export const useRealTimeSession = ({
  sessionId,
  fallbackInterval = 30000,
  enableOptimisticUpdates = true,
  autoStart = true,
}: UseRealTimeSessionOptions): UseRealTimeSessionReturn => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Get real-time status from Redux
  const realTimeStatus = useSelector(selectRealTimeStatus);
  const sessionStatus = useSelector((state: RootState) => 
    selectSessionAutoRefreshStatus(state, sessionId)
  );

  // Manual refresh function
  const manualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    try {
      setIsRefreshing(true);
      console.log(`🔄 Manual refresh triggered for session: ${sessionId}`);
      await realTimeService.refreshSession(sessionId, enableOptimisticUpdates);
    } catch (error: any) {
      console.error('Manual refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId, enableOptimisticUpdates, isRefreshing]);

  // Start auto-refresh function
  const startAutoRefresh = useCallback(async () => {
    if (sessionStatus.isActive) return;
    
    try {
      console.log(`▶️ Starting auto-refresh for session: ${sessionId}`);
      await realTimeService.startSessionAutoRefresh(sessionId);
    } catch (error: any) {
      console.error('Failed to start auto-refresh:', error);
    }
  }, [sessionId, sessionStatus.isActive]);

  // Stop auto-refresh function
  const stopAutoRefresh = useCallback(() => {
    if (!sessionStatus.isActive) return;
    
    console.log(`⏹️ Stopping auto-refresh for session: ${sessionId}`);
    realTimeService.stopSessionAutoRefresh(sessionId);
  }, [sessionId, sessionStatus.isActive]);

  // Auto-start effect
  useEffect(() => {
    if (autoStart && sessionId && !sessionStatus.isActive) {
      startAutoRefresh();
    }
    
    // Cleanup on unmount
    return () => {
      if (sessionStatus.isActive) {
        stopAutoRefresh();
      }
    };
  }, [sessionId, autoStart]); // Intentionally limited deps to avoid re-triggering

  // Listen for session data updates via React Native DeviceEventEmitter
  useEffect(() => {
    let subscription: any = null;
    
    try {
      const { DeviceEventEmitter } = require('react-native');
      
      const handleSessionUpdate = (eventData: { sessionId: string; session: any }) => {
        if (eventData?.sessionId === sessionId) {
          console.log(`📊 Session data updated via DeviceEventEmitter for: ${sessionId}`);
        }
      };

      subscription = DeviceEventEmitter.addListener('sessionDataUpdated', handleSessionUpdate);
    } catch (error: any) {
      console.log('DeviceEventEmitter not available:', error.message);
    }
    
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [sessionId]);

  return {
    isConnected: realTimeStatus.connected,
    connectionStatus: realTimeStatus.status,
    lastUpdated: sessionStatus.lastUpdated,
    error: sessionStatus.error,
    isActive: sessionStatus.isActive,
    manualRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  };
};