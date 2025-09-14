import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ScoreInputProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const ScoreInput: React.FC<ScoreInputProps> = ({
  label,
  value,
  onIncrement,
  onDecrement,
  disabled = false,
  style,
  showLabel = true,
  size = 'medium',
}) => {
  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          container: styles.smallContainer,
          value: styles.smallValue,
          button: styles.smallButton,
          icon: 16,
        };
      case 'large':
        return {
          container: styles.largeContainer,
          value: styles.largeValue,
          button: styles.largeButton,
          icon: 28,
        };
      default: // medium
        return {
          container: styles.mediumContainer,
          value: styles.mediumValue,
          button: styles.mediumButton,
          icon: 24,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <View style={[styles.container, style]}>
      {showLabel && (
        <Text style={styles.label}>{label}</Text>
      )}

      <View style={[styles.inputContainer, sizeStyles.container]}>
        <TouchableOpacity
          style={[
            styles.button,
            sizeStyles.button,
            styles.decrementButton,
            disabled && styles.disabledButton,
          ]}
          onPress={onDecrement}
          disabled={disabled || value <= 0}
        >
          <Ionicons
            name="remove"
            size={sizeStyles.icon}
            color={disabled || value <= 0 ? "#ccc" : "white"}
          />
        </TouchableOpacity>

        <View style={styles.valueContainer}>
          <Text style={[styles.value, sizeStyles.value]}>
            {value}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            sizeStyles.button,
            styles.incrementButton,
            disabled && styles.disabledButton,
          ]}
          onPress={onIncrement}
          disabled={disabled}
        >
          <Ionicons
            name="add"
            size={sizeStyles.icon}
            color={disabled ? "#ccc" : "white"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  decrementButton: {
    backgroundColor: '#ff6b6b',
  },
  incrementButton: {
    backgroundColor: '#4CAF50',
  },
  disabledButton: {
    backgroundColor: '#f0f0f0',
  },
  valueContainer: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  value: {
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },

  // Size variants
  smallContainer: {
    padding: 4,
  },
  smallValue: {
    fontSize: 18,
  },
  smallButton: {
    width: 32,
    height: 32,
    marginHorizontal: 4,
  },

  mediumContainer: {
    padding: 8,
  },
  mediumValue: {
    fontSize: 24,
  },
  mediumButton: {
    width: 44,
    height: 44,
    marginHorizontal: 8,
  },

  largeContainer: {
    padding: 12,
  },
  largeValue: {
    fontSize: 36,
  },
  largeButton: {
    width: 56,
    height: 56,
    marginHorizontal: 12,
  },
});

export default ScoreInput;