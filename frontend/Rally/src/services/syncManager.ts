import NetInfo from '@react-native-community/netinfo';
import { StorageService } from './storageService';
import { API_BASE_URL } from '../config/api';
import DeviceService from './deviceService';

interface SyncOperation {
  id: string;
  type: 'CREATE_SESSION' | 'UPDATE_SESSION' | 'DELETE_SESSION' |
        'ADD_PLAYER' | 'UPDATE_PLAYER' | 'REMOVE_PLAYER' |
        'RECORD_GAME' | 'TRIGGER_ROTATION' | 'UPDATE_PLAYER_STATUS';
  payload: any;
  timestamp: string;
  retryCount: number;
}

export class SyncManager {
  private static instance: SyncManager;
  private isOnline: boolean = false;
  private syncInProgress: boolean = false;

  private constructor() {
    this.initializeNetworkListener();
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  private initializeNetworkListener(): void {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (wasOffline && this.isOnline) {
        console.log('🔄 Network restored, starting sync...');
        this.startSync();
      } else if (!this.isOnline) {
        console.log('📴 Network lost, going offline...');
      }
    });
  }

  // Queue operation for offline sync
  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const syncOperation: SyncOperation = {
      ...operation,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    await StorageService.addToSyncQueue(syncOperation);

    // If online, try to sync immediately
    if (this.isOnline) {
      this.startSync();
    }
  }

  // Start synchronization process
  private async startSync(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Starting sync process...');

    try {
      const syncQueue = await StorageService.getSyncQueue();

      if (syncQueue.length === 0) {
        console.log('✅ Sync complete - no pending operations');
        this.syncInProgress = false;
        return;
      }

      console.log(`📋 Processing ${syncQueue.length} sync operations...`);

      for (const operation of syncQueue) {
        try {
          await this.processSyncOperation(operation);
          await StorageService.removeFromSyncQueue(operation.id);
          console.log(`✅ Synced operation: ${operation.type}`);
        } catch (error) {
          console.error(`❌ Failed to sync operation ${operation.id}:`, error);

          // Increment retry count
          if (operation.retryCount < 3) {
            await StorageService.updateSyncQueueOperation(operation.id, {
              retryCount: operation.retryCount + 1
            });
          } else {
            // Remove after 3 failed attempts
            await StorageService.removeFromSyncQueue(operation.id);
            console.error(`🗑️ Removed failed operation after 3 attempts: ${operation.id}`);
          }
        }
      }

      // Update last sync timestamp
      await StorageService.setLastSyncTimestamp(new Date().toISOString());

      console.log('✅ Sync process completed');
    } catch (error) {
      console.error('❌ Sync process failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // Process individual sync operation
  private async processSyncOperation(operation: SyncOperation): Promise<void> {
    const baseURL = API_BASE_URL;
    const deviceId = await DeviceService.getDeviceId();
    const headers = {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    };

    switch (operation.type) {
      case 'CREATE_SESSION':
        await fetch(`${baseURL}/sessions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(operation.payload),
        });
        break;

      case 'UPDATE_SESSION':
        await fetch(`${baseURL}/sessions/${operation.payload.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(operation.payload),
        });
        break;

      case 'UPDATE_PLAYER_STATUS':
        await fetch(`${baseURL}/sessions/${operation.payload.sessionId}/players/${operation.payload.playerId}/status`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: operation.payload.status }),
        });
        break;

      case 'TRIGGER_ROTATION':
        await fetch(`${baseURL}/sessions/${operation.payload.sessionId}/rotation/trigger`, {
          method: 'POST',
          headers,
          body: JSON.stringify(operation.payload),
        });
        break;

      default:
        console.warn(`⚠️ Unknown sync operation type: ${operation.type}`);
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    isOnline: boolean;
    syncInProgress: boolean;
    pendingOperations: number;
    lastSyncTime: string | null;
  }> {
    const syncQueue = await StorageService.getSyncQueue();
    const lastSyncTime = await StorageService.getLastSyncTimestamp();

    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      pendingOperations: syncQueue.length,
      lastSyncTime,
    };
  }

  // Force sync
  async forceSync(): Promise<void> {
    if (this.isOnline) {
      await this.startSync();
    } else {
      throw new Error('Cannot sync while offline');
    }
  }

  // Clear all pending sync operations
  async clearSyncQueue(): Promise<void> {
    const keys = await StorageService.getSyncQueue();
    for (const operation of keys) {
      await StorageService.removeFromSyncQueue(operation.id);
    }
  }
}

// Export singleton instance
export const syncManager = SyncManager.getInstance();