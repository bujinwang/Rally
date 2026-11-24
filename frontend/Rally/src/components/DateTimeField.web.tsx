import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatFieldValue,
  isValidDate,
  parseLocalValue,
  toDateLocalValue,
  toDateTimeLocalValue,
  type DateTimeFieldProps,
} from './dateTimeFieldCore';

export type { DateTimeFieldProps } from './dateTimeFieldCore';

/**
 * Web implementation of DateTimeField.
 *
 * `@react-native-community/datetimepicker` has no web build — it renders `null`
 * (and only logs a warning), which is why tapping the field did nothing.
 * Here we use the browser's own `<input type="date" | "datetime-local">`, which
 * gives us a real picker on every desktop and mobile browser.
 *
 * The input is rendered invisible on top of the styled box so the visible label
 * keeps the same format as native ("Wed, Oct 21, 08:00 PM").
 */
export default function DateTimeField({
  value,
  onChange,
  mode = 'datetime',
  minimumDate,
  placeholder = 'Select date',
  disabled = false,
  testID,
  style,
  textStyle,
}: DateTimeFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const inputValue = !isValidDate(value)
    ? ''
    : mode === 'date'
      ? toDateLocalValue(value)
      : toDateTimeLocalValue(value);
  const minValue = minimumDate
    ? mode === 'date'
      ? toDateLocalValue(minimumDate)
      : toDateTimeLocalValue(minimumDate)
    : undefined;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseLocalValue(event.target.value);
    // Browsers emit '' while a value is being typed/cleared — keep the last good value.
    if (parsed) onChange(parsed);
  };

  const openPicker = useCallback(() => {
    const element = inputRef.current;
    if (!element || disabled) return;
    const withPicker = element as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof withPicker.showPicker === 'function') {
        withPicker.showPicker();
        return;
      }
    } catch {
      // showPicker can throw (older Safari, cross-origin frames) — fall through to focus.
    }
    element.focus();
  }, [disabled]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const hasValue = isValidDate(value);

  return (
    <View style={[styles.field, disabled && styles.fieldDisabled, style]}>
      <Text
        style={[styles.text, !hasValue && styles.placeholderText, textStyle]}
        numberOfLines={1}
      >
        {hasValue ? formatFieldValue(value, mode) : placeholder}
      </Text>
      <Ionicons name="calendar" size={20} color={disabled ? '#B0BEC5' : '#007AFF'} />
      <input
        ref={inputRef}
        type={mode === 'date' ? 'date' : 'datetime-local'}
        value={inputValue}
        min={minValue}
        step={mode === 'date' ? undefined : 60}
        onChange={handleChange}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        data-testid={testID}
        aria-label={mode === 'date' ? 'Select date' : 'Select date and time'}
        style={overlayInput}
      />
    </View>
  );
}

const overlayInput: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  colorScheme: 'light',
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    minHeight: 46,
    position: 'relative',
  },
  fieldDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.7,
  },
  text: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
});
