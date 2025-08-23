import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from 'react-native-elements';
import { Ionicons } from '@expo/vector-icons';
import { SessionHeaderProps } from './SessionHeader.types';
import { colors, spacing, typography } from '../../../theme/theme';

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  session,
  isEditable = false,
  onEdit,
}) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { 
      month: 'long', 
      day: 'numeric',
      weekday: 'long' 
    });
  };

  return (
    <Card containerStyle={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🏸</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{session.title}</Text>
            {isEditable && (
              <TouchableOpacity onPress={onEdit} style={styles.editButton}>
                <Ionicons name="pencil" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>
                {formatDate(session.date)} • {session.time}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>{session.location.name}</Text>
            </View>
            
            {session.location.address && (
              <Text style={styles.addressText}>{session.location.address}</Text>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  
  iconContainer: {
    marginRight: spacing.md,
    paddingTop: 2,
  },
  
  icon: {
    fontSize: 24,
  },
  
  content: {
    flex: 1,
  },
  
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  
  title: {
    ...typography.sessionTitle,
    fontSize: 20, // Slightly smaller for mobile
    flex: 1,
  },
  
  editButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  
  detailsContainer: {
    gap: spacing.xs,
  },
  
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  
  detailText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  
  addressText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.lg + spacing.xs, // Align with location text
    marginTop: -2,
  },
});

export default SessionHeader;