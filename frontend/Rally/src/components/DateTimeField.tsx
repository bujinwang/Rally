import React, { useCallback, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  formatFieldValue,
  isValidDate,
  type DateTimeFieldProps,
} from './dateTimeFieldCore';

export type { DateTimeFieldProps } from './dateTimeFieldCore';

/**
 * Cross-platform date / date-time field.
 *
 * - iOS: bottom sheet with a spinner, Cancel / Done.
 * - Android: native date dialog, then (for `mode="datetime"`) the time dialog.
 * - Web: see `DateTimeField.web.tsx` (native picker renders `null` on web).
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
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Date>(isValidDate(value) ? value : new Date());

  const open = useCallback(() => {
    if (disabled) return;
    const base = isValidDate(value) ? value : new Date();
    setDraft(base);
    setVisible(true);
  }, [disabled, value]);

  const close = useCallback(() => setVisible(false), []);

  const confirm = useCallback(() => {
    setVisible(false);
    onChange(draft);
  }, [draft, onChange]);

  /**
   * Android has no combined date+time dialog, so chain the two dialogs.
   * The imperative API is used because the declarative component re-opens the
   * dialog whenever its props change.
   */
  const openAndroid = useCallback(() => {
    if (disabled) return;
    const base = isValidDate(value) ? value : new Date();

    const openTime = (withDate: Date) => {
      // Let the date dialog finish dismissing before opening the time dialog,
      // otherwise some Android builds drop the second dialog silently.
      setTimeout(() => {
        DateTimePickerAndroid.open({
          value: withDate,
          mode: 'time',
          is24Hour: false,
          onChange: (event, time) => {
            if (event.type !== 'set' || !time) return;
            const merged = new Date(withDate);
            merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(merged);
          },
        });
      }, 200);
    };

    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      minimumDate,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        if (mode === 'date') {
          onChange(date);
          return;
        }
        const merged = new Date(base);
        merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        openTime(merged);
      },
    });
  }, [disabled, minimumDate, mode, onChange, value]);

  const handlePress = () => {
    if (Platform.OS === 'android') {
      openAndroid();
      return;
    }
    open();
  };

  const handleIosChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setDraft(date);
  };

  const display = isValidDate(value) ? formatFieldValue(value, mode) : placeholder;

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled, style]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.7}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={display}
      >
        <Text style={[styles.text, !isValidDate(value) && styles.placeholderText, textStyle]}>
          {display}
        </Text>
        <Ionicons name="calendar" size={20} color={disabled ? '#B0BEC5' : '#007AFF'} />
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={close}
        >
          <View style={styles.backdrop}>
            <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={close} />
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={close} hitSlop={styles.hitSlop}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>
                  {mode === 'date' ? 'Select Date' : 'Select Date & Time'}
                </Text>
                <TouchableOpacity onPress={confirm} hitSlop={styles.hitSlop}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draft}
                mode={mode}
                display="spinner"
                onChange={handleIosChange}
                minimumDate={minimumDate}
                themeVariant="light"
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

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
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  picker: {
    alignSelf: 'stretch',
  },
});
