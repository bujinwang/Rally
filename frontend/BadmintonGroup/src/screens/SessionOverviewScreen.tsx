import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// Components
import SessionHeader from '../components/design-system/Layout/SessionHeader';
import PlayerCountIndicator from '../components/design-system/Layout/PlayerCountIndicator';
import ActionButtons from '../components/design-system/Button/ActionButtons';
import { PlayerCard } from '../components/design-system/Card';

// Types
import { SessionData } from '../components/design-system/Layout/SessionHeader.types';
import { Player } from '../components/design-system/Card/PlayerCard.types';
import { colors, spacing, typography } from '../theme/theme';

// Services
import { mvpApiService, MvpSession, MvpPlayer } from '../services/mvpApiService';
import { createShareableLinks } from '../components/ShareLinkHandler';
import socketService from '../services/socketService';
import sessionApi from '../services/sessionApi';

// Redux (if needed)
// import { useAppDispatch, useAppSelector } from '../store';

interface SessionOverviewScreenProps {}

type RouteParams = {
  sessionId?: string;
  shareCode?: string;
};

// Helper function to transform MvpSession to SessionData
const transformMvpSessionToSessionData = (mvpSession: MvpSession): SessionData => {
  const sessionDate = new Date(mvpSession.scheduledAt);
  return {
    id: mvpSession.id,
    title: mvpSession.name || 'Badminton Session',
    date: sessionDate.toLocaleDateString('en-US'),
    time: sessionDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    location: {
      name: mvpSession.location || 'TBD',
      address: '',
    },
    shareCode: mvpSession.shareCode,
    organizerId: mvpSession.ownerDeviceId || 'unknown',
    organizerName: mvpSession.ownerName,
    maxPlayers: mvpSession.maxPlayers,
    status: mvpSession.status === 'ACTIVE' ? 'upcoming' : 'completed',
  };
};

// Helper function to transform MvpPlayer to Player
const transformMvpPlayerToPlayer = (mvpPlayer: MvpPlayer, ownerDeviceId?: string): Player => {
  // Map MVP status to our player status
  let playerStatus: 'active' | 'confirmed' | 'waiting';
  switch (mvpPlayer.status) {
    case 'ACTIVE':
      playerStatus = 'active';
      break;
    case 'RESTING':
      playerStatus = 'waiting';
      break;
    default:
      playerStatus = 'confirmed';
  }
  
  return {
    id: mvpPlayer.id,
    name: mvpPlayer.name,
    gamesPlayed: mvpPlayer.gamesPlayed,
    status: playerStatus,
    isOrganizer: mvpPlayer.deviceId === ownerDeviceId,
  };
};

export const SessionOverviewScreen: React.FC<SessionOverviewScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { sessionId, shareCode } = route.params || {};
  
  // State
  const [session, setSession] = useState<SessionData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState({
    join: false,
    copy: false,
    share: false,
    refresh: false,
  });
  
  // Current user state (based on device ID)
  const currentPlayer = players.find(p => p.isOrganizer || (deviceId && p.id.includes(deviceId)));
  const isOrganizer = session ? deviceId === session.organizerId : false;

  // Load session data and device ID
  useEffect(() => {
    initializeDeviceId();
  }, []);
  
  useEffect(() => {
    if (shareCode || sessionId) {
      loadSessionData();
      setupSocketConnection();
    }
    
    // Cleanup socket on unmount
    return () => {
      socketService.leaveSession();
      socketService.removeAllListeners();
    };
  }, [sessionId, shareCode]);
  
  const initializeDeviceId = async () => {
    try {
      const id = await sessionApi.getDeviceId();
      setDeviceId(id);
    } catch (error) {
      console.error('Failed to get device ID:', error);
    }
  };
  
  const setupSocketConnection = async () => {
    try {
      const codeToUse = shareCode || sessionId;
      if (!codeToUse) return;
      
      await socketService.connect();
      await socketService.joinSession(codeToUse);
      
      // Listen for session updates
      socketService.on('mvp-session-updated', handleSessionUpdate);
      socketService.on('error', handleSocketError);
      
      console.log('📡 Socket connection established for session:', codeToUse);
    } catch (error) {
      console.error('Failed to setup socket connection:', error);
      // Don't show error to user, socket is optional enhancement
    }
  };
  
  const handleSessionUpdate = (data: { session: MvpSession; timestamp: string }) => {
    console.log('📡 Received session update:', data.timestamp);
    
    // Transform and update session data
    const transformedSession = transformMvpSessionToSessionData(data.session);
    const transformedPlayers = data.session.players.map(p => 
      transformMvpPlayerToPlayer(p, data.session.ownerDeviceId)
    );
    
    setSession(transformedSession);
    setPlayers(transformedPlayers);
    
    // Cache the updated session
    mvpApiService.cacheSession(data.session);
  };
  
  const handleSocketError = (error: { message: string }) => {
    console.error('Socket error:', error.message);
    // Don't show error to user, socket errors are non-critical
  };

  const loadSessionData = async () => {
    setLoading(prev => ({ ...prev, refresh: true }));
    setError(null);
    
    try {
      const codeToUse = shareCode || sessionId;
      if (!codeToUse) {
        throw new Error('No share code or session ID provided');
      }
      
      // Try to get cached session first for better performance
      let cachedSession = null;
      try {
        cachedSession = await mvpApiService.getCachedSession(codeToUse);
      } catch (error) {
        console.log('No cached session available');
      }
      
      if (cachedSession) {
        const transformedSession = transformMvpSessionToSessionData(cachedSession);
        const transformedPlayers = cachedSession.players.map(p => 
          transformMvpPlayerToPlayer(p, cachedSession.ownerDeviceId)
        );
        setSession(transformedSession);
        setPlayers(transformedPlayers);
      }
      
      // Always fetch fresh data
      const response = await mvpApiService.getSessionByShareCode(codeToUse);
      
      if (response.success && response.data?.session) {
        const mvpSession = response.data.session;
        
        // Cache the session
        await mvpApiService.cacheSession(mvpSession);
        
        // Transform and set the data
        const transformedSession = transformMvpSessionToSessionData(mvpSession);
        const transformedPlayers = mvpSession.players.map(p => 
          transformMvpPlayerToPlayer(p, mvpSession.ownerDeviceId)
        );
        
        setSession(transformedSession);
        setPlayers(transformedPlayers);
      } else {
        throw new Error(response.error?.message || 'Failed to load session');
      }
    } catch (error: any) {
      console.error('Failed to load session data:', error);
      setError(error.message || 'Failed to load session data');
      
      // If no cached data was loaded, show alert
      if (!session) {
        Alert.alert('Error', 'Failed to load session data. Please check your connection and try again.');
      }
    } finally {
      setLoading(prev => ({ ...prev, refresh: false }));
    }
  };

  // Actions
  const handleJoin = useCallback(async () => {
    if (!session || !deviceId) return;
    
    setLoading(prev => ({ ...prev, join: true }));
    
    try {
      if (currentPlayer) {
        // User is already joined, update their status to RESTING (leave)
        const response = await mvpApiService.updatePlayerStatus(
          currentPlayer.id, 
          'RESTING'
        );
        
        if (response.success) {
          // Emit socket event for real-time updates
          socketService.emitPlayerStatusUpdate(session.shareCode, currentPlayer.id, 'RESTING');
          
          // Update local state immediately for better UX
          setPlayers(prevPlayers => 
            prevPlayers.map(p => 
              p.id === currentPlayer.id 
                ? { ...p, status: 'waiting' } 
                : p
            )
          );
        } else {
          throw new Error(response.error?.message || 'Failed to leave session');
        }
      } else {
        // User wants to join - prompt for name
        Alert.prompt(
          '加入游戏',
          '请输入您的姓名:',
          async (name) => {
            if (name && name.trim()) {
              try {
                const response = await mvpApiService.joinSession(session.shareCode, {
                  name: name.trim(),
                  deviceId,
                });
                
                if (response.success && response.data?.player) {
                  // Emit socket event for real-time updates
                  socketService.emitPlayerJoined(session.shareCode, response.data.player);
                  
                  // Reload session data to get updated player list
                  await loadSessionData();
                } else {
                  throw new Error(response.error?.message || 'Failed to join session');
                }
              } catch (error: any) {
                console.error('Join failed:', error);
                Alert.alert('Error', error.message || 'Failed to join session');
              }
            }
          },
          'plain-text'
        );
      }
    } catch (error: any) {
      console.error('Join action failed:', error);
      Alert.alert('Error', error.message || 'Failed to update status');
    } finally {
      setLoading(prev => ({ ...prev, join: false }));
    }
  }, [currentPlayer, session, deviceId, loadSessionData]);

  const handleCopyList = useCallback(async () => {
    setLoading(prev => ({ ...prev, copy: true }));
    try {
      const formattedMessage = formatPlayerListForShare();
      await Clipboard.setStringAsync(formattedMessage);
      
      Alert.alert('Success', 'Player list copied to clipboard!');
    } catch (error) {
      console.error('Copy failed:', error);
      Alert.alert('Error', 'Failed to copy player list');
    } finally {
      setLoading(prev => ({ ...prev, copy: false }));
    }
  }, [session, players]);

  const handleShare = useCallback(async () => {
    if (!session) return;
    
    setLoading(prev => ({ ...prev, share: true }));
    try {
      // Create shareable links with real session data
      const links = createShareableLinks(
        session.shareCode,
        session.title,
        new Date(session.date + ' ' + session.time).toISOString(),
        session.location.name,
        session.organizerName,
        players.map(p => ({ name: p.name, status: p.status }))
      );
      
      // Copy WeChat message (Chinese format) to clipboard
      await Clipboard.setStringAsync(links.weChatMessage);
      Alert.alert('Success', '分享信息已复制到剪贴板！\n\n可以直接粘贴到微信或其他聊天软件。');
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert('Error', 'Failed to create share message');
    } finally {
      setLoading(prev => ({ ...prev, share: false }));
    }
  }, [session, players]);

  const handlePlayerAction = useCallback(async (player: Player) => {
    if (!isOrganizer || !session) {
      // Only organizers can manage other players
      return;
    }
    
    try {
      // Determine the next status based on current status
      let newStatus: 'ACTIVE' | 'RESTING' | 'LEFT';
      let actionText: string;
      
      switch (player.status) {
        case 'waiting':
          newStatus = 'ACTIVE';
          actionText = '上场';
          break;
        case 'active':
          newStatus = 'RESTING';
          actionText = '下场';
          break;
        case 'confirmed':
        default:
          newStatus = 'ACTIVE';
          actionText = '上场';
          break;
      }
      
      Alert.alert(
        '管理球员',
        `确认让 ${player.name} ${actionText}？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: actionText,
            onPress: async () => {
              try {
                const response = await mvpApiService.updatePlayerStatus(player.id, newStatus);
                
                if (response.success) {
                  // Emit socket event for real-time updates
                  socketService.emitPlayerStatusUpdate(session.shareCode, player.id, newStatus);
                  
                  // Update local state immediately
                  setPlayers(prevPlayers => 
                    prevPlayers.map(p => 
                      p.id === player.id 
                        ? { ...p, status: newStatus === 'ACTIVE' ? 'active' : 'waiting' }
                        : p
                    )
                  );
                } else {
                  throw new Error(response.error?.message || 'Failed to update player status');
                }
              } catch (error: any) {
                console.error('Player action failed:', error);
                Alert.alert('Error', error.message || 'Failed to update player status');
              }
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Player action failed:', error);
      Alert.alert('Error', error.message || 'Failed to manage player');
    }
  }, [isOrganizer, session]);

  // Helper functions
  const formatPlayerListForShare = (): string => {
    if (!session) return '';
    
    const confirmedPlayers = players.filter(p => p.status === 'confirmed' || p.status === 'active');
    const waitingPlayers = players.filter(p => p.status === 'waiting');
    
    let message = `${session.title} - ${session.date}\n`;
    message += `🕰 ${session.time} • 📍 ${session.location.name}\n\n`;
    
    if (confirmedPlayers.length > 0) {
      message += `✅ 已确认 (${confirmedPlayers.length}):\n`;
      message += confirmedPlayers.map(p => p.name).join(', ') + '\n\n';
    }
    
    if (waitingPlayers.length > 0) {
      message += `⏳ 等待确认 (${waitingPlayers.length}):\n`;
      message += waitingPlayers.map(p => p.name).join(', ') + '\n\n';
    }
    
    message += `🔗 加入链接: https://badmintongroup.app/join/${session.shareCode}`;
    
    return message;
  };

  const groupPlayersByStatus = () => {
    const active = players.filter(p => p.status === 'active');
    const waiting = players.filter(p => p.status === 'waiting'); 
    const confirmed = players.filter(p => p.status === 'confirmed');
    
    return { active, waiting, confirmed };
  };

  // Don't render if session is not loaded yet
  if (!session && !error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  // Show error state if session failed to load
  if (error && !session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load session</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  if (!session) return null;

  const { active, waiting, confirmed } = groupPlayersByStatus();
  const totalConfirmed = active.length + confirmed.length;
  const canJoin = totalConfirmed < session.maxPlayers;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading.refresh}
            onRefresh={loadSessionData}
            colors={[colors.primary]}
          />
        }
      >
        
        {/* Session Header */}
        <SessionHeader 
          session={session}
          isEditable={isOrganizer}
        />
        
        {/* Player Count Indicator */}
        <PlayerCountIndicator 
          confirmed={totalConfirmed}
          total={session.maxPlayers}
        />
        
        {/* Action Buttons */}
        <ActionButtons
          canJoin={canJoin}
          isJoined={!!currentPlayer}
          onJoin={handleJoin}
          joinLoading={loading.join}
          onCopyList={handleCopyList}
          copyLoading={loading.copy}
          onShare={handleShare}
          shareLoading={loading.share}
          isOrganizer={isOrganizer}
        />

        {/* Pairing Button - Only show for organizers when there are enough active players */}
        {isOrganizer && active.length >= 4 && (
          <View style={styles.pairingSection}>
            <TouchableOpacity
              style={styles.pairingButton}
              onPress={() => navigation.navigate('Pairing' as never)}
            >
              <Ionicons name="shuffle" size={20} color="#ffffff" />
              <Text style={styles.pairingButtonText}>生成配对</Text>
            </TouchableOpacity>
            <Text style={styles.pairingDescription}>
              为 {active.length} 位活跃球员生成公平配对
            </Text>
          </View>
        )}
        
        {/* Players List */}
        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>场上球员 ({active.length}/4)</Text>
            {active.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                variant="active"
                onActionPress={handlePlayerAction}
              />
            ))}
          </View>
        )}
        
        {waiting.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>等候球员 ({waiting.length})</Text>
            {waiting.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                variant="waiting"
                onActionPress={handlePlayerAction}
              />
            ))}
          </View>
        )}
        
        {confirmed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>已确认球员 ({confirmed.length})</Text>
            {confirmed.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                variant="confirmed"
                onActionPress={handlePlayerAction}
              />
            ))}
          </View>
        )}
        
        {/* Empty state */}
        {players.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              还没有球员加入这个游戏
            </Text>
            <Text style={styles.emptyStateSubtext}>
              分享链接邀请朋友们加入！
            </Text>
          </View>
        )}
        
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  
  section: {
    marginBottom: spacing.lg,
  },
  
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  
  errorSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  pairingSection: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },

  pairingButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  pairingButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  pairingDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});

export default SessionOverviewScreen;