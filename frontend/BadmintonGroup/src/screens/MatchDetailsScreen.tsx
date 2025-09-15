import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSession } from '../contexts/SessionContext';
import matchSchedulingApiService from '../services/matchSchedulingApi';
import { ScheduledMatch } from '../types/matchScheduling';
import CalendarIntegrationUI from '../components/CalendarIntegrationUI';

type MatchDetailsRouteProp = RouteProp<{ MatchDetails: { matchId: string } }, 'MatchDetails'>;

const MatchDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { session, currentUser, isOrganizer } = useSession();

  const { matchId } = route.params;

  const [match, setMatch] = useState<ScheduledMatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matchId) {
      loadMatchDetails();
    }
  }, [matchId]);

  const loadMatchDetails = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const matchDetails = await matchSchedulingApiService.getMatchDetails(matchId);
      setMatch(matchDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load match details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMatch = () => {
    if (!match) return;

    Alert.alert(
      'Cancel Match',
      'Are you sure you want to cancel this match? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: cancelMatch,
        },
      ]
    );
  };

  const cancelMatch = async () => {
    if (!match) return;

    setIsUpdating(true);
    try {
      const result = await matchSchedulingApiService.cancelScheduledMatch(match.id);

      if (result.success) {
        Alert.alert('Success', 'Match cancelled successfully');
        // Refresh match details
        await loadMatchDetails();
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to cancel match');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStatus = (newStatus: ScheduledMatch['status']) => {
    if (!match) return;

    Alert.alert(
      'Update Status',
      `Change match status to ${newStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => updateMatchStatus(newStatus),
        },
      ]
    );
  };

  const updateMatchStatus = async (newStatus: ScheduledMatch['status']) => {
    if (!match) return;

    setIsUpdating(true);
    try {
      const result = await matchSchedulingApiService.updateScheduledMatch(match.id, {
        status: newStatus
      });

      if (result.success && result.data) {
        setMatch(result.data);
        Alert.alert('Success', 'Match status updated successfully');
      } else {
        Alert.alert('Error', result.error || 'Failed to update match status');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update match status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShareMatch = async () => {
    if (!match) return;

    try {
      const matchDate = new Date(match.scheduledAt).toLocaleString();
      const shareMessage = `🏓 Badminton Match: ${match.title}\n📅 ${matchDate}\n🏢 ${match.courtName || 'TBD'}\n👥 ${match.matchType}\n\nJoin us for a great game!`;

      await Share.share({
        message: shareMessage,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share match details');
    }
  };

  const handleSyncCalendar = async () => {
    if (!match) return;

    Alert.alert(
      'Sync to Calendar',
      'Choose calendar provider:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Google Calendar',
          onPress: () => syncToCalendar('GOOGLE'),
        },
        {
          text: 'Apple Calendar',
          onPress: () => syncToCalendar('APPLE'),
        },
        {
          text: 'Outlook',
          onPress: () => syncToCalendar('OUTLOOK'),
        },
      ]
    );
  };

  const syncToCalendar = async (provider: 'GOOGLE' | 'APPLE' | 'OUTLOOK') => {
    if (!match) return;

    setIsUpdating(true);
    try {
      const result = await matchSchedulingApiService.syncWithCalendar(match.id, {
        provider,
        includeReminders: true,
        reminderMinutes: 15,
      });

      Alert.alert('Success', result.message);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to sync to calendar');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return '#007AFF';
      case 'CONFIRMED': return '#28a745';
      case 'IN_PROGRESS': return '#ffc107';
      case 'COMPLETED': return '#6c757d';
      case 'CANCELLED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'Scheduled';
      case 'CONFIRMED': return 'Confirmed';
      case 'IN_PROGRESS': return 'In Progress';
      case 'COMPLETED': return 'Completed';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  };

  const canUpdateStatus = (currentStatus: string, newStatus: string) => {
    const statusFlow: Record<string, string[]> = {
      'SCHEDULED': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['IN_PROGRESS', 'CANCELLED'],
      'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [],
      'CANCELLED': [],
    };

    return statusFlow[currentStatus]?.includes(newStatus) || false;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      full: date.toLocaleString(),
    };
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading match details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error || 'Match not found'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadMatchDetails}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dateTime = formatDateTime(match.scheduledAt);
  const isMatchCreator = match.createdBy === currentUser?.id;
  const canModify = isOrganizer || isMatchCreator;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Match Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Match Header */}
        <View style={styles.matchHeader}>
          <Text style={styles.matchTitle}>{match.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(match.status) }]}>
            <Text style={styles.statusText}>{getStatusText(match.status)}</Text>
          </View>
        </View>

        {/* Match Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Match Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>{dateTime.date}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Time:</Text>
            <Text style={styles.infoValue}>{dateTime.time}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration:</Text>
            <Text style={styles.infoValue}>{match.duration} minutes</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>{match.matchType}</Text>
          </View>

          {match.courtName && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Court:</Text>
              <Text style={styles.infoValue}>{match.courtName}</Text>
            </View>
          )}

          {match.location && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location:</Text>
              <Text style={styles.infoValue}>{match.location}</Text>
            </View>
          )}
        </View>

        {/* Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players</Text>

          {[match.player1Id, match.player2Id, match.player3Id, match.player4Id]
            .filter(Boolean)
            .map((playerId, index) => (
              <View key={playerId} style={styles.playerRow}>
                <Text style={styles.playerLabel}>Player {index + 1}:</Text>
                <Text style={styles.playerValue}>
                  {playerId === currentUser?.id ? 'You' : `Player ${playerId?.slice(0, 8)}...`}
                </Text>
              </View>
            ))}
        </View>

        {/* Description */}
        {match.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{match.description}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShareMatch}
          >
            <Text style={styles.actionButtonText}>📤 Share Match</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar Integration */}
        {match && (
          <CalendarIntegrationUI
            matchId={match.id}
            onSyncComplete={(success, message) => {
              Alert.alert(success ? 'Success' : 'Error', message);
            }}
          />
        )}

        {/* Status Update (for organizers) */}
        {canModify && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <View style={styles.statusButtons}>
              {canUpdateStatus(match.status, 'CONFIRMED') && (
                <TouchableOpacity
                  style={[styles.statusButton, { backgroundColor: '#28a745' }]}
                  onPress={() => handleUpdateStatus('CONFIRMED')}
                  disabled={isUpdating}
                >
                  <Text style={styles.statusButtonText}>Confirm Match</Text>
                </TouchableOpacity>
              )}

              {canUpdateStatus(match.status, 'IN_PROGRESS') && (
                <TouchableOpacity
                  style={[styles.statusButton, { backgroundColor: '#ffc107' }]}
                  onPress={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={isUpdating}
                >
                  <Text style={styles.statusButtonText}>Start Match</Text>
                </TouchableOpacity>
              )}

              {canUpdateStatus(match.status, 'COMPLETED') && (
                <TouchableOpacity
                  style={[styles.statusButton, { backgroundColor: '#6c757d' }]}
                  onPress={() => handleUpdateStatus('COMPLETED')}
                  disabled={isUpdating}
                >
                  <Text style={styles.statusButtonText}>Mark Complete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Cancel Match (for organizers and creators) */}
        {canModify && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelMatch}
            disabled={isUpdating}
          >
            <Text style={styles.cancelButtonText}>Cancel Match</Text>
          </TouchableOpacity>
        )}

        {/* Match Metadata */}
        <View style={styles.metadataSection}>
          <Text style={styles.metadataText}>
            Created: {new Date(match.createdAt).toLocaleString()}
          </Text>
          <Text style={styles.metadataText}>
            Last Updated: {new Date(match.updatedAt).toLocaleString()}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  matchHeader: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  matchTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
    width: 80,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  playerRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  playerLabel: {
    fontSize: 16,
    color: '#666',
    width: 100,
  },
  playerValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  descriptionText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  actionsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statusButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  metadataSection: {
    padding: 16,
    alignItems: 'center',
  },
  metadataText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MatchDetailsScreen;