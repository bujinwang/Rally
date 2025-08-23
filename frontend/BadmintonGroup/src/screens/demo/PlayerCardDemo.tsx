import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerCard } from '../../components/design-system/Card';
import { Player } from '../../components/design-system/Card/PlayerCard.types';
import { colors, spacing, typography } from '../../theme/theme';

// Sample data matching the visual design specification
const samplePlayers: Player[] = [
  {
    id: '1',
    name: 'Mike',
    gamesPlayed: 2,
    status: 'active',
    isOrganizer: true,
  },
  {
    id: '2', 
    name: 'Sarah',
    gamesPlayed: 2,
    status: 'active',
    isOrganizer: false,
  },
  {
    id: '3',
    name: 'Kevin',
    gamesPlayed: 0,
    status: 'waiting',
    isOrganizer: false,
  },
  {
    id: '4',
    name: 'Lisa',
    gamesPlayed: 1,
    status: 'confirmed',
    isOrganizer: false,
  },
];

export const PlayerCardDemo: React.FC = () => {
  const handleActionPress = (player: Player) => {
    console.log(`Action pressed for player: ${player.name}`);
    // Here you would dispatch actions to update player status
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <Text style={styles.title}>BadmintonGroup Design System</Text>
        <Text style={styles.subtitle}>PlayerCard Component Demo</Text>
        
        {/* Active Players Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>场上球员 (2/4)</Text>
          <PlayerCard
            player={samplePlayers[0]}
            variant="active"
            onActionPress={handleActionPress}
          />
          <PlayerCard
            player={samplePlayers[1]}
            variant="active"
            onActionPress={handleActionPress}
          />
        </View>
        
        {/* Waiting Players Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>等候球员 (1)</Text>
          <PlayerCard
            player={samplePlayers[2]}
            variant="waiting"
            onActionPress={handleActionPress}
          />
        </View>
        
        {/* Confirmed Players Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>已确认球员 (1)</Text>
          <PlayerCard
            player={samplePlayers[3]}
            variant="confirmed"
            onActionPress={handleActionPress}
          />
        </View>
        
        {/* Disabled State Demo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disabled State</Text>
          <PlayerCard
            player={samplePlayers[0]}
            variant="active"
            onActionPress={handleActionPress}
            disabled={true}
          />
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  title: {
    ...typography.sessionTitle,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
});

export default PlayerCardDemo;