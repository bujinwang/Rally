// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import sessionApi from '../services/sessionApi';
import { API_BASE_URL, DEVICE_ID_KEY } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface HoleScore {
  hole: number;
  par: number;
  score: number;
}

interface GolfScoreData {
  id?: string;
  playerId: string;
  playerName: string;
  handicap: number;
  holes: HoleScore[];
  totalGross: number;
  totalNet: number;
  front9Gross: number;
  front9Net: number;
  back9Gross: number;
  back9Net: number;
}

interface GolfRound {
  id: string;
  sessionId: string;
  courseName: string;
  totalPar: number;
  status: string;
  scores: GolfScoreData[];
  bets: any[];
}

const DEFAULT_HOLES: HoleScore[] = Array.from({ length: 18 }, (_, i) => ({
  hole: i + 1,
  par: [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4][i],
  score: 0,
}));

export default function GolfScorecardScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { sessionId, shareCode } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<GolfRound | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [activeTab, setActiveTab] = useState<'scorecard' | 'bets' | 'leaderboard'>('scorecard');
  const [selectedPlayerIdx, setSelectedPlayerIdx] = useState(0);
  const [scorecards, setScorecards] = useState<GolfScoreData[]>([]);
  const [saving, setSaving] = useState(false);

  // Bet form state
  const [betType, setBetType] = useState('NASSAU');
  const [betStake, setBetStake] = useState('10');
  const [skinValue, setSkinValue] = useState('5');
  const [nassauResults, setNassauResults] = useState<any>(null);
  const [skinResults, setSkinResults] = useState<any>(null);

  useEffect(() => { initialize(); }, []);

  const initialize = async () => {
    const id = await AsyncStorage.getItem(DEVICE_ID_KEY) || '';
    setDeviceId(id);
    await loadSession();
  };

  const loadSession = async () => {
    try {
      const res = await sessionApi.getSessionByShareCode(shareCode);
      if (res.success) {
        setPlayers(res.data.session.players || []);
      }
      await loadRound();
    } catch (e) {
      Alert.alert('Error', 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const loadRound = async () => {
    try {
      // Get or create golf round
      const createRes = await fetch(`${API_BASE_URL}/golf/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, courseName: '' }),
      });
      const createData = await createRes.json();
      if (createData.success) {
        // Load full round with scores
        const detailRes = await fetch(`${API_BASE_URL}/golf/rounds/${createData.data.round.id}`);
        const detailData = await detailRes.json();
        if (detailData.success) {
          setRound(detailData.data.round);
          // Initialize empty scorecards for players without one
          const existingScores = detailData.data.round.scores || [];
          const newCards: GolfScoreData[] = players.map(p => {
            const existing = existingScores.find((s: any) => s.playerId === p.id);
            return existing || {
              playerId: p.id,
              playerName: p.name,
              handicap: 0,
              holes: DEFAULT_HOLES.map(h => ({ ...h, score: 0 })),
              totalGross: 0, totalNet: 0,
              front9Gross: 0, front9Net: 0, back9Gross: 0, back9Net: 0,
            };
          });
          setScorecards(newCards);
        }
      }
    } catch (e) {
      console.error('Load round error:', e);
    }
  };

  const updateHole = (playerIdx: number, holeIdx: number, value: string) => {
    const score = parseInt(value) || 0;
    const updated = [...scorecards];
    const card = { ...updated[playerIdx], holes: [...updated[playerIdx].holes] };
    card.holes[holeIdx] = { ...card.holes[holeIdx], score };

    // Recalculate
    let totalGross = 0, front9Gross = 0, back9Gross = 0;
    card.holes.forEach(h => {
      totalGross += h.score;
      if (h.hole <= 9) front9Gross += h.score;
      else back9Gross += h.score;
    });
    card.totalGross = totalGross;
    card.front9Gross = front9Gross;
    card.back9Gross = back9Gross;
    card.totalNet = totalGross - Math.round(card.handicap);
    card.front9Net = front9Gross - Math.round(card.handicap / 2);
    card.back9Net = back9Gross - Math.round(card.handicap / 2);

    updated[playerIdx] = card;
    setScorecards(updated);
  };

  const updateHandicap = (playerIdx: number, value: string) => {
    const hcp = parseFloat(value) || 0;
    const updated = [...scorecards];
    const card = { ...updated[playerIdx], handicap: hcp };
    card.totalNet = card.totalGross - Math.round(hcp);
    card.front9Net = card.front9Gross - Math.round(hcp / 2);
    card.back9Net = card.back9Gross - Math.round(hcp / 2);
    updated[playerIdx] = card;
    setScorecards(updated);
  };

  const saveScorecard = async (playerIdx: number) => {
    if (!round) return;
    setSaving(true);
    try {
      const card = scorecards[playerIdx];
      await fetch(`${API_BASE_URL}/golf/rounds/${round.id}/scores/${card.playerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: card.playerName,
          handicap: card.handicap,
          holes: card.holes,
        }),
      });
      Alert.alert('Saved', `${card.playerName}'s scorecard saved`);
    } catch (e) {
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const createBet = async () => {
    if (!round) return;
    const stakeAmount = parseFloat(betStake) || 10;
    const participants = players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      stake: stakeAmount,
    }));
    await fetch(`${API_BASE_URL}/golf/rounds/${round.id}/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: betType,
        description: betType === 'NASSAU' ? `Nassau — $${stakeAmount}/side` : `Skins — $${skinValue}/skin`,
        participants,
        totalPot: betType === 'NASSAU' ? stakeAmount * players.length * 3 : stakeAmount * players.length,
      }),
    });
    Alert.alert('Created', `${betType} bet created`);
    loadRound();
  };

  const calculateNassau = async () => {
    if (!round) return;
    const res = await fetch(`${API_BASE_URL}/golf/rounds/${round.id}/calculate-nassau`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) setNassauResults(data.data);
  };

  const calculateSkins = async () => {
    if (!round) return;
    const res = await fetch(`${API_BASE_URL}/golf/rounds/${round.id}/calculate-skins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinValue: parseFloat(skinValue) || 5 }),
    });
    const data = await res.json();
    if (data.success) setSkinResults(data.data);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading scorecard...</Text>
      </View>
    );
  }

  const currentCard = scorecards[selectedPlayerIdx] || scorecards[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⛳ Scorecard</Text>
        <TouchableOpacity onPress={() => loadRound()}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['scorecard', 'bets', 'leaderboard'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'scorecard' ? '⛳ Scorecard' : tab === 'bets' ? '💰 Bets' : '🏆 Leaderboard'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scorecard Tab */}
      {activeTab === 'scorecard' && (
        <ScrollView style={styles.content}>
          {/* Player Switcher */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerTabs}>
            {scorecards.map((card, idx) => (
              <TouchableOpacity
                key={card.playerId}
                style={[styles.playerTab, selectedPlayerIdx === idx && styles.playerTabActive]}
                onPress={() => setSelectedPlayerIdx(idx)}
              >
                <Text style={[styles.playerTabText, selectedPlayerIdx === idx && styles.playerTabTextActive]}>
                  {card.playerName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Handicap */}
          <View style={styles.handicapRow}>
            <Text style={styles.handicapLabel}>Handicap:</Text>
            <TextInput
              style={styles.handicapInput}
              value={currentCard?.handicap?.toString() || '0'}
              onChangeText={v => updateHandicap(selectedPlayerIdx, v)}
              keyboardType="numeric"
            />
            <Text style={styles.handicapHint}>net = gross − handicap</Text>
          </View>

          {/* Scorecard Grid */}
          <View style={styles.scorecardGrid}>
            {/* Header */}
            <View style={styles.gridHeader}>
              <Text style={styles.gridCell}>Hole</Text>
              {currentCard?.holes.map(h => (
                <Text key={h.hole} style={styles.gridCell}>{h.hole}</Text>
              ))}
              <Text style={styles.gridCellBold}>TOT</Text>
            </View>
            {/* Par */}
            <View style={styles.gridRow}>
              <Text style={styles.gridCell}>Par</Text>
              {currentCard?.holes.map(h => (
                <Text key={h.hole} style={styles.gridCell}>{h.par}</Text>
              ))}
              <Text style={styles.gridCellBold}>
                {currentCard?.holes.reduce((s, h) => s + h.par, 0)}
              </Text>
            </View>
            {/* Score */}
            <View style={styles.gridRow}>
              <Text style={[styles.gridCell, styles.scoreLabel]}>Score</Text>
              {currentCard?.holes.map((h, idx) => (
                <TextInput
                  key={h.hole}
                  style={styles.scoreInput}
                  value={h.score > 0 ? h.score.toString() : ''}
                  onChangeText={v => updateHole(selectedPlayerIdx, idx, v)}
                  keyboardType="numeric"
                  maxLength={2}
                />
              ))}
              <Text style={styles.gridCellBold}>{currentCard?.totalGross || 0}</Text>
            </View>
            {/* +/- to par */}
            <View style={styles.gridRow}>
              <Text style={[styles.gridCell, styles.scoreLabel]}>+/-</Text>
              {currentCard?.holes.map(h => {
                const diff = h.score > 0 ? h.score - h.par : 0;
                return (
                  <Text key={h.hole} style={[styles.gridCell, diff < 0 ? styles.underPar : diff > 0 ? styles.overPar : styles.evenPar]}>
                    {h.score > 0 ? (diff >= 0 ? `+${diff}` : diff) : '-'}
                  </Text>
                );
              })}
              <Text style={styles.gridCellBold}>
                {currentCard ? (currentCard.totalGross - currentCard.holes.reduce((s, h) => s + h.par, 0)) >= 0
                  ? `+${currentCard.totalGross - currentCard.holes.reduce((s, h) => s + h.par, 0)}`
                  : currentCard.totalGross - currentCard.holes.reduce((s, h) => s + h.par, 0) : 0}
              </Text>
            </View>
          </View>

          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Front 9</Text>
              <Text style={styles.summaryValue}>{currentCard?.front9Gross || 0}</Text>
              <Text style={styles.summaryNet}>Net: {currentCard?.front9Net || 0}</Text>
            </View>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Back 9</Text>
              <Text style={styles.summaryValue}>{currentCard?.back9Gross || 0}</Text>
              <Text style={styles.summaryNet}>Net: {currentCard?.back9Net || 0}</Text>
            </View>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryValue}>{currentCard?.totalGross || 0}</Text>
              <Text style={styles.summaryNet}>Net: {currentCard?.totalNet || 0}</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => saveScorecard(selectedPlayerIdx)}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : `Save ${currentCard?.playerName}'s Card`}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bets Tab */}
      {activeTab === 'bets' && (
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Bet</Text>

            <Text style={styles.label}>Bet Type</Text>
            <View style={styles.betTypeRow}>
              {['NASSAU', 'SKINS'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.betTypePill, betType === t && styles.betTypePillActive]}
                  onPress={() => setBetType(t)}
                >
                  <Text style={[styles.betTypeText, betType === t && styles.betTypeTextActive]}>
                    {t === 'NASSAU' ? 'Nassau (3-way)' : 'Skins'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Stake per side ($)</Text>
            <TextInput
              style={styles.input}
              value={betStake}
              onChangeText={setBetStake}
              keyboardType="numeric"
            />

            {betType === 'SKINS' && (
              <>
                <Text style={styles.label}>Value per skin ($)</Text>
                <TextInput
                  style={styles.input}
                  value={skinValue}
                  onChangeText={setSkinValue}
                  keyboardType="numeric"
                />
              </>
            )}

            <TouchableOpacity style={styles.createBetBtn} onPress={createBet}>
              <Text style={styles.createBetBtnText}>💰 Create {betType === 'NASSAU' ? 'Nassau' : 'Skins'} Bet</Text>
            </TouchableOpacity>
          </View>

          {/* Existing Bets */}
          {round?.bets?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Bets</Text>
              {round.bets.map((bet: any) => (
                <View key={bet.id} style={styles.betCard}>
                  <View style={styles.betHeader}>
                    <Text style={styles.betType}>{bet.type}</Text>
                    <Text style={styles.betStatus}>{bet.settled ? '✅ Settled' : '🔄 Active'}</Text>
                  </View>
                  <Text style={styles.betDesc}>{bet.description || `${bet.type} bet`}</Text>
                  <Text style={styles.betPot}>Pot: ${bet.totalPot}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Calculate Results */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Calculate Results</Text>
            <View style={styles.calcRow}>
              <TouchableOpacity style={styles.calcBtn} onPress={calculateNassau}>
                <Text style={styles.calcBtnText}>🧮 Nassau</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calcBtn} onPress={calculateSkins}>
                <Text style={styles.calcBtnText}>🧮 Skins</Text>
              </TouchableOpacity>
            </View>

            {nassauResults && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>🏆 Winner: {nassauResults.winner.name} (Net {nassauResults.winner.totalNet})</Text>
                {nassauResults.results.map((r: any) => (
                  <View key={r.playerId} style={styles.resultRow}>
                    <Text style={styles.resultName}>{r.playerName}</Text>
                    <Text style={styles.resultScore}>Front: {r.front9Net} | Back: {r.back9Net} | Total: {r.totalNet}</Text>
                    <Text style={[styles.resultAmount, r.wonAmount >= 0 ? styles.won : styles.lost]}>
                      {r.wonAmount >= 0 ? `+$${r.wonAmount}` : `-$${Math.abs(r.wonAmount)}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {skinResults && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>💰 Skins Results</Text>
                {skinResults.playerSkins.map((p: any) => (
                  <View key={p.playerId} style={styles.resultRow}>
                    <Text style={styles.resultName}>{p.name}</Text>
                    <Text style={styles.resultScore}>{p.skins} skins</Text>
                    <Text style={[styles.resultAmount, styles.won]}>+${p.amount}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Leaderboard</Text>
            {[...scorecards]
              .filter(c => c.totalGross > 0)
              .sort((a, b) => a.totalNet - b.totalNet)
              .map((card, idx) => (
                <View key={card.playerId} style={styles.leaderboardRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text style={styles.leaderboardName}>{card.playerName}</Text>
                    <Text style={styles.leaderboardScore}>
                      Gross: {card.totalGross} | Net: {card.totalNet}
                      {card.handicap > 0 ? ` (HCP: ${card.handicap})` : ''}
                    </Text>
                  </View>
                  <Text style={styles.leaderboardDiff}>
                    {card.totalNet - (scorecards.filter(c => c.totalGross > 0).sort((a, b) => a.totalNet - b.totalNet)[0]?.totalNet || 0) === 0
                      ? '🏆'
                      : `+${card.totalNet - (scorecards.filter(c => c.totalGross > 0).sort((a, b) => a.totalNet - b.totalNet)[0]?.totalNet || 0)}`}
                  </Text>
                </View>
              ))}
            {scorecards.filter(c => c.totalGross > 0).length === 0 && (
              <Text style={styles.emptyText}>No scores recorded yet. Start scoring!</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a237e', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1a237e' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#999' },
  tabTextActive: { color: '#1a237e' },
  content: { flex: 1 },
  playerTabs: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  playerTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f0f0f0',
  },
  playerTabActive: { backgroundColor: '#1a237e' },
  playerTabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  playerTabTextActive: { color: '#fff' },
  handicapRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff',
    marginHorizontal: 12, marginTop: 10, borderRadius: 8, gap: 8,
  },
  handicapLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  handicapInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
    width: 60, fontSize: 16, textAlign: 'center',
  },
  handicapHint: { fontSize: 12, color: '#999' },
  scorecardGrid: { backgroundColor: '#fff', margin: 12, borderRadius: 10, padding: 8, overflow: 'hidden' },
  gridHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 4 },
  gridRow: { flexDirection: 'row', paddingVertical: 2 },
  gridCell: {
    width: 37, textAlign: 'center', fontSize: 13, color: '#555', paddingVertical: 4,
  },
  gridCellBold: {
    width: 37, textAlign: 'center', fontSize: 13, fontWeight: 'bold', color: '#333', paddingVertical: 4,
  },
  scoreLabel: { fontWeight: '600', color: '#1a237e' },
  scoreInput: {
    width: 37, textAlign: 'center', fontSize: 13, color: '#1a237e', fontWeight: '600',
    backgroundColor: '#f8f9fa', borderRadius: 4, paddingVertical: 4,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  underPar: { color: '#2e7d32', fontWeight: '600' },
  overPar: { color: '#c62828', fontWeight: '600' },
  evenPar: { color: '#666' },
  summaryRow: { flexDirection: 'row', margin: 12, gap: 10 },
  summaryBlock: {
    flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#999', marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  summaryNet: { fontSize: 13, color: '#007AFF', marginTop: 2 },
  saveBtn: {
    backgroundColor: '#1a237e', margin: 12, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  section: { backgroundColor: '#fff', margin: 12, borderRadius: 10, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16 },
  betTypeRow: { flexDirection: 'row', gap: 8 },
  betTypePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f0f0f0' },
  betTypePillActive: { backgroundColor: '#1a237e' },
  betTypeText: { fontSize: 14, fontWeight: '600', color: '#666' },
  betTypeTextActive: { color: '#fff' },
  createBetBtn: {
    backgroundColor: '#2e7d32', marginTop: 16, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  createBetBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  betCard: {
    backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12, marginBottom: 8,
  },
  betHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  betType: { fontSize: 14, fontWeight: '700', color: '#1a237e' },
  betStatus: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },
  betDesc: { fontSize: 13, color: '#555' },
  betPot: { fontSize: 14, fontWeight: '600', color: '#2e7d32', marginTop: 4 },
  calcRow: { flexDirection: 'row', gap: 8 },
  calcBtn: {
    flex: 1, backgroundColor: '#E3F2FD', paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#BBDEFB',
  },
  calcBtnText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  resultCard: {
    marginTop: 12, backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12,
  },
  resultTitle: { fontSize: 15, fontWeight: 'bold', color: '#1a237e', marginBottom: 8 },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  resultName: { fontSize: 14, fontWeight: '600', color: '#333', flex: 1 },
  resultScore: { fontSize: 13, color: '#666', marginRight: 8 },
  resultAmount: { fontSize: 14, fontWeight: '700' },
  won: { color: '#2e7d32' },
  lost: { color: '#c62828' },
  leaderboardRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  rankBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#1a237e',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rankText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  leaderboardInfo: { flex: 1 },
  leaderboardName: { fontSize: 15, fontWeight: '600', color: '#333' },
  leaderboardScore: { fontSize: 13, color: '#666', marginTop: 2 },
  leaderboardDiff: { fontSize: 18, fontWeight: 'bold', color: '#1a237e' },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 20 },
});
