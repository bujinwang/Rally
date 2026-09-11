/**
 * syncSlice.ts — ephemeral UI state for offline/sync status.
 *
 * This slice is deliberately **NOT persisted**: it holds runtime status that is
 * trivially re-derivable from the queue at startup (`store/index.ts` keeps
 * `whitelist: ['auth']`). Persisting it would create a second source of truth
 * and risk rehydrating half-applied optimistic state on a cold start.
 *
 * The same slice is written by both the online-update path and the offline
 * replay path so a conflict renders identically regardless of origin (AC 7).
 */

import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';

export interface ConflictRecord {
  opId: string;
  entity: string;
  endpoint: string;
  intendedPayload: unknown;
  authoritative: unknown;
  serverVersion: number | null;
  detectedAt: string;
}

export type SyncStatus = 'idle' | 'queued' | 'syncing' | 'conflict' | 'failed';

export interface SyncState {
  isOnline: boolean;
  syncing: boolean;
  queuedCount: number;
  syncingCount: number;
  failedCount: number;
  conflicts: ConflictRecord[];
  archivedCount: number;
  queueNearLimit: boolean;
  schemaQuarantine: boolean;
  lastSyncAt: string | null;
}

export const initialSyncState: SyncState = {
  isOnline: false,
  syncing: false,
  queuedCount: 0,
  syncingCount: 0,
  failedCount: 0,
  conflicts: [],
  archivedCount: 0,
  queueNearLimit: false,
  schemaQuarantine: false,
  lastSyncAt: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState: initialSyncState,
  reducers: {
    /** Connectivity changed (NetInfo / socket). */
    setOnline: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    /** A sync pass started (guarded by `syncInProgress` upstream). */
    syncStarted: (state) => {
      state.syncing = true;
    },
    /** Progress snapshot for the current pass. */
    syncProgress: (
      state,
      action: PayloadAction<{ queuedCount?: number; syncingCount?: number; failedCount?: number }>,
    ) => {
      const { queuedCount, syncingCount, failedCount } = action.payload;
      if (typeof queuedCount === 'number') state.queuedCount = Math.max(0, queuedCount);
      if (typeof syncingCount === 'number') state.syncingCount = Math.max(0, syncingCount);
      if (typeof failedCount === 'number') state.failedCount = Math.max(0, failedCount);
    },
    /** A sync pass finished and was recorded. */
    syncCompleted: (
      state,
      action: PayloadAction<{
        completedAt?: string;
        queuedCount?: number;
        failedCount?: number;
        archivedCount?: number;
      }>,
    ) => {
      state.syncing = false;
      state.lastSyncAt = action.payload.completedAt ?? new Date().toISOString();
      if (typeof action.payload.queuedCount === 'number') {
        state.queuedCount = Math.max(0, action.payload.queuedCount);
      }
      if (typeof action.payload.failedCount === 'number') {
        state.failedCount = Math.max(0, action.payload.failedCount);
      }
      if (typeof action.payload.archivedCount === 'number') {
        state.archivedCount = Math.max(0, action.payload.archivedCount);
      }
    },
    /** A `409` conflict was recorded (server wins; the record is surfaced). */
    conflictDetected: (state, action: PayloadAction<ConflictRecord>) => {
      const record = action.payload;
      const withoutDuplicate = state.conflicts.filter((c) => c.opId !== record.opId);
      withoutDuplicate.push(record);
      state.conflicts = withoutDuplicate;
    },
    /** The user acknowledged/dismissed a single conflict. */
    dismissConflict: (state, action: PayloadAction<string>) => {
      state.conflicts = state.conflicts.filter((c) => c.opId !== action.payload);
    },
    /** Clear every surfaced conflict. */
    clearConflicts: (state) => {
      state.conflicts = [];
    },
    /** Queue bound flags. */
    setQueueMeta: (
      state,
      action: PayloadAction<{ archivedCount?: number; queueNearLimit?: boolean }>,
    ) => {
      if (typeof action.payload.archivedCount === 'number') {
        state.archivedCount = Math.max(0, action.payload.archivedCount);
      }
      if (typeof action.payload.queueNearLimit === 'boolean') {
        state.queueNearLimit = action.payload.queueNearLimit;
      }
    },
    /** Schema quarantine flag (AC 8). */
    setQuarantine: (state, action: PayloadAction<boolean>) => {
      state.schemaQuarantine = action.payload;
    },
  },
});

export const {
  setOnline,
  syncStarted,
  syncProgress,
  syncCompleted,
  conflictDetected,
  dismissConflict,
  clearConflicts,
  setQueueMeta,
  setQuarantine,
} = syncSlice.actions;

export default syncSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

interface SyncRootState {
  sync: SyncState;
}

const selectSyncSlice = (state: SyncRootState): SyncState => state.sync;

/** Derived status: syncing > conflict > failed > queued > idle (design §8.1). */
export const selectSyncStatus = createSelector([selectSyncSlice], (sync): SyncStatus => {
  if (sync.syncing) return 'syncing';
  if (sync.conflicts.length > 0) return 'conflict';
  if (sync.failedCount > 0) return 'failed';
  if (sync.queuedCount > 0) return 'queued';
  return 'idle';
});

export const selectUnresolvedConflicts = createSelector(
  [selectSyncSlice],
  (sync) => sync.conflicts,
);

export const selectHasPendingWork = createSelector(
  [selectSyncSlice],
  (sync) => sync.queuedCount > 0 || sync.conflicts.length > 0 || sync.failedCount > 0,
);

export const selectArchivedCount = createSelector([selectSyncSlice], (sync) => sync.archivedCount);

export const selectQueueNearLimit = createSelector(
  [selectSyncSlice],
  (sync) => sync.queueNearLimit,
);

export const selectSchemaQuarantine = createSelector(
  [selectSyncSlice],
  (sync) => sync.schemaQuarantine,
);

export const selectLastSyncAt = createSelector([selectSyncSlice], (sync) => sync.lastSyncAt);

/** Full banner view-model — the single shape the UI renders from. */
export const selectSyncBanner = createSelector([selectSyncSlice], (sync) => ({
  status: selectSyncStatus({ sync }),
  isOnline: sync.isOnline,
  queuedCount: sync.queuedCount,
  failedCount: sync.failedCount,
  conflictCount: sync.conflicts.length,
  archivedCount: sync.archivedCount,
  queueNearLimit: sync.queueNearLimit,
  schemaQuarantine: sync.schemaQuarantine,
  lastSyncAt: sync.lastSyncAt,
}));
