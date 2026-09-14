import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  BracketMatch,
  BracketSide,
  TournamentBracket,
} from '../services/tournamentApi';

// ---------------------------------------------------------------------------
// Pure helpers (exported so the screen — and tests — can reuse them)
// ---------------------------------------------------------------------------

/** The sub-bracket a round belongs to (rounds are homogeneous in the engine). */
export function roundSide(matches: BracketMatch[]): BracketSide {
  return matches[0]?.bracket ?? 'WINNERS';
}

/**
 * Human-readable label for a round.
 *
 * Elimination brackets are named relative to the bracket size (`Final`,
 * `Semi Finals`, `Quarter Finals`, `Round of N`); round robin / Swiss rounds
 * have no "round of N" meaning and are named positionally. Losers-bracket and
 * grand-final rounds (double elimination) are labelled explicitly.
 */
export function roundLabel(
  round: number,
  totalRounds: number,
  format: TournamentBracket['format'],
  side: BracketSide,
): string {
  if (side === 'GRAND_FINAL') return 'Grand Final';
  if (side === 'LOSERS') return `Losers Round ${round}`;

  if (format === 'SINGLE_ELIMINATION') {
    const fromEnd = totalRounds - round; // 0 = the final
    if (fromEnd <= 0) return 'Final';
    if (fromEnd === 1) return 'Semi Finals';
    if (fromEnd === 2) return 'Quarter Finals';
    return `Round of ${2 ** (fromEnd + 1)}`;
  }

  if (format === 'DOUBLE_ELIMINATION') return `Winners Round ${round}`;
  return `Round ${round}`;
}

/** True when the match is playable: both slots filled and no winner yet. */
export function isMatchReady(match: BracketMatch): boolean {
  return (
    !!match.player1Id &&
    !!match.player2Id &&
    !match.winnerId &&
    match.status !== 'CANCELLED' &&
    match.status !== 'BYE'
  );
}

/** True when a result has been recorded and can therefore be corrected. */
export function isMatchCompleted(match: BracketMatch): boolean {
  return !!match.winnerId && (match.status === 'COMPLETED' || match.status === 'WALKOVER');
}

/** True when the slot is empty because the match is a structural bye. */
export function isByeSlot(match: BracketMatch): boolean {
  return match.status === 'BYE';
}

/** A short, human-friendly label for a player id we have no name for. */
function shortId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 6)}` : id;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TournamentBracketViewProps {
  bracket: TournamentBracket;
  /** Invoked when the organizer taps "Record" on a playable match. */
  onRecordResult?: (match: BracketMatch) => void;
  /** Invoked when the organizer taps "Correct" on a completed match. */
  onCorrectResult?: (match: BracketMatch) => void;
  /** When false, action buttons are hidden (read-only). Defaults to true. */
  canManage?: boolean;
}

/**
 * Presentational bracket renderer.
 *
 * Renders rounds and matches, and — importantly — distinguishes the three
 * *empty* slot conditions that look alike but mean different things:
 *
 *   - a **bye** (exactly one real player, auto-advanced) → shown as `BYE`;
 *   - a **pending placeholder** (a future round whose feeders have not decided)
 *     → shown as `TBD`;
 *   - a **winner** → highlighted, with the loser dimmed.
 *
 * It owns no data fetching and no mutations: the screen passes callbacks.
 */
const TournamentBracketView: React.FC<TournamentBracketViewProps> = ({
  bracket,
  onRecordResult,
  onCorrectResult,
  canManage = true,
}) => {
  // id -> display name, gathered from the denormalised names on each match, so
  // byes (which are listed as bare ids on the bracket) can be shown by name.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const round of bracket.bracket) {
      for (const match of round) {
        if (match.player1Id && match.player1Name) map.set(match.player1Id, match.player1Name);
        if (match.player2Id && match.player2Name) map.set(match.player2Id, match.player2Name);
      }
    }
    return map;
  }, [bracket]);

  const displayName = (id: string): string => nameById.get(id) ?? shortId(id);

  const byeNames = bracket.byePlayers.map(displayName);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summary}>
        <SummaryItem
          icon="trophy-outline"
          label="Format"
          value={formatLabel(bracket.format)}
        />
        <SummaryItem
          icon="git-network-outline"
          label="Matches"
          value={String(bracket.totalMatches)}
        />
        <SummaryItem
          icon="flag-outline"
          label="Progress"
          value={
            bracket.isComplete
              ? 'Complete'
              : `Round ${Math.min(bracket.currentRound, bracket.totalRounds)} of ${bracket.totalRounds}`
          }
        />
      </View>

      {bracket.isComplete && (
        <View style={styles.championBanner}>
          <Ionicons name="trophy" size={18} color="#fff" />
          <Text style={styles.championText}>Tournament complete</Text>
        </View>
      )}

      {byeNames.length > 0 && (
        <View style={styles.byeBanner}>
          <Ionicons name="play-skip-forward-outline" size={16} color="#8a6d3b" />
          <Text style={styles.byeBannerText}>
            Byes (auto-advanced): {byeNames.join(', ')}
          </Text>
        </View>
      )}

      {/* Rounds */}
      {bracket.bracket.map((roundMatches, index) => {
        const round = index + 1;
        const side = roundSide(roundMatches);
        return (
          <View key={`round-${round}`} style={styles.round}>
            <View style={styles.roundHeader}>
              <Text style={styles.roundTitle}>
                {roundLabel(round, bracket.totalRounds, bracket.format, side)}
              </Text>
              <Text style={styles.roundCount}>
                {roundMatches.length} {roundMatches.length === 1 ? 'match' : 'matches'}
              </Text>
            </View>

            {roundMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                displayName={displayName}
                canManage={canManage}
                onRecordResult={onRecordResult}
                onCorrectResult={onCorrectResult}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SummaryItem: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <View style={styles.summaryItem}>
    <Ionicons name={icon} size={18} color="#007AFF" />
    <Text style={styles.summaryValue}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>
);

const MatchCard: React.FC<{
  match: BracketMatch;
  displayName: (id: string) => string;
  canManage: boolean;
  onRecordResult?: (match: BracketMatch) => void;
  onCorrectResult?: (match: BracketMatch) => void;
}> = ({ match, displayName, canManage, onRecordResult, onCorrectResult }) => {
  const ready = isMatchReady(match);
  const completed = isMatchCompleted(match);
  const bye = isByeSlot(match);
  const pending = match.status === 'PENDING';

  return (
    <View style={[styles.matchCard, bye && styles.matchCardBye, pending && styles.matchCardPending]}>
      <View style={styles.matchHeader}>
        <Text style={styles.matchNumber}>Match {match.match}</Text>
        <StatusBadge status={match.status} />
      </View>

      <SlotRow
        match={match}
        playerId={match.player1Id}
        playerName={match.player1Name}
        displayName={displayName}
        bye={bye}
      />
      <SlotRow
        match={match}
        playerId={match.player2Id}
        playerName={match.player2Name}
        displayName={displayName}
        bye={bye}
      />

      {(match.court || match.scheduledTime) && (
        <Text style={styles.matchMeta}>
          {match.court ? `Court ${match.court}` : ''}
          {match.court && match.scheduledTime ? ' · ' : ''}
          {match.scheduledTime ? new Date(match.scheduledTime).toLocaleString() : ''}
        </Text>
      )}

      {match.correctedAt && (
        <View style={styles.correctedRow}>
          <Ionicons name="create-outline" size={14} color="#8a6d3b" />
          <Text style={styles.correctedText}>
            Corrected{match.correctionReason ? `: ${match.correctionReason}` : ''}
          </Text>
        </View>
      )}

      {canManage && (ready || completed) && (
        <View style={styles.actions}>
          {ready && onRecordResult && (
            <TouchableOpacity
              style={[styles.actionButton, styles.recordButton]}
              onPress={() => onRecordResult(match)}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Record result</Text>
            </TouchableOpacity>
          )}
          {completed && onCorrectResult && (
            <TouchableOpacity
              style={[styles.actionButton, styles.correctButton]}
              onPress={() => onCorrectResult(match)}
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Correct</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const SlotRow: React.FC<{
  match: BracketMatch;
  playerId: string | null;
  playerName?: string;
  displayName: (id: string) => string;
  bye: boolean;
}> = ({ match, playerId, playerName, displayName, bye }) => {
  const hasPlayer = !!playerId;
  const isWinner = !!playerId && match.winnerId === playerId;
  const isLoser = hasPlayer && !!match.winnerId && match.winnerId !== playerId;

  return (
    <View style={[styles.slot, isWinner && styles.slotWinner]}>
      {hasPlayer ? (
        <>
          <Text
            style={[styles.slotName, isWinner && styles.slotNameWinner, isLoser && styles.slotNameLoser]}
            numberOfLines={1}
          >
            {playerName ?? displayName(playerId as string)}
          </Text>
          {isWinner && <Ionicons name="checkmark-circle" size={16} color="#28a745" />}
        </>
      ) : (
        <>
          <Text style={[styles.slotPlaceholder, bye && styles.slotBye]} numberOfLines={1}>
            {bye ? 'BYE' : 'TBD'}
          </Text>
          {bye && <Ionicons name="play-skip-forward-outline" size={14} color="#8a6d3b" />}
        </>
      )}
    </View>
  );
};

const StatusBadge: React.FC<{ status: BracketMatch['status'] }> = ({ status }) => {
  const { label, color } = statusMeta(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: color }]}>
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Small mapping helpers
// ---------------------------------------------------------------------------

function formatLabel(format: TournamentBracket['format']): string {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elimination';
    case 'DOUBLE_ELIMINATION':
      return 'Double Elimination';
    case 'ROUND_ROBIN':
      return 'Round Robin';
    case 'SWISS':
      return 'Swiss';
    case 'MIXED':
      return 'Mixed';
    default:
      return format;
  }
}

function statusMeta(status: BracketMatch['status']): { label: string; color: string } {
  switch (status) {
    case 'COMPLETED':
      return { label: 'Completed', color: '#28a745' };
    case 'WALKOVER':
      return { label: 'Walkover', color: '#28a745' };
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: '#ffc107' };
    case 'BYE':
      return { label: 'Bye', color: '#8a6d3b' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: '#dc3545' };
    case 'PENDING':
      return { label: 'Pending', color: '#adb5bd' };
    case 'SCHEDULED':
    default:
      return { label: 'Scheduled', color: '#007AFF' };
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginTop: 6,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    color: '#666',
    marginTop: 2,
  },
  championBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 12,
  },
  championText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
  },
  byeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8e1',
    borderColor: '#f0e0b0',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  byeBannerText: {
    color: '#8a6d3b',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  round: {
    marginBottom: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  roundTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  roundCount: {
    fontSize: 12,
    color: '#666',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  matchCardBye: {
    backgroundColor: '#fffdf5',
    borderColor: '#f0e0b0',
  },
  matchCardPending: {
    backgroundColor: '#fafafa',
    borderStyle: 'dashed',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 4,
    backgroundColor: '#f8f9fa',
  },
  slotWinner: {
    backgroundColor: '#e7f6ec',
  },
  slotName: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  slotNameWinner: {
    fontWeight: '700',
    color: '#1c7c34',
  },
  slotNameLoser: {
    color: '#adb5bd',
  },
  slotPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#adb5bd',
    flex: 1,
  },
  slotBye: {
    color: '#8a6d3b',
    fontWeight: '700',
    fontStyle: 'normal',
  },
  matchMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  correctedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  correctedText: {
    fontSize: 12,
    color: '#8a6d3b',
    marginLeft: 4,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flex: 1,
  },
  recordButton: {
    backgroundColor: '#007AFF',
  },
  correctButton: {
    backgroundColor: '#ff9500',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
});

export default TournamentBracketView;
