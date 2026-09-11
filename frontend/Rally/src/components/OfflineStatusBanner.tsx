/**
 * OfflineStatusBanner.tsx — slim, non-intrusive strip that renders the offline
 * write-queue state (queued / syncing / conflict / failed) plus the
 * `queueNearLimit` and `schemaQuarantine` warning flags.
 *
 * It is the single UI surface for `sync.conflicts` (Story 6.5 AC 7/9): a `409
 * VERSION_CONFLICT` from either an offline replay or a direct online request is
 * dispatched into the same `sync.conflicts[]` array, so both origins render
 * identically here.
 *
 * Design references: `docs/stories/6.5.design.md` §8 (state model) and §10
 * (T04 file list). All strings come from i18n via the `offline.*` keys — there
 * are no hardcoded user-facing literals.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

import { useAppDispatch, useAppSelector } from '../store';
import {
  selectSyncBanner,
  selectUnresolvedConflicts,
  dismissConflict as dismissConflictAction,
  setOnline,
  syncStarted,
  syncProgress,
  syncCompleted,
  setQueueMeta,
  setQuarantine,
  ConflictRecord,
} from '../store/slices/syncSlice';
import { syncManager } from '../services/syncManager';
import { useTranslation } from '../i18n/LanguageContext';

// ---------------------------------------------------------------------------
// Defensive export-module resolution (Story 6.5 / T03 owns offlineExport.ts)
//
// `offlineExport.ts` is authored by a concurrent engineer (T03) and may not be
// resolvable yet while T04 is being written/compiled. We therefore resolve it
// lazily through a *variable* module specifier inside a try/catch: TypeScript
// cannot statically resolve a variable specifier, so `tsc` never fails on the
// (possibly) missing module, and at runtime a missing module degrades to a
// disabled Export button rather than a crash.
// ---------------------------------------------------------------------------

type ExportOfflineStateFn = () => string | Promise<string>;

const OFFLINE_EXPORT_MODULE = '../services/offlineExport';

let resolvedExportFn: ExportOfflineStateFn | null = null;

/**
 * Resolve `exportOfflineState` from `offlineExport.ts` if the module exists.
 * Only successful resolutions are memoised, so a module that appears later
 * (e.g. after a Fast Refresh once T03 lands) is picked up without a reload.
 */
function resolveExportFn(): ExportOfflineStateFn | null {
  if (resolvedExportFn) return resolvedExportFn;
  try {
    const mod: { exportOfflineState?: unknown } = require(OFFLINE_EXPORT_MODULE);
    if (typeof mod?.exportOfflineState === 'function') {
      resolvedExportFn = mod.exportOfflineState as ExportOfflineStateFn;
    }
  } catch {
    resolvedExportFn = null;
  }
  return resolvedExportFn;
}

/**
 * Deliver an export payload: clipboard (all platforms) + a Blob download on web.
 * Both paths are dependency-free; failures are non-fatal.
 */
async function deliverExport(payload: string): Promise<void> {
  try {
    await Clipboard.setStringAsync(payload);
  } catch (error) {
    console.warn('⚠️ Clipboard export failed', error);
  }
  try {
    if (
      typeof document !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined'
    ) {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rally-offline-export-${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.warn('⚠️ Export download failed', error);
  }
}

// ---------------------------------------------------------------------------
// Shared view-model helpers
// ---------------------------------------------------------------------------

type BannerStatus = 'idle' | 'queued' | 'syncing' | 'conflict' | 'failed';

interface StatusVisual {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  backgroundColor: string;
}

/** Visual language for each derived sync status (matches app status colours). */
const STATUS_VISUALS: Record<Exclude<BannerStatus, 'idle'>, StatusVisual> = {
  queued: { icon: 'cloud-upload-outline', color: '#FF9800', backgroundColor: '#FFF3E0' },
  syncing: { icon: 'sync-outline', color: '#1565C0', backgroundColor: '#E3F2FD' },
  conflict: { icon: 'alert-circle-outline', color: '#F97316', backgroundColor: '#FFF3E0' },
  failed: { icon: 'warning-outline', color: '#EF4444', backgroundColor: '#FDECEC' },
};

// ---------------------------------------------------------------------------
// Cached-data badge (used by the session screens)
// ---------------------------------------------------------------------------

/**
 * Hook: should the "Showing saved data" badge be visible?
 *
 * True only when the screen is currently rendering cached data AND the app is
 * offline or has pending/queued work — i.e. the cache may be stale relative to
 * the server. When online with an empty queue the badge stays hidden.
 */
export function useShowCachedBadge(fromCache: boolean): boolean {
  const banner = useAppSelector(selectSyncBanner);
  return fromCache && (!banner.isOnline || banner.queuedCount > 0 || banner.status !== 'idle');
}

interface CachedDataBadgeProps {
  visible?: boolean;
}

/**
 * Small pill indicating the screen is showing locally saved data. Purely
 * presentational; the gating decision lives in `useShowCachedBadge`.
 */
export const CachedDataBadge: React.FC<CachedDataBadgeProps> = ({ visible = true }) => {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.cachedBadge}>
      <Ionicons name="time-outline" size={12} color="#64748B" />
      <Text style={styles.cachedBadgeText}>{t.offline.cached}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export const OfflineStatusBanner: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const banner = useAppSelector(selectSyncBanner);
  const conflicts = useAppSelector(selectUnresolvedConflicts);

  const [exportFn, setExportFn] = useState<ExportOfflineStateFn | null>(null);
  const prevSyncingRef = useRef<boolean>(false);

  // Reconcile the ephemeral `sync` slice with the authoritative queue state.
  // The manager owns the real status; the slice is a render-friendly mirror.
  const refreshSyncState = useCallback(async () => {
    try {
      const status = await syncManager.getSyncStatus();
      const wasSyncing = prevSyncingRef.current;

      dispatch(setOnline(status.isOnline));
      dispatch(
        syncProgress({ queuedCount: status.queuedCount, failedCount: status.failedCount }),
      );
      dispatch(
        setQueueMeta({
          archivedCount: status.archivedCount,
          queueNearLimit: status.queueNearLimit,
        }),
      );
      dispatch(setQuarantine(status.schemaQuarantine));

      // Mirror the `syncInProgress` flag into the slice's `syncing` state,
      // dispatching the terminal action only on the syncing→idle transition so
      // `lastSyncAt` is not re-stamped on every poll.
      if (status.syncInProgress && !wasSyncing) {
        dispatch(syncStarted());
      } else if (!status.syncInProgress && wasSyncing) {
        dispatch(
          syncCompleted({
            ...(status.lastSyncTime ? { completedAt: status.lastSyncTime } : {}),
            queuedCount: status.queuedCount,
            failedCount: status.failedCount,
            archivedCount: status.archivedCount,
          }),
        );
      }
      prevSyncingRef.current = status.syncInProgress;
    } catch (error) {
      console.warn('⚠️ Failed to refresh sync status', error);
    }
  }, [dispatch]);

  // Resolve the (possibly not-yet-existing) export module after mount.
  useEffect(() => {
    setExportFn(() => resolveExportFn());
  }, []);

  // Hydrate on mount and keep in sync with the manager (mirrors ConnectionStatus
  // polling cadence). Cheap: a single AsyncStorage read + a few dispatches.
  useEffect(() => {
    void refreshSyncState();
    const interval = setInterval(() => {
      void refreshSyncState();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshSyncState]);

  const handleRetry = useCallback(async () => {
    try {
      await syncManager.forceSync();
    } catch (error) {
      // Throws when offline — expected; the queued state stays visible.
      console.warn('⚠️ Manual retry skipped', error);
    } finally {
      void refreshSyncState();
    }
  }, [refreshSyncState]);

  const handleDiscard = useCallback(async () => {
    try {
      await syncManager.clearSyncQueue();
    } catch (error) {
      console.warn('⚠️ Failed to clear queue', error);
    } finally {
      void refreshSyncState();
    }
  }, [refreshSyncState]);

  const handleExport = useCallback(async () => {
    const fn = exportFn ?? resolveExportFn();
    if (!fn) return;
    try {
      const payload = await Promise.resolve(fn());
      if (typeof payload === 'string' && payload.length > 0) {
        await deliverExport(payload);
      }
    } catch (error) {
      console.warn('⚠️ Export failed', error);
    }
  }, [exportFn]);

  const handleDismissConflict = useCallback(
    (opId: string) => {
      syncManager.dismissConflict(opId);
      dispatch(dismissConflictAction(opId));
    },
    [dispatch],
  );

  const status = banner.status;
  const visible = status !== 'idle' || banner.queueNearLimit || banner.schemaQuarantine;
  if (!visible) return null;

  // `idle` has no user-facing label (it only shows because of a warning flag),
  // so fall back to the neutral `queued` visual/label in that edge case.
  const statusKey = status === 'idle' ? 'queued' : status;
  const visual = STATUS_VISUALS[statusKey];
  const statusLabel = t.offline[statusKey];

  const showRetry = status === 'failed' || status === 'conflict' || status === 'queued';
  const showDiscard = status === 'failed' || status === 'conflict' || banner.queuedCount > 0;

  return (
    <View style={[styles.container, { backgroundColor: visual.backgroundColor }]}>
      {/* Primary status row */}
      <View style={styles.row}>
        <View style={styles.statusGroup}>
          {status === 'syncing' ? (
            <ActivityIndicator size="small" color={visual.color} />
          ) : (
            <Ionicons name={visual.icon} size={14} color={visual.color} />
          )}
          <Text style={[styles.statusText, { color: visual.color }]}>{statusLabel}</Text>
          {banner.queuedCount > 0 && (
            <Text style={[styles.countText, { color: visual.color }]}>({banner.queuedCount})</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, !exportFn && styles.actionButtonDisabled]}
            onPress={handleExport}
            disabled={!exportFn}
            accessibilityLabel={t.offline.exportData}
          >
            <Text style={[styles.actionText, !exportFn && styles.actionTextDisabled]}>
              {t.offline.exportData}
            </Text>
          </TouchableOpacity>

          {showRetry && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleRetry}
              accessibilityLabel={t.offline.retry}
            >
              <Text style={styles.actionText}>{t.offline.retry}</Text>
            </TouchableOpacity>
          )}

          {showDiscard && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDiscard}
              accessibilityLabel={t.offline.discard}
            >
              <Text style={styles.actionText}>{t.offline.discard}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Warning flags */}
      {banner.queueNearLimit && (
        <View style={styles.flagRow}>
          <Ionicons name="trending-up-outline" size={12} color="#FF9800" />
          <Text style={styles.flagText}>{t.offline.nearLimit}</Text>
        </View>
      )}
      {banner.schemaQuarantine && (
        <View style={styles.flagRow}>
          <Ionicons name="shield-outline" size={12} color="#EF4444" />
          <Text style={[styles.flagText, styles.flagTextError]}>{t.offline.quarantined}</Text>
        </View>
      )}

      {/* Conflict rows — always visible while unresolved (AC 9) */}
      {conflicts.length > 0 && (
        <View style={styles.conflictList}>
          {conflicts.map((record: ConflictRecord) => (
            <View key={record.opId} style={styles.conflictRow}>
              <Ionicons name="git-merge-outline" size={12} color="#F97316" />
              <View style={styles.conflictMeta}>
                <Text style={styles.conflictEntity}>{record.entity}</Text>
                <Text style={styles.conflictEndpoint} numberOfLines={1}>
                  {record.endpoint}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => handleDismissConflict(record.opId)}
                accessibilityLabel={t.offline.discard}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  countText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.5)',
    marginLeft: 6,
  },
  actionButtonDisabled: {
    borderColor: '#CBD5E1',
    opacity: 0.6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#007AFF',
  },
  actionTextDisabled: {
    color: '#94A3B8',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  flagText: {
    fontSize: 11,
    color: '#FF9800',
    marginLeft: 4,
  },
  flagTextError: {
    color: '#EF4444',
  },
  conflictList: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    paddingTop: 6,
  },
  conflictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  conflictMeta: {
    flex: 1,
    marginLeft: 6,
  },
  conflictEntity: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  conflictEndpoint: {
    fontSize: 11,
    color: '#64748B',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginHorizontal: 16,
    marginTop: 6,
  },
  cachedBadgeText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 4,
  },
});

export default OfflineStatusBanner;
