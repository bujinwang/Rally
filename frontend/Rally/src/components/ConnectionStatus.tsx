import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import socketService from '../services/socketService';
import { useAppSelector } from '../store';
import { selectSyncBanner } from '../store/slices/syncSlice';
import { useTranslation } from '../i18n/LanguageContext';

interface ConnectionStatusProps {
  showControls?: boolean;
}

/** Ionicons name type, derived from the component's own prop type. */
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function ConnectionStatus({ showControls = false }: ConnectionStatusProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'disabled'>('disabled');
  const [isVisible, setIsVisible] = useState(false);

  // Offline write-queue state (Story 6.5). Layered on top of the socket status:
  // when the queue is empty this is inert and the chip keeps its socket-only
  // behaviour and visual language unchanged.
  const sync = useAppSelector(selectSyncBanner);

  useEffect(() => {
    const updateStatus = () => {
      const newStatus = socketService.getConnectionStatus();
      setStatus(newStatus);
      setIsVisible(newStatus !== 'disabled');
    };

    // Check status initially
    updateStatus();

    // Set up listeners for socket events
    socketService.on('connect', updateStatus);
    socketService.on('disconnect', updateStatus);
    socketService.on('error', updateStatus);

    // Check status periodically
    const interval = setInterval(updateStatus, 5000);

    return () => {
      clearInterval(interval);
      socketService.off('connect', updateStatus);
      socketService.off('disconnect', updateStatus);
      socketService.off('error', updateStatus);
    };
  }, []);

  const handleToggleConnection = () => {
    if (status === 'disabled') {
      socketService.enable();
      socketService.connect();
    } else if (status === 'connected') {
      socketService.disable();
    } else if (status === 'disconnected') {
      socketService.connect();
    }
  };

  const getStatusConfig = (): {
    icon: IoniconName;
    text: string;
    color: string;
    backgroundColor: string;
  } => {
    switch (status) {
      case 'connected':
        return {
          icon: 'wifi',
          text: 'Live Updates',
          color: '#4CAF50',
          backgroundColor: '#E8F5E8'
        };
      case 'connecting':
        return {
          icon: 'sync',
          text: 'Connecting...',
          color: '#FF9800',
          backgroundColor: '#FFF3E0'
        };
      case 'disconnected':
        return {
          icon: 'wifi-outline',
          text: 'Offline Mode',
          color: '#9E9E9E',
          backgroundColor: '#F5F5F5'
        };
      case 'disabled':
        return {
          icon: 'cloud-offline-outline',
          text: 'Real-time Disabled',
          color: '#9E9E9E',
          backgroundColor: '#F5F5F5'
        };
    }
  };

  // Show the chip when the socket is visible OR there are pending offline
  // changes worth surfacing, even if real-time was never enabled.
  const hasPendingChanges = sync.queuedCount > 0;
  if (!isVisible && !showControls && !hasPendingChanges) return null;

  const config = getStatusConfig();

  // Overlay the offline queue onto the "Offline Mode" chip: while offline (or
  // with real-time disabled) and queued operations exist, show how many changes
  // are pending. When the queue is empty this overlay is a no-op and the chip
  // keeps its exact socket-only wording/appearance.
  const showPendingOverlay =
    hasPendingChanges && (status === 'disconnected' || status === 'disabled');
  const displayText = showPendingOverlay
    ? `${config.text} · ${t.offline.queued} (${sync.queuedCount})`
    : config.text;

  return (
    <View style={styles.container}>
      <View style={[styles.status, { backgroundColor: config.backgroundColor }]}>
        <Ionicons name={config.icon} size={14} color={config.color} />
        <Text style={[styles.statusText, { color: config.color }]}>
          {displayText}
        </Text>
      </View>
      
      {showControls && (
        <TouchableOpacity 
          style={styles.toggleButton} 
          onPress={handleToggleConnection}
        >
          <Text style={styles.toggleText}>
            {status === 'disabled' ? 'Enable' : status === 'connected' ? 'Disable' : 'Retry'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  toggleText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
});