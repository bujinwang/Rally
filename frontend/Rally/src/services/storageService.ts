import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  offlineQueue,
  OfflineOperation,
  OfflineOperationInput,
} from './offlineQueue';

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

  // -------------------------------------------------------------------------
  // Sync Queue Management (Story 6.5)
  //
  // These methods DELEGATE to `offlineQueue`, the canonical storage primitive.
  // `addToSyncQueue` no longer re-stamps `id`/`timestamp`/`retryCount` — that
  // overwrite caused a duplicate-id collision where one `removeFromSyncQueue`
  // removed two operations (the D-3 data-loss bug). The queue now owns those
  // fields and allocates a unique id + monotonic `sequence`.
  // -------------------------------------------------------------------------

  /**
   * Add an operation to the sync queue.
   *
   * Accepts either a fully-formed (but not yet stamped) operation with an
   * `entity`/`op`/`payload` triple, or the legacy `{ type, payload }` shape.
   * `id`, `sequence`, `timestamp` and `retryCount` are assigned by the queue.
   */
  static async addToSyncQueue(operation: any): Promise<void> {
    const identity = {
      deviceId: (operation?.identity?.deviceId as string) || '',
      ...(operation?.identity?.userId ? { userId: operation.identity.userId as string } : {}),
    };

    const input: OfflineOperationInput = {
      entity: operation?.entity ?? 'unknown',
      op: operation?.op ?? operation?.type ?? 'unknown',
      payload: {
        method: operation?.payload?.method ?? 'POST',
        endpoint: operation?.payload?.endpoint ?? '',
        ...(operation?.payload?.body !== undefined
          ? { body: operation.payload.body }
          : operation?.payload?.data !== undefined
            ? { body: operation.payload.data }
            : {}),
      },
      ...(typeof operation?.version === 'number' ? { version: operation.version } : {}),
    };

    const stored = await offlineQueue.enqueue(input, identity);
    if (!stored) {
      // Persistence failed (e.g. storage quota). Surface it rather than
      // silently dropping the mutation.
      throw new Error('Failed to enqueue offline operation');
    }

    // Preserve any pre-set execution state (e.g. a legacy `state`) without
    // re-stamping the queue-owned fields.
    if (operation?.state && operation.state !== stored.state) {
      await offlineQueue.updateOperation(stored.id, { state: operation.state });
    }
  }

  /** Active queue, sorted by `sequence` (the deterministic replay order). */
  static async getSyncQueue(): Promise<OfflineOperation[]> {
    return offlineQueue.getOperations();
  }

  /** Remove a single operation by id. Filters by id, never by index. */
  static async removeFromSyncQueue(operationId: string): Promise<void> {
    await offlineQueue.removeOperation(operationId);
  }

  /** Patch a single operation's mutable fields (retryCount, state, errors…). */
  static async updateSyncQueueOperation(operationId: string, updates: any): Promise<void> {
    await offlineQueue.updateOperation(operationId, updates);
  }

  /** Archived (evicted-but-retained) operations — never deleted (AC 14). */
  static async getSyncArchive(): Promise<any[]> {
    return offlineQueue.readArchive();
  }

  /** Count of archived operations, surfaced to the UI. */
  static async getSyncArchiveCount(): Promise<number> {
    return offlineQueue.getArchivedCount();
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

  // -------------------------------------------------------------------------
  // Export/restore support (Story 6.5 / T03)
  //
  // Read/merge helpers for the offline snapshot. Both are additive: the
  // snapshot reader is read-only, and the merge keeps existing keys (local cache
  // is authoritative over an imported file). No delete path is introduced.
  // -------------------------------------------------------------------------

  /** The full cached-session snapshot as a plain object (export source). */
  static async getCachedSessionsSnapshot(): Promise<Record<string, any>> {
    return this.getCachedSessions();
  }

  /**
   * Additively merge an imported cached-session snapshot. Existing keys win —
   * an import never overwrites a locally cached session. Returns the number of
   * newly merged keys.
   */
  static async mergeCachedSessions(incoming: Record<string, unknown>): Promise<number> {
    if (!incoming || typeof incoming !== 'object') return 0;
    try {
      const current = await this.getCachedSessions();
      let merged = 0;
      for (const [shareCode, session] of Object.entries(incoming)) {
        if (!(shareCode in current)) {
          current[shareCode] = session;
          merged += 1;
        }
      }
      if (merged > 0) {
        await AsyncStorage.setItem(this.KEYS.CACHED_SESSIONS, JSON.stringify(current));
      }
      return merged;
    } catch (error) {
      console.error('Error merging cached sessions:', error);
      return 0;
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