import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { ScheduledMatch } from '../types/matchScheduling';

const { width } = Dimensions.get('window');

interface MatchCalendarViewProps {
  matches: ScheduledMatch[];
  onMatchPress: (match: ScheduledMatch) => void;
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
}

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  matches: ScheduledMatch[];
}

const MatchCalendarView = ({
  matches,
  onMatchPress,
  selectedDate,
  onDateSelect
}: MatchCalendarViewProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Get first day of month and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay())); // End on Saturday

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayMatches = matches.filter(match => {
        const matchDate = new Date(match.scheduledAt);
        return matchDate.toDateString() === d.toDateString();
      });

      days.push({
        date: new Date(d),
        dayNumber: d.getDate(),
        isCurrentMonth: d.getMonth() === month,
        isToday: d.toDateString() === today.toDateString(),
        isSelected: selectedDate ? d.toDateString() === selectedDate.toDateString() : false,
        matches: dayMatches,
      });
    }

    return days;
  }, [matches, currentMonth, selectedDate]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const handleDatePress = (day: CalendarDay) => {
    if (onDateSelect) {
      onDateSelect(day.date);
    }
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getMatchTypeColor = (matchType: string) => {
    return matchType === 'SINGLES' ? '#007AFF' : '#28a745';
  };

  const renderCalendarDay = (day: CalendarDay) => (
    <TouchableOpacity
      key={day.date.toISOString()}
      style={[
        styles.dayContainer,
        !day.isCurrentMonth && styles.dayOutsideMonth,
        day.isToday && styles.dayToday,
        day.isSelected && styles.daySelected,
      ]}
      onPress={() => handleDatePress(day)}
    >
      <Text style={[
        styles.dayNumber,
        !day.isCurrentMonth && styles.dayNumberOutsideMonth,
        day.isToday && styles.dayNumberToday,
        day.isSelected && styles.dayNumberSelected,
      ]}>
        {day.dayNumber}
      </Text>

      {day.matches.length > 0 && (
        <View style={styles.matchesContainer}>
          {day.matches.slice(0, 2).map((match, index) => (
            <TouchableOpacity
              key={match.id}
              style={[
                styles.matchIndicator,
                { backgroundColor: getMatchTypeColor(match.matchType) }
              ]}
              onPress={() => onMatchPress(match)}
            >
              <Text style={styles.matchIndicatorText} numberOfLines={1}>
                {match.title}
              </Text>
            </TouchableOpacity>
          ))}
          {day.matches.length > 2 && (
            <Text style={styles.moreMatchesText}>
              +{day.matches.length - 2} more
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <View style={styles.container}>
      {/* Month Navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateMonth('prev')}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.monthTitle}>
          {formatMonthYear(currentMonth)}
        </Text>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateMonth('next')}
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Week Days Header */}
      <View style={styles.weekDaysContainer}>
        {weekDays.map(day => (
          <Text key={day} style={styles.weekDayText}>
            {day}
          </Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarData.map(day => renderCalendarDay(day))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#007AFF' }]} />
          <Text style={styles.legendText}>Singles</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#28a745' }]} />
          <Text style={styles.legendText}>Doubles</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  weekDaysContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    paddingVertical: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayContainer: {
    width: (width - 32 - 48) / 7, // Account for padding and margins
    height: 80,
    padding: 2,
    alignItems: 'center',
  },
  dayOutsideMonth: {
    opacity: 0.3,
  },
  dayToday: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
  },
  daySelected: {
    backgroundColor: '#cce7ff',
    borderRadius: 8,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  dayNumberOutsideMonth: {
    color: '#ccc',
  },
  dayNumberToday: {
    color: '#856404',
    fontWeight: 'bold',
  },
  dayNumberSelected: {
    color: '#0056b3',
    fontWeight: 'bold',
  },
  matchesContainer: {
    flex: 1,
    width: '100%',
  },
  matchIndicator: {
    height: 16,
    borderRadius: 2,
    marginBottom: 2,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  matchIndicatorText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: '500',
  },
  moreMatchesText: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
});

export default MatchCalendarView;