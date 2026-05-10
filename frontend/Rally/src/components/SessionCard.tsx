import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { DiscoveryResult } from '../services/discoveryApi';

interface SessionCardProps {
  session: DiscoveryResult;
  onJoin: () => void;
  showDistance: boolean;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onJoin,
  showDistance,
}) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getAvailabilityColor = () => {
    const ratio = session.currentPlayers / session.maxPlayers;
    if (ratio >= 0.9) return '#dc3545'; // Red - almost full
    if (ratio >= 0.7) return '#ffc107'; // Yellow - getting full
    return '#28a745'; // Green - available
  };

  const getSkillLevelColor = (skillLevel?: string) => {
    switch (skillLevel?.toLowerCase()) {
      case 'beginner': return '#28a745';
      case 'intermediate': return '#ffc107';
      case 'advanced': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const handleJoinPress = () => {
    if (session.currentPlayers >= session.maxPlayers) {
      Alert.alert('Session Full', 'This session is already at maximum capacity.');
      return;
    }
    onJoin();
  };

  return (
    <View style={styles.card}>
      {/* Header with title and relevance score */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {session.name}
          </Text>
          <View style={styles.relevanceBadge}>
            <Text style={styles.relevanceText}>
              {Math.round(session.relevanceScore)}%
            </Text>
          </View>
        </View>
        <Text style={styles.organizer}>
          by {session.organizerName}
        </Text>
      </View>

      {/* Location and distance */}
      <View style={styles.locationContainer}>
        <Text style={styles.location} numberOfLines={1}>
          📍 {session.location}
        </Text>
        {showDistance && session.distance !== undefined && (
          <Text style={styles.distance}>
            {session.distance < 1
              ? `${Math.round(session.distance * 1000)}m away`
              : `${session.distance.toFixed(1)}km away`
            }
          </Text>
        )}
      </View>

      {/* Date and time */}
      <View style={styles.datetimeContainer}>
        <Text style={styles.date}>
          📅 {formatDate(session.scheduledAt)}
        </Text>
        <Text style={styles.time}>
          🕐 {formatTime(session.scheduledAt)}
        </Text>
      </View>

      {/* Session details */}
      <View style={styles.detailsContainer}>
        {/* Player count */}
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Players</Text>
          <View style={styles.playerCountContainer}>
            <Text style={[styles.playerCount, { color: getAvailabilityColor() }]}>
              {session.currentPlayers}/{session.maxPlayers}
            </Text>
            <View style={[styles.availabilityIndicator, { backgroundColor: getAvailabilityColor() }]} />
          </View>
        </View>

        {/* Skill level */}
        {session.skillLevel && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Skill</Text>
            <Text style={[styles.skillLevel, { color: getSkillLevelColor(session.skillLevel) }]}>
              {session.skillLevel.charAt(0).toUpperCase() + session.skillLevel.slice(1)}
            </Text>
          </View>
        )}

        {/* Court type */}
        {session.courtType && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Court</Text>
            <Text style={styles.courtType}>
              {session.courtType.charAt(0).toUpperCase() + session.courtType.slice(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Join button */}
      <TouchableOpacity
        style={[
          styles.joinButton,
          session.currentPlayers >= session.maxPlayers && styles.joinButtonDisabled
        ]}
        onPress={handleJoinPress}
        disabled={session.currentPlayers >= session.maxPlayers}
      >
        <Text style={[
          styles.joinButtonText,
          session.currentPlayers >= session.maxPlayers && styles.joinButtonTextDisabled
        ]}>
          {session.currentPlayers >= session.maxPlayers ? 'Session Full' : 'Join Session'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  header: {
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
    marginRight: 8,
  },
  relevanceBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  relevanceText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  organizer: {
    fontSize: 14,
    color: '#6c757d',
  },
  locationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  location: {
    fontSize: 14,
    color: '#495057',
    flex: 1,
    marginRight: 8,
  },
  distance: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  date: {
    fontSize: 14,
    color: '#495057',
  },
  time: {
    fontSize: 14,
    color: '#495057',
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  playerCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playerCount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  availabilityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  skillLevel: {
    fontSize: 14,
    fontWeight: '600',
  },
  courtType: {
    fontSize: 14,
    color: '#495057',
  },
  joinButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButtonTextDisabled: {
    color: '#adb5bd',
  },
});

export default SessionCard;