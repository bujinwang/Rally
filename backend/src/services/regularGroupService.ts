import { prisma } from '../config/database';

/**
 * Regular group detection: finds groups of players who play together repeatedly,
 * detects MULTIPLE recurring days per group, and suggests one session per habit day.
 *
 * Example: a group that plays Mondays 7pm AND Fridays 8pm produces TWO suggestions.
 */

export interface RegularGroupSuggestion {
  id: string;                    // unique key: group_hash + dayOfWeek
  playerNames: string[];         // all player names (including organizer)
  location: string | null;       // most common location
  sport: string;                 // most common sport for this group
  dayOfWeek: number;             // this suggestion's specific day (0=Sun, 6=Sat)
  recurringDays: number[];       // ALL days this group regularly plays (for context)
  typicalTime: string;           // typical start time FOR THIS DAY (HH:MM)
  sessionCount: number;          // total sessions (all days)
  daySessionCount: number;       // sessions on THIS specific day
  daysSinceLastSession: number;  // days since they last played (any day)
  lastSessionDate: string;       // ISO date of last session
  lastSessionName: string;       // name of the most recent session
}

interface SessionRecord {
  name: string;
  scheduledAt: Date;
  location: string | null;
  sport: string;
}

interface DayCluster {
  dayOfWeek: number;
  sessions: SessionRecord[];
  typicalHour: number;     // average hour for this day
  typicalMinute: number;   // average minute for this day
}

interface PlayerGroupData {
  names: string[];
  sessions: SessionRecord[];
  dayClusters: DayCluster[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minimum fraction of group sessions that a day must appear in to be "recurring" */
const RECURRING_DAY_THRESHOLD = 0.25; // at least 25% of sessions
const MIN_DAY_OCCURRENCES = 2;        // absolute minimum

/**
 * Cluster sessions by day-of-week.
 * Each cluster gets its own typical time (average start hour/minute for that day).
 */
function clusterSessionsByDay(sessions: SessionRecord[]): DayCluster[] {
  const dayMap = new Map<number, SessionRecord[]>();

  for (const s of sessions) {
    const day = s.scheduledAt.getDay();
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(s);
  }

  const clusters: DayCluster[] = [];
  for (const [day, daySessions] of Array.from(dayMap.entries())) {
    // Average start time for this day
    const totalMinutes = daySessions.reduce(
      (sum, s) => sum + s.scheduledAt.getHours() * 60 + s.scheduledAt.getMinutes(),
      0,
    );
    const avgMin = Math.round(totalMinutes / daySessions.length);
    clusters.push({
      dayOfWeek: day,
      sessions: daySessions,
      typicalHour: Math.floor(avgMin / 60),
      typicalMinute: avgMin % 60,
    });
  }

  return clusters;
}

/**
 * Get session suggestions for a device ID based on past patterns.
 * Returns one suggestion per recurring day per player group.
 */
export async function getSessionSuggestions(
  ownerDeviceId: string,
  minOccurrences: number = 2,
  minDaysSinceLast: number = 5,
): Promise<RegularGroupSuggestion[]> {
  // 1. Fetch all past sessions organized by this device
  const pastSessions = await prisma.mvpSession.findMany({
    where: {
      ownerDeviceId,
      status: { in: ['COMPLETED', 'ACTIVE'] },
      scheduledAt: { lt: new Date() },
    },
    include: {
      players: {
        where: { status: { not: 'LEFT' } },
        select: { name: true },
      },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 50,
  });

  if (pastSessions.length < 2) return [];

  // 2. Group sessions by player set
  const groups = new Map<string, PlayerGroupData>();

  for (const session of pastSessions) {
    const playerNames = session.players.map(p => p.name).sort();
    if (playerNames.length < 2) continue;

    const key = playerNames.join('|');

    if (!groups.has(key)) {
      groups.set(key, { names: playerNames, sessions: [], dayClusters: [] });
    }

    groups.get(key)!.sessions.push({
      name: session.name,
      scheduledAt: session.scheduledAt,
      location: session.location,
      sport: session.sport || 'badminton',
    });
  }

  // 3. For each group, find recurring day clusters
  const suggestions: RegularGroupSuggestion[] = [];

  for (const [key, group] of Array.from(groups.entries())) {
    if (group.sessions.length < minOccurrences) continue;

    const latestSession = group.sessions[0];
    const daysSince = Math.floor(
      (Date.now() - latestSession.scheduledAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSince < minDaysSinceLast) continue;

    // Cluster by day of week
    const clusters = clusterSessionsByDay(group.sessions);

    // Determine which days are "recurring" (appear in enough sessions)
    const totalSessions = group.sessions.length;
    const recurringDays: number[] = [];
    for (const c of clusters) {
      const ratio = c.sessions.length / totalSessions;
      if (c.sessions.length >= MIN_DAY_OCCURRENCES && ratio >= RECURRING_DAY_THRESHOLD) {
        recurringDays.push(c.dayOfWeek);
      }
    }

    // If no day meets the threshold, use all days with ≥ MIN_DAY_OCCURRENCES
    if (recurringDays.length === 0) {
      for (const c of clusters) {
        if (c.sessions.length >= MIN_DAY_OCCURRENCES) {
          recurringDays.push(c.dayOfWeek);
        }
      }
    }

    // Most common location (across all sessions)
    const locCounts = new Map<string, number>();
    for (const s of group.sessions) {
      const loc = s.location || 'Unknown';
      locCounts.set(loc, (locCounts.get(loc) || 0) + 1);
    }
    let bestLocation: string | null = null;
    let bestLocCount = 0;
    for (const [loc, count] of Array.from(locCounts.entries())) {
      if (count > bestLocCount) {
        bestLocCount = count;
        bestLocation = loc === 'Unknown' ? null : loc;
      }
    }

    // Most common sport
    const sportCounts = new Map<string, number>();
    for (const s of group.sessions) {
      sportCounts.set(s.sport, (sportCounts.get(s.sport) || 0) + 1);
    }
    let bestSport = 'badminton';
    let bestSportCount = 0;
    for (const [sport, count] of Array.from(sportCounts.entries())) {
      if (count > bestSportCount) {
        bestSportCount = count;
        bestSport = sport;
      }
    }

    const baseId = `group_${Buffer.from(key).toString('base64').slice(0, 16)}`;

    // Produce one suggestion per recurring day
    for (const day of recurringDays) {
      const cluster = clusters.find(c => c.dayOfWeek === day)!;
      const typicalTime = `${String(cluster.typicalHour).padStart(2, '0')}:${String(cluster.typicalMinute).padStart(2, '0')}`;

      // The "last session" for this day is the most recent session ON that day
      const lastOnDay = cluster.sessions[0]; // sessions already sorted desc

      suggestions.push({
        id: `${baseId}_${day}`,
        playerNames: group.names,
        location: bestLocation,
        sport: bestSport,
        dayOfWeek: day,
        recurringDays,
        typicalTime,
        sessionCount: totalSessions,
        daySessionCount: cluster.sessions.length,
        daysSinceLastSession: daysSince,
        lastSessionDate: latestSession.scheduledAt.toISOString(),
        lastSessionName: latestSession.name,
      });
    }
  }

  // Sort: most urgent first (longest since last game), then by group
  suggestions.sort((a, b) => b.daysSinceLastSession - a.daysSinceLastSession);

  return suggestions;
}

/**
 * Predict the next occurrence of a specific day-of-week + time pattern.
 */
export function predictNextSessionTime(
  dayOfWeek: number,
  typicalTime: string,
): Date {
  const [hours, minutes] = typicalTime.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);

  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  next.setDate(next.getDate() + daysUntil);
  next.setHours(hours || 18, minutes || 0, 0, 0);

  return next;
}
