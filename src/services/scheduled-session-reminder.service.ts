import { RequestStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';

const REMINDER_LEAD_MS = 60 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

let reminderTimer: NodeJS.Timeout | null = null;
let reminderScheduledAt: number | null = null;

function formatScheduledTime(fromDateTime: Date, timezoneOffsetMinutes: number): string {
  // The request's offset records the local clock time selected by the
  // beneficiary. Shift the UTC instant and format as UTC to preserve it.
  const localWallClock = new Date(fromDateTime.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(localWallClock);
}

function armReminder(reminderAt: Date): void {
  const wakeAt = reminderAt.getTime();
  if (reminderTimer && reminderScheduledAt !== null && reminderScheduledAt <= wakeAt) return;
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderScheduledAt = wakeAt;
  reminderTimer = setTimeout(() => {
    reminderTimer = null;
    reminderScheduledAt = null;
    void sendDueRemindersAndScheduleNext();
  }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, wakeAt - Date.now())));
  reminderTimer.unref();
}

export function scheduleScheduledSessionReminder(fromDateTime: Date): void {
  armReminder(new Date(fromDateTime.getTime() - REMINDER_LEAD_MS));
}

export async function sendDueScheduledSessionReminders(now = new Date()): Promise<number> {
  const upcoming = await prisma.request.findMany({
    where: {
      status: RequestStatus.CONFIRMED,
      instantBooking: false,
      session: null,
      scheduledReminderSentAt: null,
      fromDateTime: {
        gte: now,
        lte: new Date(now.getTime() + REMINDER_LEAD_MS),
      },
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      fromDateTime: true,
      timezoneOffsetMinutes: true,
    },
  });

  let sentCount = 0;
  for (const request of upcoming) {
    // The conditional update makes this safe when more than one backend
    // process is running or a scheduler wakes twice.
    const claimed = await prisma.request.updateMany({
      where: {
        id: request.id,
        status: RequestStatus.CONFIRMED,
        scheduledReminderSentAt: null,
      },
      data: { scheduledReminderSentAt: now },
    });
    if (claimed.count === 0) continue;

    const message = `You have a support session scheduled at ${formatScheduledTime(
      request.fromDateTime,
      request.timezoneOffsetMinutes ?? 0,
    )}.`;
    await Promise.all([
      NotificationService.createNotification(request.senderId, 'session_scheduled_reminder', message),
      NotificationService.createNotification(request.receiverId, 'session_scheduled_reminder', message),
    ]);
    sentCount += 1;
  }
  return sentCount;
}

async function sendDueRemindersAndScheduleNext(): Promise<void> {
  try {
    const count = await sendDueScheduledSessionReminders();
    if (count > 0) logger.info(`Sent ${count} scheduled-session reminder(s)`);

    const next = await prisma.request.findFirst({
      where: {
        status: RequestStatus.CONFIRMED,
        instantBooking: false,
        session: null,
        scheduledReminderSentAt: null,
        fromDateTime: { gte: new Date() },
      },
      orderBy: { fromDateTime: 'asc' },
      select: { fromDateTime: true },
    });
    if (next) scheduleScheduledSessionReminder(next.fromDateTime);
  } catch (error) {
    logger.error(`Scheduled-session reminder failed: ${error}`);
    armReminder(new Date(Date.now() + RETRY_DELAY_MS));
  }
}

export function startScheduledSessionReminderScheduler(): void {
  void sendDueRemindersAndScheduleNext();
}
