import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { friendsApi } from '../services/friendsApi';
import { userApi } from '../services/userApi';

interface UserSearchResult {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  skillLevel?: string;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
}

export default function AddFriendScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(() => {
        searchUsers();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const loadSuggestions = async () => {
    try {
      setLoadingSuggestions(true);
      const data = await friendsApi.getFriendSuggestions(10);
      setSuggestions(data);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const searchUsers = async () => {
    if (searchQuery.trim().length < 2) return;

    try {
      setSearching(true);
      const results = await userApi.searchUsers(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string, userName: string) => {
    try {
      setSendingRequestTo(userId);
      await friendsApi.sendFriendRequest(userId, `Hi! Let's be badminton friends!`);
      
      // Update the UI
      const updateUser = (user: UserSearchResult) =>
        user.id === userId ? { ...user, hasPendingRequest: true } : user;
      
      setSearchResults(prev => prev.map(updateUser));
      setSuggestions(prev => prev.map(updateUser));
      
      Alert.alert('Success', `Friend request sent to ${userName}`);
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', error.message || 'Failed to send friend request');
    } finally {
      setSendingRequestTo(null);
    }
  };

  const renderUserCard = ({ item }: { item: UserSearchResult }) => {
    const isSending = sendingRequestTo === item.id;

    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
            )}
          </View>

          {/* User Details */}
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{item.name}</Text>
            {item.email && (
              <Text style={styles.userEmail}>{item.email}</Text>
            )}
            {item.skillLevel && (
              <View style={styles.skillBadge}>
                <Text style={styles.skillText}>{item.skillLevel}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          {item.isFriend ? (
            <View style={styles.friendBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.friendText}>Friends</Text>
            </View>
          ) : item.hasPendingRequest ? (
            <View style={styles.pendingBadge}>
              <Ionicons name="time-outline" size={16} color="#FF9800" />
              <Text style={styles.pendingText}>Pending</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, isSending && styles.buttonDisabled]}
              onPress={() => handleSendRequest(item.id, item.name)}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  <Ionicons name="person-add" size={18} color="#007AFF" />
                  <Text style={styles.addButtonText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderSearchSection = () => {
    if (searchQuery.trim().length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Search Results</Text>
          {searching && <ActivityIndicator size="small" color="#007AFF" />}
        </View>

        {searchResults.length === 0 && !searching ? (
          <View style={styles.emptySection}>
            <Ionicons name="search-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No users found</Text>
            <Text style={styles.emptySubtext}>Try a different search term</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            renderItem={renderUserCard}
            scrollEnabled={false}
          />
        )}
      </View>
    );
  };

  const renderSuggestionsSection = () => {
    if (searchQuery.trim().length > 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Suggested Friends</Text>
          {loadingSuggestions && <ActivityIndicator size="small" color="#007AFF" />}
        </View>

        {suggestions.length === 0 && !loadingSuggestions ? (
          <View style={styles.emptySection}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No suggestions yet</Text>
            <Text style={styles.emptySubtext}>
              Play some games to get friend suggestions!
            </Text>
          </View>
        ) : (
          <FlatList
            data={suggestions}
            keyExtractor={item => item.id}
            renderItem={renderUserCard}
            scrollEnabled={false}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {renderSearchSection()}
            {renderSuggestionsSection()}
          </>
        }
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 8
  },
  content: {
    padding: 15
  },
  section: {
    marginBottom: 25
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333'
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  avatarContainer: {
    marginRight: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e0e0e0'
  },
  avatarPlaceholder: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  userDetails: {
    flex: 1
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4
  },
  skillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  skillText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '600'
  },
  actionContainer: {
    marginLeft: 10
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4
  },
  addButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600'
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4
  },
  friendText: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600'
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4
  },
  pendingText: {
    color: '#FF9800',
    fontSize: 13,
    fontWeight: '600'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 4
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center'
  }
});
