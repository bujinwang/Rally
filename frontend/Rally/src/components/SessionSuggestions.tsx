// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import sessionApi from '../services/sessionApi';

interface Suggestion {
  id: string;
  playerNames: string[];
  location: string | null;
  dayOfWeek: number;
  typicalTime: string;
  sessionCount: number;
  daysSinceLastSession: number;
  lastSessionName: string;
  nextPredictedTime?: string;
}

interface Props {
  deviceId: string;
  style?: any;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SessionSuggestions({ deviceId, style }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    if (deviceId) fetchSuggestions();
  }, [deviceId]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/session-suggestions/${deviceId}`);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data.suggestions);
      }
    } catch (e) {
      setError('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromSuggestion = (suggestion: Suggestion) => {
    (navigation as any).navigate('CreateSession', {
      prefill: {
        location: suggestion.location,
        invitePlayerNames: suggestion.playerNames,
        predictedDate: suggestion.nextPredictedTime,
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.loadingText}>Finding your regular groups...</Text>
      </View>
    );
  }

  if (error || suggestions.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>🔄 Regular Groups</Text>
      <Text style={styles.subtitle}>Create next session for teams you play with often</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {suggestions.map(suggestion => (
          <TouchableOpacity
            key={suggestion.id}
            style={styles.card}
            onPress={() => handleCreateFromSuggestion(suggestion)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.daysAgo}>
                {suggestion.daysSinceLastSession}d ago
              </Text>
              <Text style={styles.sessionCount}>
                {suggestion.sessionCount}x
              </Text>
            </View>

            <Text style={styles.playersList} numberOfLines={2}>
              👥 {suggestion.playerNames.join(', ')}
            </Text>

            <View style={styles.cardDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="location" size={14} color="#666" />
                <Text style={styles.detailText}>
                  {suggestion.location || 'Usual spot'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="time" size={14} color="#666" />
                <Text style={styles.detailText}>
                  {DAY_NAMES[suggestion.dayOfWeek]}s at {suggestion.typicalTime}
                </Text>
              </View>
            </View>

            <View style={styles.createBtn}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Create Session</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#999',
    marginLeft: 8,
  },
  scroll: {
    marginHorizontal: -8,
  },
  card: {
    width: 260,
    backgroundColor: '#f8f9ff',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  daysAgo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF9500',
  },
  sessionCount: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  playersList: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 10,
    lineHeight: 20,
  },
  cardDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
