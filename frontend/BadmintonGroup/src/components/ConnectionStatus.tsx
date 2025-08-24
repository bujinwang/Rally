import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import socketService from '../services/socketService';

interface ConnectionStatusProps {
  showControls?: boolean;
}

export default function ConnectionStatus({ showControls = false }: ConnectionStatusProps) {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'disabled'>('disabled');
  const [isVisible, setIsVisible] = useState(false);

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

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: 'wifi' as const,
          text: 'Live Updates',
          color: '#4CAF50',
          backgroundColor: '#E8F5E8'
        };
      case 'connecting':
        return {
          icon: 'sync' as const,
          text: 'Connecting...',
          color: '#FF9800',
          backgroundColor: '#FFF3E0'
        };
      case 'disconnected':
        return {
          icon: 'wifi-outline' as const,
          text: 'Offline Mode',
          color: '#9E9E9E',
          backgroundColor: '#F5F5F5'
        };
      case 'disabled':
        return {
          icon: 'cloud-offline-outline' as const,
          text: 'Real-time Disabled',
          color: '#9E9E9E',
          backgroundColor: '#F5F5F5'
        };
    }
  };

  if (!isVisible && !showControls) return null;

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      <View style={[styles.status, { backgroundColor: config.backgroundColor }]}>
        <Ionicons name={config.icon} size={14} color={config.color} />
        <Text style={[styles.statusText, { color: config.color }]}>
          {config.text}
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