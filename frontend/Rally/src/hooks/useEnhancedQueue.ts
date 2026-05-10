import { useState, useEffect, useMemo, useCallback } from 'react';
import { waitTimeCalculator, WaitTimeEstimate } from '../services/WaitTimeCalculator';
import { hapticService, HapticType } from '../services/HapticService';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface Court {
  id: string;
  name: string;
  currentGame?: any;
  isActive: boolean;
  queue: Player[];
}

interface EnhancedQueueData {
  queueWithEstimates: Array<{
    player: Player;
    position: number;
    waitTime: WaitTimeEstimate;
    isNextUp: boolean;
  }>;
  nextPlayers: Player[];
  showUpNextBanner: boolean;
  averageGameDuration: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export const useEnhancedQueue = (court: Court | null) => {
  const [queueData, setQueueData] = useState<EnhancedQueueData>({
    queueWithEstimates: [],
    nextPlayers: [],
    showUpNextBanner: false,
    averageGameDuration: 12,
    confidenceLevel: 'low'
  });

  // Calculate enhanced queue data
  const updateQueueData = useCallback(() => {
    if (!court) {
      setQueueData({
        queueWithEstimates: [],
        nextPlayers: [],
        showUpNextBanner: false,
        averageGameDuration: 12,
        confidenceLevel: 'low'
      });
      return;
    }

    const queueWithEstimates = court.queue.map((player, index) => {
      const position = index + 1;
      const waitTime = waitTimeCalculator.calculateWaitTime(position, court.id);
      const isNextUp = position <= 4 && !court.currentGame; // Next up if in top 4 and no current game
      
      return {
        player,
        position,
        waitTime,
        isNextUp
      };
    });

    const nextPlayers = court.queue.slice(0, 4); // Next 4 players
    const showUpNextBanner = !!court.currentGame && court.queue.length >= 2;
    const averageGameDuration = waitTimeCalculator.getAverageGameDuration(court.id);
    const confidenceLevel = waitTimeCalculator.getConfidenceLevel(court.id);

    setQueueData({
      queueWithEstimates,
      nextPlayers,
      showUpNextBanner,
      averageGameDuration,
      confidenceLevel
    });
  }, [court]);

  // Update queue data when court changes
  useEffect(() => {
    updateQueueData();
  }, [updateQueueData]);

  // Record game completion for wait time calculations
  const recordGameCompletion = useCallback(async (
    gameStartTime: string,
    gameEndTime: string = new Date().toISOString(),
    playerCount: number = 4,
    completedSets: number = 2
  ) => {
    if (!court) return;

    try {
      await waitTimeCalculator.recordGameDuration(
        court.id,
        new Date(gameStartTime),
        new Date(gameEndTime),
        playerCount,
        completedSets
      );

      // Update queue data with new calculations
      updateQueueData();

      // Haptic feedback for game completion
      await hapticService.gameMilestone('victory');
    } catch (error) {
      console.error('Failed to record game duration:', error);
    }
  }, [court, updateQueueData]);

  // Handle queue position changes with haptic feedback
  const handleQueueUpdate = useCallback(async (
    type: 'added' | 'removed' | 'moved',
    playerName?: string
  ) => {
    await hapticService.queueUpdate(type);
    updateQueueData();
  }, [updateQueueData]);

  // Get wait time estimates for multiple positions
  const getWaitTimeEstimates = useCallback((count: number = 4): number[] => {
    if (!court) return [];

    return Array.from({ length: count }, (_, index) => {
      const position = index + 1;
      const estimate = waitTimeCalculator.calculateWaitTime(position, court.id);
      return estimate.minutes;
    });
  }, [court]);

  // Check if a player should be highlighted as "next up"
  const isPlayerNextUp = useCallback((position: number): boolean => {
    return position <= 4 && !court?.currentGame;
  }, [court]);

  // Get formatted confidence message
  const getConfidenceMessage = useMemo(() => {
    const { confidenceLevel, averageGameDuration } = queueData;
    
    switch (confidenceLevel) {
      case 'high':
        return `Accurate estimates based on ${averageGameDuration}min average games`;
      case 'medium':
        return `Estimates based on limited game data`;
      case 'low':
        return `Estimates based on default 12min games`;
      default:
        return '';
    }
  }, [queueData]);

  // Manual refresh of queue data
  const refreshQueueData = useCallback(() => {
    updateQueueData();
  }, [updateQueueData]);

  // Clear wait time history for this court
  const clearWaitTimeHistory = useCallback(async () => {
    if (!court) return;
    
    try {
      await waitTimeCalculator.clearCourtHistory(court.id);
      updateQueueData();
    } catch (error) {
      console.error('Failed to clear wait time history:', error);
    }
  }, [court, updateQueueData]);

  return {
    // Queue data
    queueWithEstimates: queueData.queueWithEstimates,
    nextPlayers: queueData.nextPlayers,
    showUpNextBanner: queueData.showUpNextBanner,
    averageGameDuration: queueData.averageGameDuration,
    confidenceLevel: queueData.confidenceLevel,
    
    // Utility functions
    recordGameCompletion,
    handleQueueUpdate,
    getWaitTimeEstimates,
    isPlayerNextUp,
    refreshQueueData,
    clearWaitTimeHistory,
    
    // UI helpers
    confidenceMessage: getConfidenceMessage,
  };
};