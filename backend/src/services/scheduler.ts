import { prisma } from '../config/database';
import { notifySessionSubscribers, notifyDevice } from '../utils/notificationHelper';
import { MatchSchedulingService } from './matchSchedulingService';

/**
 * Lightweight in-process scheduler for recurring maintenance tasks.
 * Runs on setInterval — no external cron dependency needed for MVP.
 *
 * Jobs:
 *   every 60s  — session start reminders (1h before)
 *   every 30s  — auto-expire player rest periods
 *   every 30s  — send pending match reminders
 *   every 5min — auto-complete past sessions with no activity
 */
class Scheduler {
  private intervals: NodeJS.Timeout[] = [];
  private remindedSessions = new Set<string>(); // dedup within process lifetime

  /** Start all scheduled jobs */
  start(): void {
    console.log('⏰ Scheduler starting...');

    // Session reminders: every 60 seconds
    this.intervals.push(
      setInterval(() => this.sendSessionReminders(), 60_000),
    );

    // Rest expiration: every 30 seconds
    this.intervals.push(
      setInterval(() => this.expireRestPeriods(), 30_000),
    );

    // Match reminders: every 30 seconds
    this.intervals.push(
      setInterval(() => this.sendMatchReminders(), 30_000),
    );

    // Auto-complete past sessions: every 5 minutes
    this.intervals.push(
      setInterval(() => this.autoCompleteSessions(), 5 * 60_000),
    );

    // Run once on startup (after a short delay to let DB connect)
    setTimeout(() => {
      this.sendSessionReminders();
      this.expireRestPeriods();
      this.sendMatchReminders();
    }, 10_000);

    console.log('⏰ Scheduler started — 4 jobs active');
  }

  /** Stop all jobs (for graceful shutdown) */
  stop(): void {
    for (const iv of this.intervals) clearInterval(iv);
    this.intervals = [];
    console.log('⏰ Scheduler stopped');
  }

  // ── Session Start Reminders ──────────────────────────────────────

  /**
   * Find ACTIVE sessions starting in the next 60 minutes and push-notify
   * all subscribers who haven't been reminded yet.
   */
  private async sendSessionReminders(): Promise<void> {
    try {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60_000);

      const upcomingSessions = await prisma.mvpSession.findMany({
        where: {
          status: 'ACTIVE',
          scheduledAt: {
            gte: now,
            lte: inOneHour,
          },
        },
        select: {
          id: true,
          name: true,
          scheduledAt: true,
          location: true,
          shareCode: true,
        },
      });

      let sent = 0;
      for (const session of upcomingSessions) {
        // Dedup: only remind once per session per process lifetime
        if (this.remindedSessions.has(session.id)) continue;
        this.remindedSessions.add(session.id);

        const minutesUntil = Math.round(
          (session.scheduledAt.getTime() - now.getTime()) / 60_000,
        );

        const count = await notifySessionSubscribers(session.id, {
          title: '🏸 Session Starting Soon!',
          body: `${session.name} starts in ${minutesUntil}min${session.location ? ` at ${session.location}` : ''}`,
          type: 'SESSION_REMINDER',
          data: {
            sessionId: session.id,
            shareCode: session.shareCode,
            scheduledAt: session.scheduledAt.toISOString(),
          },
        });

        if (count > 0) {
          sent++;
          console.log(`📢 Reminder sent for "${session.name}" → ${count} device(s)`);
        }
      }

      // Clean up remindedSessions for sessions that have passed
      if (upcomingSessions.length === 0) {
        this.remindedSessions.clear(); // all past reminders can be recycled
      }
    } catch (error) {
      console.error('Scheduler: session reminders error:', error);
    }
  }

  // ── Rest Period Auto-Expiration ──────────────────────────────────

  /**
   * Find RESTING players whose rest period has expired and set them
   * back to ACTIVE.
   */
  private async expireRestPeriods(): Promise<void> {
    try {
      const now = new Date();

      const expired = await prisma.mvpPlayer.findMany({
        where: {
          status: 'RESTING',
          restExpiresAt: { lte: now },
        },
        select: {
          id: true,
          name: true,
          sessionId: true,
        },
      });

      if (expired.length === 0) return;

      const ids = expired.map(p => p.id);
      await prisma.mvpPlayer.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'ACTIVE',
          restGamesRemaining: 0,
          restExpiresAt: null,
        },
      });

      for (const p of expired) {
        console.log(`🔄 Rest expired: "${p.name}" → ACTIVE`);
      }
    } catch (error) {
      console.error('Scheduler: rest expiration error:', error);
    }
  }

  // ── Auto-Complete Past Sessions ──────────────────────────────────

  /**
   * Mark sessions as COMPLETED when they're well past their scheduled
   * time and have no in-progress games.
   */
  private async autoCompleteSessions(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 4 * 60 * 60_000); // 4 hours ago

      const stale = await prisma.mvpSession.findMany({
        where: {
          status: 'ACTIVE',
          scheduledAt: { lt: cutoff },
        },
        include: {
          games: {
            where: { status: 'IN_PROGRESS' },
            select: { id: true },
          },
        },
      });

      let completed = 0;
      for (const session of stale) {
        // Don't auto-complete if there are still in-progress games
        if (session.games.length > 0) continue;

        await prisma.mvpSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED' },
        });

        completed++;
        console.log(`✅ Auto-completed session: "${session.name}"`);
      }

      if (completed > 0) {
        console.log(`✅ Auto-completed ${completed} session(s)`);
      }
    } catch (error) {
      console.error('Scheduler: auto-complete error:', error);
    }
  }

  // ── Match Reminders ────────────────────────────────────────────

  /**
   * Find pending match reminders that are due and send push notifications
   * to each player's device.
   */
  private async sendMatchReminders(): Promise<void> {
    try {
      const reminders = await MatchSchedulingService.getUpcomingReminders();

      for (const reminder of reminders) {
        const match = (reminder as any).match;
        if (!match) continue;

        const sent = await notifyDevice(reminder.userId, {
          title: '🏸 Match Starting Soon!',
          body: `${match.title || 'Your match'} begins in 15 minutes`,
          type: 'MATCH_REMINDER',
          data: {
            matchId: reminder.matchId,
            sessionId: match.sessionId,
          },
        });

        if (sent) {
          await MatchSchedulingService.markReminderSent(reminder.id);
        }
      }

      if (reminders.length > 0) {
        console.log(`📢 Sent ${reminders.length} match reminder(s)`);
      }
    } catch (error) {
      console.error('Scheduler: match reminders error:', error);
    }
  }
}

export const scheduler = new Scheduler();
