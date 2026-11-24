/**
 * Shared, platform-agnostic helpers for DateTimeField.
 *
 * Kept in its own module (no react-native / picker imports) so that both the
 * native and the `.web` implementations can use it without pulling the
 * native-only datetimepicker package into the web bundle.
 */

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

export type DateTimeFieldMode = 'datetime' | 'date';

export interface DateTimeFieldProps {
  /** Currently selected value. Omit / null to show the placeholder. */
  value?: Date | null;
  /** Called with the newly selected date/time. */
  onChange: (date: Date) => void;
  /** `datetime` shows date + time wheels, `date` shows date only. */
  mode?: DateTimeFieldMode;
  /** Earliest selectable moment. */
  minimumDate?: Date;
  /** Shown when `value` is not a valid date. */
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  /** Overrides the outer box (border, margins, ...). */
  style?: StyleProp<ViewStyle>;
  /** Overrides the displayed value text. */
  textStyle?: StyleProp<TextStyle>;
}

const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Human readable label, e.g. `Wed, Oct 21, 08:00 PM` or `Wed, Oct 21, 2026`.
 */
export function formatFieldValue(date: Date, mode: DateTimeFieldMode = 'datetime'): string {
  if (!isValidDate(date)) return '';
  const day = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (mode === 'date') {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day}, ${time}`;
}

/**
 * `YYYY-MM-DDTHH:mm` in **local** time, the format `<input type="datetime-local">` expects.
 * Never use `toISOString()` here — it shifts to UTC and moves the value by the tz offset.
 */
export function toDateTimeLocalValue(date: Date): string {
  if (!isValidDate(date)) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** `YYYY-MM-DD` in local time, the format `<input type="date">` expects. */
export function toDateLocalValue(date: Date): string {
  if (!isValidDate(date)) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parses `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` as **local** time.
 * Returns `null` for empty or partial input (browsers emit '' while typing).
 */
export function parseLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hours ? Number(hours) : 0,
    minutes ? Number(minutes) : 0,
    0,
    0
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
