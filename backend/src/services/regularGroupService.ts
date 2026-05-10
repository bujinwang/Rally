import { prisma } from '../config/database';

/**
 * Regular group detection: finds groups of players who play together repeatedly,
 * and suggests creating a new session when it's been a while since their last game.
 */

export interface RegularGroupSuggestion {
  id: string;                    // unique key for this group (hash of player names)
  playerNames: string[];         // all player names (including organizer)
  location: string | null;       // most common location
  dayOfWeek: number;             // most common day (0=Sun, 6=Sat)
  typicalTime: string;           // typical start time (HH:MM)
  sessionCount: number;          // how many times they've played together
  lastSessionDate: string;       // ISO date of last session
  daysSinceLastSession: number;  // days since they last played
  lastSessionName: string;       // name of the most recent session
}

interface PlayerSet {
  id: string;
  names: string[];
  sessions: Array<{
    name: string;
    scheduledAt: Date;
    location: string | null;
  }>;
}

/**
 * Get session suggestions for a device ID based on past patterns.
 * Returns groups that have played together at least twice.
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
      scheduledAt: { lt: new Date() }, // only past/future scheduled, not too far
    },
    include: {
      players: {
        where: { status: { not: 'LEFT' } },
        select: { name: true },
      },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 50, // last 50 sessions
  });

  if (pastSessions.length < 2) return [];

  // 2. Group sessions by player set similarity
  const playerGroups: Map<string, PlayerSet> = new Map();

  for (const session of pastSessions) {
    const playerNames = session.players
      .map(p => p.name)
      .sort();

    if (playerNames.length < 2) continue; // need at least 2 players

    // Create a stable key from sorted player names
    const key = playerNames.join('|');

    if (!playerGroups.has(key)) {
      playerGroups.set(key, {
        id: key,
        names: playerNames,
        sessions: [],
      });
    }

    playerGroups.get(key)!.sessions.push({
      name: session.name,
      scheduledAt: session.scheduledAt,
      location: session.location,
    });
  }

  // 3. Filter to groups with >= minOccurrences and extract patterns
  const suggestions: RegularGroupSuggestion[] = [];

  for (const [key, group] of Array.from(playerGroups.entries())) {
    if (group.sessions.length < minOccurrences) continue;

    const latestSession = group.sessions[0]; // most recent (sorted desc)
    const daysSince = Math.floor(
      (Date.now() - latestSession.scheduledAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Skip if they just played recently
    if (daysSince < minDaysSinceLast) continue;

    // Find most common day of week
    const dayCounts = new Map<number, number>();
    for (const s of group.sessions) {
      const day = s.scheduledAt.getDay();
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }
    let bestDay = 0;
    let bestDayCount = 0;
    for (const [day, count] of Array.from(dayCounts.entries())) {
      if (count > bestDayCount) {
        bestDayCount = count;
        bestDay = day;
      }
    }

    // Find typical time (average hour from all sessions)
    const hours = group.sessions.map(s => s.scheduledAt.getHours());
    const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
    const typicalTime = `${String(avgHour).padStart(2, '0')}:00`;

    // Most common location
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

    suggestions.push({
      id: `group_${Buffer.from(key).toString('base64').slice(0, 16)}`,
      playerNames: group.names,
      location: bestLocation,
      dayOfWeek: bestDay,
      typicalTime,
      sessionCount: group.sessions.length,
      lastSessionDate: latestSession.scheduledAt.toISOString(),
      daysSinceLastSession: daysSince,
      lastSessionName: latestSession.name,
    });
  }

  // Sort: most urgent first (longest since last game)
  suggestions.sort((a, b) => b.daysSinceLastSession - a.daysSinceLastSession);

  return suggestions;
}

/**
 * Detect the next likely session time based on past patterns.
 * Returns the upcoming occurrence of the typical day+time.
 */
export function predictNextSessionTime(
  dayOfWeek: number,
  typicalTime: string,
): Date {
  const [hours, minutes] = typicalTime.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);

  // Find the next occurrence of the target day
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // next week

  next.setDate(next.getDate() + daysUntil);
  next.setHours(hours || 18, minutes || 0, 0, 0);

  return next;
}
