// @ts-nocheck
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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import pairingApiService, { Pairing, PairingResult } from '../../services/pairingApi';

interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  status: string;
}

interface Court {
  id: string;
  name: string;
  players: Player[];
  maxPlayers: number;
}

type AlgorithmType = 'fair' | 'random' | 'skill_balanced' | 'partnership_rotation';

const ALGORITHMS: { key: AlgorithmType; label: string; desc: string }[] = [
  { key: 'fair', label: '⚖️ Fair', desc: 'Balanced by games played' },
  { key: 'random', label: '🎲 Random', desc: 'Pure random shuffle' },
  { key: 'skill_balanced', label: '🎯 Skill', desc: 'Strong + weak paired' },
  { key: 'partnership_rotation', label: '🔄 Rotation', desc: 'Maximize variety' },
];

const PairingScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ params: { sessionId: string; players?: Player[] } }, 'params'>>();
  const { sessionId, players: routePlayers } = route.params || {};

  const [algorithm, setAlgorithm] = useState<AlgorithmType>('fair');
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);
  const [fairnessScore, setFairnessScore] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadPairings();
    }
    if (routePlayers) {
      setAvailablePlayers(routePlayers);
    }
  }, [sessionId]);

  const loadPairings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await pairingApiService.getPairings(sessionId);
      setPairings(result.pairings);
      setFairnessScore(result.fairnessScore);
    } catch {
      // No pairings yet - that's ok
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await pairingApiService.generatePairings(sessionId, algorithm);
      setPairings(result.pairings);
      setFairnessScore(result.fairnessScore);
      Alert.alert('Done', `${result.pairings.length} games generated with ${algorithm.replace('_', ' ')} algorithm`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate pairings');
      Alert.alert('Error', err.message || 'Failed to generate pairings');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = async () => {
    Alert.alert('Clear All', 'Remove all pairings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await pairingApiService.clearPairings(sessionId);
            setPairings([]);
            setFairnessScore(0);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleAddToCourt = (player: Player) => {
    if (!selectedCourt) {
      Alert.alert('Select Court', 'Tap a court first, then tap a player to assign them');
      return;
    }
    // Manual assignment
    setPairings((prev) =>
      prev.map((p) => {
        if (p.id === selectedCourt && p.players.length < 2) {
          return {
            ...p,
            players: [...p.players, { id: player.id, name: player.name, position: 'right' as const }],
          };
        }
        return p;
      })
    );
    setAvailablePlayers((prev) => prev.filter((ap) => ap.id !== player.id));
  };

  const handleRemoveFromCourt = (courtId: string, playerId: string) => {
    const pairing = pairings.find((p) => p.id === courtId);
    const removed = pairing?.players.find((pl) => pl.id === playerId);
    if (removed) {
      const originalPlayer = routePlayers?.find((p) => p.id === playerId) || {
        id: removed.id,
        name: removed.name,
        gamesPlayed: 0,
        wins: 0,
        status: 'ACTIVE',
      };
      setAvailablePlayers((prev) => [...prev, originalPlayer]);
    }
    setPairings((prev) =>
      prev.map((p) => {
        if (p.id === courtId) {
          return { ...p, players: p.players.filter((pl) => pl.id !== playerId) };
        }
        return p;
      })
    );
  };

  const getFairnessColor = () => {
    if (fairnessScore >= 80) return '#4CAF50';
    if (fairnessScore >= 50) return '#FF9800';
    return '#F44336';
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🎯 Pairings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Algorithm Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Algorithm</Text>
          <View style={styles.algoRow}>
            {ALGORITHMS.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.algoPill, algorithm === a.key && styles.algoPillActive]}
                onPress={() => setAlgorithm(a.key)}
              >
                <Text style={[styles.algoLabel, algorithm === a.key && styles.algoLabelActive]}>
                  {a.label}
                </Text>
                <Text style={[styles.algoDesc, algorithm === a.key && styles.algoDescActive]}>
                  {a.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.generateBtn, isGenerating && styles.disabledBtn]}
            onPress={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.generateBtnText}>🔄 Generate</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>🗑 Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Fairness Score */}
        {pairings.length > 0 && (
          <View style={styles.fairnessBar}>
            <Text style={styles.fairnessLabel}>Fairness</Text>
            <View style={styles.fairnessTrack}>
              <View
                style={[styles.fairnessFill, { width: `${fairnessScore}%`, backgroundColor: getFairnessColor() }]}
              />
            </View>
            <Text style={[styles.fairnessValue, { color: getFairnessColor() }]}>{fairnessScore}%</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Courts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Courts ({pairings.length}) {selectedCourt ? '— tap player to assign' : '— tap court to select'}
          </Text>
          {pairings.map((pairing) => (
            <TouchableOpacity
              key={pairing.id}
              style={[styles.courtCard, selectedCourt === pairing.id && styles.courtSelected]}
              onPress={() => setSelectedCourt(selectedCourt === pairing.id ? null : pairing.id)}
            >
              <Text style={styles.courtName}>Court {pairing.court}</Text>
              <View style={styles.courtSlots}>
                {pairing.players.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={styles.playerChip}
                    onPress={() => handleRemoveFromCourt(pairing.id, player.id)}
                  >
                    <Text style={styles.playerChipText}>{player.name}</Text>
                    <Text style={styles.removeIcon}>×</Text>
                  </TouchableOpacity>
                ))}
                {Array.from({ length: 2 - pairing.players.length }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.emptySlot}>
                    <Text style={styles.emptySlotText}>Empty</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
          {pairings.length === 0 && (
            <Text style={styles.emptyText}>No pairings yet. Select an algorithm and tap Generate.</Text>
          )}
        </View>

        {/* Available Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available ({availablePlayers.length})</Text>
          <View style={styles.playersGrid}>
            {availablePlayers.map((player) => (
              <TouchableOpacity
                key={player.id}
                style={styles.playerCard}
                onPress={() => handleAddToCourt(player)}
              >
                <Text style={styles.playerName}>{player.name}</Text>
                <Text style={styles.playerMeta}>
                  {player.gamesPlayed}g | {player.wins}w
                </Text>
              </TouchableOpacity>
            ))}
            {availablePlayers.length === 0 && (
              <Text style={styles.emptyText}>All players assigned to courts</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { fontSize: 16, color: '#007AFF' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 10 },
  algoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  algoPill: {
    backgroundColor: '#f0f0f0', borderRadius: 12, padding: 12, width: '47%',
    borderWidth: 2, borderColor: 'transparent',
  },
  algoPillActive: { backgroundColor: '#E3F2FD', borderColor: '#007AFF' },
  algoLabel: { fontSize: 14, fontWeight: '700', color: '#333' },
  algoLabelActive: { color: '#007AFF' },
  algoDesc: { fontSize: 11, color: '#999', marginTop: 2 },
  algoDescActive: { color: '#007AFF' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  generateBtn: {
    flex: 2, backgroundColor: '#28a745', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resetBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#dc3545', paddingVertical: 14, alignItems: 'center',
  },
  resetBtnText: { color: '#dc3545', fontSize: 14, fontWeight: '600' },
  disabledBtn: { opacity: 0.6 },
  fairnessBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
  },
  fairnessLabel: { fontSize: 13, fontWeight: '600', color: '#666' },
  fairnessTrack: {
    flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden',
  },
  fairnessFill: { height: '100%', borderRadius: 4 },
  fairnessValue: { fontSize: 16, fontWeight: 'bold' },
  errorBox: {
    backgroundColor: '#f8d7da', padding: 12, borderRadius: 8, marginBottom: 16,
  },
  errorText: { color: '#721c24', fontSize: 14 },
  courtCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: 'transparent',
  },
  courtSelected: { borderColor: '#007AFF', backgroundColor: '#F0F8FF' },
  courtName: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  courtSlots: { flexDirection: 'row', gap: 10 },
  playerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#007AFF', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
  },
  playerChipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  removeIcon: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  emptySlot: {
    backgroundColor: '#f0f0f0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed',
  },
  emptySlotText: { color: '#999', fontSize: 14 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', padding: 20 },
  playersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  playerCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, width: '47%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  playerName: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  playerMeta: { fontSize: 12, color: '#999' },
});

export default PairingScreen;
