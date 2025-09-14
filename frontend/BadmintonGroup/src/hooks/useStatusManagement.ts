import { useEffect, useCallback, useState } from 'react';
import socketService from '../services/socketService';
import { Player } from '../components/design-system/Card/PlayerCard.types';

interface StatusRequest {
  requestId: string;
  playerId: string;
  playerName: string;
  action: 'rest' | 'leave';
  reason?: string;
  requestedAt: string;
  requestedBy: 'self' | 'organizer';
}

interface StatusApproval {
  playerId: string;
  playerName: string;
  newStatus: 'ACTIVE' | 'RESTING' | 'LEFT';
  action: 'rest' | 'leave';
  approvedAt: string;
  expiresAt?: string;
  reason?: string;
}

interface StatusDenial {
  playerId: string;
  playerName: string;
  action: 'rest' | 'leave';
  deniedAt: string;
  reason?: string;
}

interface StatusExpiration {
  playerId: string;
  playerName: string;
  newStatus: 'ACTIVE';
  expiredAt: string;
}

interface UseStatusManagementProps {
  shareCode: string;
  currentUserId?: string;
  onStatusRequest?: (request: StatusRequest) => void;
  onStatusApproved?: (approval: StatusApproval) => void;
  onStatusDenied?: (denial: StatusDenial) => void;
  onStatusExpired?: (expiration: StatusExpiration) => void;
  onPlayerStatusChanged?: (playerId: string, newStatus: Player['status'], additionalData?: any) => void;
}

export const useStatusManagement = ({
  shareCode,
  currentUserId,
  onStatusRequest,
  onStatusApproved,
  onStatusDenied,
  onStatusExpired,
  onPlayerStatusChanged
}: UseStatusManagementProps) => {
  const [pendingRequests, setPendingRequests] = useState<StatusRequest[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Handle status change request
  const handleStatusRequest = useCallback((data: StatusRequest) => {
    console.log('📝 Status request received:', data);

    // Add to pending requests if not already there
    setPendingRequests(prev => {
      const exists = prev.find(req => req.requestId === data.requestId);
      if (!exists) {
        return [...prev, data];
      }
      return prev;
    });

    // Notify parent component
    onStatusRequest?.(data);
  }, [onStatusRequest]);

  // Handle status approval
  const handleStatusApproved = useCallback((data: StatusApproval) => {
    console.log('✅ Status approved:', data);

    // Remove from pending requests
    setPendingRequests(prev =>
      prev.filter(req => req.playerId !== data.playerId)
    );

    // Update player status
    onPlayerStatusChanged?.(data.playerId, data.newStatus, {
      action: data.action,
      approvedAt: data.approvedAt,
      expiresAt: data.expiresAt,
      reason: data.reason
    });

    // Notify parent component
    onStatusApproved?.(data);
  }, [onStatusApproved, onPlayerStatusChanged]);

  // Handle status denial
  const handleStatusDenied = useCallback((data: StatusDenial) => {
    console.log('❌ Status denied:', data);

    // Remove from pending requests
    setPendingRequests(prev =>
      prev.filter(req => req.playerId !== data.playerId)
    );

    // Notify parent component
    onStatusDenied?.(data);
  }, [onStatusDenied]);

  // Handle status expiration
  const handleStatusExpired = useCallback((data: StatusExpiration) => {
    console.log('⏰ Status expired:', data);

    // Update player status to ACTIVE
    onPlayerStatusChanged?.(data.playerId, data.newStatus, {
      expiredAt: data.expiredAt
    });

    // Notify parent component
    onStatusExpired?.(data);
  }, [onStatusExpired, onPlayerStatusChanged]);

  // Handle connection status changes
  const handleConnect = useCallback(() => {
    console.log('🔌 Socket connected for status management');
    setIsConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('🔌 Socket disconnected for status management');
    setIsConnected(false);
  }, []);

  // Setup Socket.IO listeners
  useEffect(() => {
    if (!shareCode) return;

    console.log('🎧 Setting up status management listeners for session:', shareCode);

    // Register event listeners
    socketService.on('status_request', handleStatusRequest);
    socketService.on('status_approved', handleStatusApproved);
    socketService.on('status_denied', handleStatusDenied);
    socketService.on('status_expired', handleStatusExpired);
    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);

    // Join session room for real-time updates
    socketService.joinSession(shareCode);

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up status management listeners');

      socketService.off('status_request', handleStatusRequest);
      socketService.off('status_approved', handleStatusApproved);
      socketService.off('status_denied', handleStatusDenied);
      socketService.off('status_expired', handleStatusExpired);
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);

      // Leave session room
      socketService.leaveSession(shareCode);
    };
  }, [
    shareCode,
    handleStatusRequest,
    handleStatusApproved,
    handleStatusDenied,
    handleStatusExpired,
    handleConnect,
    handleDisconnect
  ]);

  // Submit status change request
  const requestStatusChange = useCallback(async (
    playerId: string,
    action: 'rest' | 'leave',
    reason?: string
  ) => {
    try {
      const response = await fetch(`/api/v1/player-status/${playerId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          reason,
          deviceId: currentUserId
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit status request');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to request status change:', error);
      throw error;
    }
  }, [currentUserId]);

  // Approve or deny status request (organizer only)
  const approveStatusRequest = useCallback(async (
    requestId: string,
    approved: boolean,
    reason?: string
  ) => {
    try {
      const response = await fetch(`/api/v1/player-status/approve/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approved,
          reason,
          ownerDeviceId: currentUserId
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process status approval');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to approve/deny status request:', error);
      throw error;
    }
  }, [currentUserId]);

  // Get pending requests for organizer
  const getPendingRequests = useCallback(async (shareCode: string) => {
    try {
      const response = await fetch(`/api/v1/player-status/pending/${shareCode}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get pending requests');
      }

      const result = await response.json();
      return result.data.pendingRequests || [];
    } catch (error) {
      console.error('Failed to get pending requests:', error);
      throw error;
    }
  }, []);

  return {
    // State
    pendingRequests,
    isConnected,

    // Actions
    requestStatusChange,
    approveStatusRequest,
    getPendingRequests,

    // Connection status
    connectionStatus: socketService.getConnectionStatus(),
  };
};