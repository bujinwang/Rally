import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tournamentApi, { Tournament, TournamentFilters } from '../services/tournamentApi';

const TournamentListScreen: React.FC = () => {
  const navigation = useNavigation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TournamentFilters>({
    status: 'REGISTRATION_OPEN',
    visibility: 'PUBLIC',
    limit: 20,
  });

  useEffect(() => {
    loadTournaments();
  }, [filters]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const response = await tournamentApi.getTournaments(filters);
      setTournaments(response.tournaments);
    } catch (error) {
      console.error('Error loading tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTournaments();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'REGISTRATION_OPEN':
        return '#28a745';
      case 'IN_PROGRESS':
        return '#ffc107';
      case 'COMPLETED':
        return '#007AFF';
      case 'CANCELLED':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'REGISTRATION_OPEN':
        return 'Registration Open';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderTournamentItem = ({ item }: { item: Tournament }) => (
    <TouchableOpacity
      style={[styles.tournamentCard, { backgroundColor: '#fff' }]}
      onPress={() => {
        // For now, just show an alert - navigation setup needed
        alert(`Tournament: ${item.name}`);
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleContainer}>
          <Text style={[styles.tournamentName, { color: '#333' }]}>
            {item.name}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) }
            ]}
          >
            <Text style={styles.statusText}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>
        <Text style={[styles.organizerText, { color: '#666' }]}>
          by {item.organizerName}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <Text style={[styles.infoText, { color: '#666' }]}>
            {formatDate(item.startDate)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={[styles.infoText, { color: '#666' }]}>
            {item.venueName || 'TBD'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="people-outline" size={16} color="#666" />
          <Text style={[styles.infoText, { color: '#666' }]}>
            {item.maxPlayers} players max
          </Text>
        </View>

        {item.entryFee > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={16} color="#666" />
            <Text style={[styles.infoText, { color: '#666' }]}>
              ${item.entryFee} entry fee
            </Text>
          </View>
        )}
      </View>

      {item.description && (
        <Text
          style={[styles.description, { color: '#666' }]}
          numberOfLines={2}
        >
          {item.description}
        </Text>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="trophy-outline" size={64} color="#ccc" />
      <Text style={[styles.emptyTitle, { color: '#333' }]}>
        No Tournaments Found
      </Text>
      <Text style={[styles.emptySubtitle, { color: '#666' }]}>
        Check back later for upcoming tournaments
      </Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={[styles.loadingText, { color: '#666' }]}>
            Loading tournaments...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: '#333' }]}>
          Tournaments
        </Text>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: '#007AFF' }]}
          onPress={() => {
            // For now, just show an alert - navigation setup needed
            alert('Create Tournament - Feature coming soon!');
          }}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filters.status === 'REGISTRATION_OPEN' && { backgroundColor: '#007AFF' }
          ]}
          onPress={() => setFilters({ ...filters, status: 'REGISTRATION_OPEN' })}
        >
          <Text style={[
            styles.filterButtonText,
            { color: filters.status === 'REGISTRATION_OPEN' ? 'white' : '#333' }
          ]}>
            Open
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filters.status === 'IN_PROGRESS' && { backgroundColor: '#007AFF' }
          ]}
          onPress={() => setFilters({ ...filters, status: 'IN_PROGRESS' })}
        >
          <Text style={[
            styles.filterButtonText,
            { color: filters.status === 'IN_PROGRESS' ? 'white' : '#333' }
          ]}>
            Live
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filters.status === 'COMPLETED' && { backgroundColor: '#007AFF' }
          ]}
          onPress={() => setFilters({ ...filters, status: 'COMPLETED' })}
        >
          <Text style={[
            styles.filterButtonText,
            { color: filters.status === 'COMPLETED' ? 'white' : '#333' }
          ]}>
            Completed
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tournaments}
        renderItem={renderTournamentItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterButtonText: {
    fontWeight: '500',
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  tournamentCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  tournamentName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  organizerText: {
    fontSize: 14,
  },
  cardBody: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    marginLeft: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default TournamentListScreen;