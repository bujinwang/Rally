import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { DiscoveryFilters } from '../services/discoveryApi';

interface SessionFiltersProps {
  filters: DiscoveryFilters;
  onFiltersChange: (filters: Partial<DiscoveryFilters>) => void;
  onRequestLocation: () => void;
  hasLocation: boolean;
}

const SessionFilters: React.FC<SessionFiltersProps> = ({
  filters,
  onFiltersChange,
  onRequestLocation,
  hasLocation,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [tempFilters, setTempFilters] = useState<Partial<DiscoveryFilters>>(filters);

  const skillLevels = ['beginner', 'intermediate', 'advanced'];
  const courtTypes = ['indoor', 'outdoor', 'mixed'];

  const handleApplyFilters = () => {
    onFiltersChange(tempFilters);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    const resetFilters = {
      skillLevel: undefined,
      minPlayers: undefined,
      maxPlayers: undefined,
      courtType: undefined,
      radius: hasLocation ? 50 : undefined,
    };
    setTempFilters(resetFilters);
    onFiltersChange(resetFilters);
    setShowFilters(false);
  };

  const updateTempFilter = (key: keyof DiscoveryFilters, value: any) => {
    setTempFilters(prev => ({ ...prev, [key]: value }));
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.skillLevel) count++;
    if (filters.minPlayers) count++;
    if (filters.maxPlayers) count++;
    if (filters.courtType) count++;
    if (filters.radius && filters.radius !== 50) count++;
    return count;
  };

  return (
    <View style={styles.container}>
      {/* Quick Filters Bar */}
      <View style={styles.quickFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
          {/* Location Toggle */}
          <TouchableOpacity
            style={[styles.quickFilter, hasLocation && styles.quickFilterActive]}
            onPress={onRequestLocation}
          >
            <Text style={[styles.quickFilterText, hasLocation && styles.quickFilterTextActive]}>
              📍 {hasLocation ? 'Location On' : 'Enable Location'}
            </Text>
          </TouchableOpacity>

          {/* Skill Level Quick Filters */}
          {skillLevels.map(skill => (
            <TouchableOpacity
              key={skill}
              style={[
                styles.quickFilter,
                filters.skillLevel === skill && styles.quickFilterActive
              ]}
              onPress={() => onFiltersChange({
                skillLevel: filters.skillLevel === skill ? undefined : skill
              })}
            >
              <Text style={[
                styles.quickFilterText,
                filters.skillLevel === skill && styles.quickFilterTextActive
              ]}>
                {skill.charAt(0).toUpperCase() + skill.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}

          {/* More Filters Button */}
          <TouchableOpacity
            style={[styles.quickFilter, getActiveFiltersCount() > 0 && styles.quickFilterActive]}
            onPress={() => setShowFilters(true)}
          >
            <Text style={[
              styles.quickFilterText,
              getActiveFiltersCount() > 0 && styles.quickFilterTextActive
            ]}>
              ⚙️ Filters {getActiveFiltersCount() > 0 && `(${getActiveFiltersCount()})`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Advanced Filters Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Sessions</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Skill Level */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Skill Level</Text>
              <View style={styles.optionsRow}>
                {skillLevels.map(skill => (
                  <TouchableOpacity
                    key={skill}
                    style={[
                      styles.optionButton,
                      tempFilters.skillLevel === skill && styles.optionButtonActive
                    ]}
                    onPress={() => updateTempFilter('skillLevel',
                      tempFilters.skillLevel === skill ? undefined : skill
                    )}
                  >
                    <Text style={[
                      styles.optionText,
                      tempFilters.skillLevel === skill && styles.optionTextActive
                    ]}>
                      {skill.charAt(0).toUpperCase() + skill.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Court Type */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Court Type</Text>
              <View style={styles.optionsRow}>
                {courtTypes.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.optionButton,
                      tempFilters.courtType === type && styles.optionButtonActive
                    ]}
                    onPress={() => updateTempFilter('courtType',
                      tempFilters.courtType === type ? undefined : type
                    )}
                  >
                    <Text style={[
                      styles.optionText,
                      tempFilters.courtType === type && styles.optionTextActive
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Player Count */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Player Count</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numberInput}
                  placeholder="Min"
                  keyboardType="numeric"
                  value={tempFilters.minPlayers?.toString() || ''}
                  onChangeText={(text) => updateTempFilter('minPlayers',
                    text ? parseInt(text) : undefined
                  )}
                />
                <Text style={styles.inputSeparator}>-</Text>
                <TextInput
                  style={styles.numberInput}
                  placeholder="Max"
                  keyboardType="numeric"
                  value={tempFilters.maxPlayers?.toString() || ''}
                  onChangeText={(text) => updateTempFilter('maxPlayers',
                    text ? parseInt(text) : undefined
                  )}
                />
              </View>
            </View>

            {/* Search Radius */}
            {hasLocation && (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Search Radius (km)</Text>
                <View style={styles.radiusOptions}>
                  {[10, 25, 50, 100].map(radius => (
                    <TouchableOpacity
                      key={radius}
                      style={[
                        styles.radiusButton,
                        (tempFilters.radius || 50) === radius && styles.radiusButtonActive
                      ]}
                      onPress={() => updateTempFilter('radius', radius)}
                    >
                      <Text style={[
                        styles.radiusText,
                        (tempFilters.radius || 50) === radius && styles.radiusTextActive
                      ]}>
                        {radius}km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.resetButton} onPress={handleResetFilters}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApplyFilters}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  quickFilters: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  quickScroll: {
    flexGrow: 0,
  },
  quickFilter: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  quickFilterActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  quickFilterText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '500',
  },
  quickFilterTextActive: {
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  closeButton: {
    fontSize: 24,
    color: '#6c757d',
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  optionButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputSeparator: {
    marginHorizontal: 12,
    fontSize: 16,
    color: '#6c757d',
  },
  radiusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  radiusButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radiusText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '500',
  },
  radiusTextActive: {
    color: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    gap: 12,
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    flex: 2,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SessionFilters;