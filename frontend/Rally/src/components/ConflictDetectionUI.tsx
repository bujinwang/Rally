import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SchedulingConflict } from '../types/matchScheduling';

interface ConflictDetectionUIProps {
  conflicts: SchedulingConflict[];
  onConflictPress?: (conflict: SchedulingConflict) => void;
  showDetails?: boolean;
}

const ConflictDetectionUI = ({
  conflicts,
  onConflictPress,
  showDetails = true
}: ConflictDetectionUIProps) => {
  if (conflicts.length === 0) {
    return null;
  }

  const getConflictIcon = (type: string) => {
    switch (type) {
      case 'COURT_CONFLICT': return '🏓';
      case 'PLAYER_CONFLICT': return '👥';
      case 'TIME_OVERLAP': return '⏰';
      default: return '⚠️';
    }
  };

  const getConflictSeverity = (type: string) => {
    switch (type) {
      case 'COURT_CONFLICT': return 'high';
      case 'PLAYER_CONFLICT': return 'high';
      case 'TIME_OVERLAP': return 'medium';
      default: return 'medium';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#dc3545';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  const handleConflictPress = (conflict: SchedulingConflict) => {
    if (onConflictPress) {
      onConflictPress(conflict);
    } else {
      // Default behavior: show alert with conflict details
      Alert.alert(
        `${getConflictIcon(conflict.type)} ${conflict.type.replace('_', ' ')}`,
        conflict.message,
        [{ text: 'OK' }]
      );
    }
  };

  const renderConflictItem = (conflict: SchedulingConflict, index: number) => {
    const severity = getConflictSeverity(conflict.type);
    const severityColor = getSeverityColor(severity);

    return (
      <TouchableOpacity
        key={`${conflict.type}-${index}`}
        style={[styles.conflictItem, { borderLeftColor: severityColor }]}
        onPress={() => handleConflictPress(conflict)}
      >
        <View style={styles.conflictHeader}>
          <Text style={styles.conflictIcon}>
            {getConflictIcon(conflict.type)}
          </Text>
          <Text style={[styles.conflictType, { color: severityColor }]}>
            {conflict.type.replace('_', ' ')}
          </Text>
          <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
            <Text style={styles.severityText}>
              {severity.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.conflictMessage}>
          {conflict.message}
        </Text>

        {showDetails && conflict.conflictingMatchId && (
          <View style={styles.conflictDetails}>
            <Text style={styles.conflictDetailLabel}>Conflicting Match:</Text>
            <Text style={styles.conflictDetailValue}>
              {conflict.conflictingMatchTitle || `Match ${conflict.conflictingMatchId.slice(0, 8)}...`}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const getSummaryMessage = () => {
    const highSeverityCount = conflicts.filter(c => getConflictSeverity(c.type) === 'high').length;
    const totalCount = conflicts.length;

    if (highSeverityCount > 0) {
      return `⚠️ ${highSeverityCount} critical conflict${highSeverityCount > 1 ? 's' : ''} detected`;
    } else {
      return `⚠️ ${totalCount} potential conflict${totalCount > 1 ? 's' : ''} detected`;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚠️</Text>
        <Text style={styles.headerTitle}>Scheduling Conflicts</Text>
      </View>

      <Text style={styles.summaryText}>
        {getSummaryMessage()}
      </Text>

      <Text style={styles.descriptionText}>
        Please review the conflicts below. You can still proceed with scheduling, but be aware of these overlaps.
      </Text>

      <View style={styles.conflictsList}>
        {conflicts.map((conflict, index) => renderConflictItem(conflict, index))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 Tip: Try different times or courts to avoid conflicts
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
    marginBottom: 16,
  },
  conflictsList: {
    marginBottom: 16,
  },
  conflictItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  conflictIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  conflictType: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  severityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  conflictMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 8,
  },
  conflictDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 8,
  },
  conflictDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  conflictDetailValue: {
    fontSize: 12,
    color: '#333',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#ffeaa7',
    paddingTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#856404',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default ConflictDetectionUI;