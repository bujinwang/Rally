import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GameDuration {
  courtId: string;
  duration: number; // in minutes
  timestamp: Date;
  playerCount: number;
  completedSets: number;
}

export interface WaitTimeEstimate {
  minutes: number;
  confidence: 'high' | 'medium' | 'low';
  lastUpdated: Date;
}

export class WaitTimeCalculator {
  private static instance: WaitTimeCalculator;
  private gameHistory: Map<string, GameDuration[]> = new Map();
  private readonly STORAGE_KEY = 'badminton_wait_times';
  private readonly MAX_HISTORY_PER_COURT = 10;
  private readonly DEFAULT_GAME_DURATION = 12; // minutes
  private readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 5, // 5+ games for high confidence
    MEDIUM: 2, // 2-4 games for medium confidence
  };

  private constructor() {
    this.loadHistoryFromStorage();
  }

  public static getInstance(): WaitTimeCalculator {
    if (!WaitTimeCalculator.instance) {
      WaitTimeCalculator.instance = new WaitTimeCalculator();
    }
    return WaitTimeCalculator.instance;
  }

  /**
   * Calculate estimated wait time for a queue position
   */
  public calculateWaitTime(position: number, courtId: string): WaitTimeEstimate {
    if (position <= 0) {
      return {
        minutes: 0,
        confidence: 'high',
        lastUpdated: new Date()
      };
    }

    const history = this.gameHistory.get(courtId) || [];
    const averageDuration = this.getAverageGameDuration(courtId);
    
    // Calculate games ahead (each game takes 4 players from queue)
    const gamesAhead = Math.ceil(position / 4);
    const estimatedMinutes = gamesAhead * averageDuration;

    // Determine confidence based on historical data
    let confidence: 'high' | 'medium' | 'low';
    if (history.length >= this.CONFIDENCE_THRESHOLDS.HIGH) {
      confidence = 'high';
    } else if (history.length >= this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      minutes: Math.round(estimatedMinutes),
      confidence,
      lastUpdated: new Date()
    };
  }

  /**
   * Record a completed game duration
   */
  public async recordGameDuration(
    courtId: string,
    startTime: Date,
    endTime: Date,
    playerCount: number = 4,
    completedSets: number = 2
  ): Promise<void> {
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60); // Convert to minutes
    
    const gameDuration: GameDuration = {
      courtId,
      duration: Math.max(1, Math.round(duration)), // Minimum 1 minute
      timestamp: new Date(),
      playerCount,
      completedSets
    };

    // Get existing history for this court
    const courtHistory = this.gameHistory.get(courtId) || [];
    
    // Add new duration and keep only the most recent games
    courtHistory.push(gameDuration);
    if (courtHistory.length > this.MAX_HISTORY_PER_COURT) {
      courtHistory.shift(); // Remove oldest
    }
    
    // Update map and save to storage
    this.gameHistory.set(courtId, courtHistory);
    await this.saveHistoryToStorage();
  }

  /**
   * Get average game duration for a court with weighted recent games
   */
  public getAverageGameDuration(courtId: string): number {
    const history = this.gameHistory.get(courtId) || [];
    
    if (history.length === 0) {
      return this.DEFAULT_GAME_DURATION;
    }

    // Weight recent games more heavily (80% vs 20% for older games)
    const totalGames = history.length;
    let weightedSum = 0;
    let totalWeight = 0;

    history.forEach((game, index) => {
      // More recent games get higher weight
      const recencyWeight = (index + 1) / totalGames;
      const weight = 0.2 + (0.8 * recencyWeight);
      
      weightedSum += game.duration * weight;
      totalWeight += weight;
    });

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Get confidence level for wait time estimates
   */
  public getConfidenceLevel(courtId: string): 'high' | 'medium' | 'low' {
    const history = this.gameHistory.get(courtId) || [];
    
    if (history.length >= this.CONFIDENCE_THRESHOLDS.HIGH) {
      return 'high';
    } else if (history.length >= this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get time of day adjustment factor
   */
  private getTimeOfDayFactor(): number {
    const hour = new Date().getHours();
    
    // Morning games tend to be faster (0.9x)
    if (hour >= 6 && hour < 12) return 0.9;
    
    // Evening games tend to be longer (1.1x)  
    if (hour >= 18 && hour < 22) return 1.1;
    
    // Default factor
    return 1.0;
  }

  /**
   * Clear history for a specific court
   */
  public async clearCourtHistory(courtId: string): Promise<void> {
    this.gameHistory.delete(courtId);
    await this.saveHistoryToStorage();
  }

  /**
   * Clear all history
   */
  public async clearAllHistory(): Promise<void> {
    this.gameHistory.clear();
    await this.saveHistoryToStorage();
  }

  /**
   * Get historical data for debugging
   */
  public getCourtHistory(courtId: string): GameDuration[] {
    return this.gameHistory.get(courtId) || [];
  }

  /**
   * Save game history to AsyncStorage
   */
  private async saveHistoryToStorage(): Promise<void> {
    try {
      const historyObject: Record<string, GameDuration[]> = {};
      this.gameHistory.forEach((history, courtId) => {
        historyObject[courtId] = history;
      });
      
      await AsyncStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(historyObject)
      );
    } catch (error) {
      console.error('Failed to save wait time history:', error);
    }
  }

  /**
   * Load game history from AsyncStorage
   */
  private async loadHistoryFromStorage(): Promise<void> {
    try {
      const historyJson = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (historyJson) {
        const historyObject: Record<string, GameDuration[]> = JSON.parse(historyJson);
        
        this.gameHistory.clear();
        Object.entries(historyObject).forEach(([courtId, history]) => {
          // Convert timestamp strings back to Date objects
          const processedHistory = history.map(game => ({
            ...game,
            timestamp: new Date(game.timestamp)
          }));
          this.gameHistory.set(courtId, processedHistory);
        });
      }
    } catch (error) {
      console.error('Failed to load wait time history:', error);
    }
  }
}

// Export singleton instance
export const waitTimeCalculator = WaitTimeCalculator.getInstance();

// Hook for React components
export const useWaitTimeCalculator = () => {
  return waitTimeCalculator;
};