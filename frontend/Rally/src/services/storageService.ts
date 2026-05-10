import AsyncStorage from '@react-native-async-storage/async-storage';

export class StorageService {
  private static readonly KEYS = {
    SESSIONS: 'offline_sessions',
    ROTATION_QUEUE: 'offline_rotation_queue',
    PLAYERS: 'offline_players',
    SYNC_QUEUE: 'offline_sync_queue',
    LAST_SYNC: 'last_sync_timestamp',
    DEVICE_ID: 'device_id',
    CACHED_SESSIONS: 'cached_sessions',
  };

  // Sessions Storage
  static async saveSessions(sessions: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving sessions:', error);
      throw error;
    }
  }

  static async getSessions(): Promise<any[]> {
    try {
      const sessions = await AsyncStorage.getItem(this.KEYS.SESSIONS);
      return sessions ? JSON.parse(sessions) : [];
    } catch (error) {
      console.error('Error getting sessions:', error);
      return [];
    }
  }

  // Rotation Queue Storage
  static async saveRotationQueue(sessionId: string, queue: any[]): Promise<void> {
    try {
      const key = `${this.KEYS.ROTATION_QUEUE}_${sessionId}`;
      await AsyncStorage.setItem(key, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving rotation queue:', error);
      throw error;
    }
  }

  static async getRotationQueue(sessionId: string): Promise<any[]> {
    try {
      const key = `${this.KEYS.ROTATION_QUEUE}_${sessionId}`;
      const queue = await AsyncStorage.getItem(key);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error getting rotation queue:', error);
      return [];
    }
  }

  // Players Storage
  static async savePlayers(sessionId: string, players: any[]): Promise<void> {
    try {
      const key = `${this.KEYS.PLAYERS}_${sessionId}`;
      await AsyncStorage.setItem(key, JSON.stringify(players));
    } catch (error) {
      console.error('Error saving players:', error);
      throw error;
    }
  }

  static async getPlayers(sessionId: string): Promise<any[]> {
    try {
      const key = `${this.KEYS.PLAYERS}_${sessionId}`;
      const players = await AsyncStorage.getItem(key);
      return players ? JSON.parse(players) : [];
    } catch (error) {
      console.error('Error getting players:', error);
      return [];
    }
  }

  // Sync Queue Management
  static async addToSyncQueue(operation: any): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      queue.push({
        ...operation,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      await AsyncStorage.setItem(this.KEYS.SYNC_QUEUE, JSON.stringify(queue));
    } catch (error) {
      console.error('Error adding to sync queue:', error);
      throw error;
    }
  }

  static async getSyncQueue(): Promise<any[]> {
    try {
      const queue = await AsyncStorage.getItem(this.KEYS.SYNC_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error getting sync queue:', error);
      return [];
    }
  }

  static async removeFromSyncQueue(operationId: string): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const filteredQueue = queue.filter(op => op.id !== operationId);
      await AsyncStorage.setItem(this.KEYS.SYNC_QUEUE, JSON.stringify(filteredQueue));
    } catch (error) {
      console.error('Error removing from sync queue:', error);
      throw error;
    }
  }

  static async updateSyncQueueOperation(operationId: string, updates: any): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const updatedQueue = queue.map(op =>
        op.id === operationId ? { ...op, ...updates } : op
      );
      await AsyncStorage.setItem(this.KEYS.SYNC_QUEUE, JSON.stringify(updatedQueue));
    } catch (error) {
      console.error('Error updating sync queue operation:', error);
      throw error;
    }
  }

  // Last Sync Timestamp
  static async setLastSyncTimestamp(timestamp: string): Promise<void> {
    try {
      await AsyncStorage.setItem(this.KEYS.LAST_SYNC, timestamp);
    } catch (error) {
      console.error('Error setting last sync timestamp:', error);
      throw error;
    }
  }

  static async getLastSyncTimestamp(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.KEYS.LAST_SYNC);
    } catch (error) {
      console.error('Error getting last sync timestamp:', error);
      return null;
    }
  }

  // Device ID Management
  static async getDeviceId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.KEYS.DEVICE_ID);
    } catch (error) {
      console.error('Error getting device ID:', error);
      return null;
    }
  }

  static async setDeviceId(deviceId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(this.KEYS.DEVICE_ID, deviceId);
    } catch (error) {
      console.error('Error setting device ID:', error);
      throw error;
    }
  }

  // Session Caching (for offline support)
  static async cacheSession(session: any): Promise<void> {
    try {
      const cachedSessions = await this.getCachedSessions();
      cachedSessions[session.shareCode] = {
        ...session,
        cachedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(this.KEYS.CACHED_SESSIONS, JSON.stringify(cachedSessions));
    } catch (error) {
      console.error('Error caching session:', error);
      throw error;
    }
  }

  static async getCachedSession(shareCode: string): Promise<any | null> {
    try {
      const cachedSessions = await this.getCachedSessions();
      const session = cachedSessions[shareCode];
      
      if (!session) return null;
      
      // Check if cache is still valid (24 hours)
      const cachedAt = new Date(session.cachedAt);
      const now = new Date();
      const hoursDiff = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        // Cache expired, remove it
        delete cachedSessions[shareCode];
        await AsyncStorage.setItem(this.KEYS.CACHED_SESSIONS, JSON.stringify(cachedSessions));
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Error getting cached session:', error);
      return null;
    }
  }

  private static async getCachedSessions(): Promise<Record<string, any>> {
    try {
      const cached = await AsyncStorage.getItem(this.KEYS.CACHED_SESSIONS);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.error('Error getting cached sessions:', error);
      return {};
    }
  }

  // Utility Methods
  static async clearAllData(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(key => key.startsWith('offline_') || key === this.KEYS.DEVICE_ID || key === this.KEYS.CACHED_SESSIONS);
      await AsyncStorage.multiRemove(appKeys);
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }

  static async getStorageInfo(): Promise<{ size: number; keys: number }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(key => key.startsWith('offline_'));

      let totalSize = 0;
      for (const key of appKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }

      return {
        size: totalSize,
        keys: appKeys.length,
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { size: 0, keys: 0 };
    }
  }
}