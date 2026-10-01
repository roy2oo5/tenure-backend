import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendGlobalToAll } from './websocket.service';

const RETRY_DELAY_MS = 60_000;
let expirationTimer: NodeJS.Timeout | null = null;
let scheduledAt: number | null = null;

function armExpiration(deadline: Date): void {
  const wakeAt = deadline.getTime();
  if (expirationTimer && scheduledAt !== null && scheduledAt <= wakeAt) return;
  if (expirationTimer) clearTimeout(expirationTimer);
  scheduledAt = wakeAt;
  expirationTimer = setTimeout(() => {
    expirationTimer = null;
    scheduledAt = null;
    void expireProfilesAndScheduleNext();
  }, Math.max(0, wakeAt - Date.now()));
  expirationTimer.unref();
}

export function scheduleReadyNowProfileExpiration(deadline: Date): void {
  armExpiration(deadline);
}

async function expireProfilesAndScheduleNext(): Promise<void> {
  try {
    const now = new Date();
    const overdue = await prisma.profile.findMany({
      where: {
        readyNowEnabled: true,
        instantAvailableUntil: { lte: now },
      },
      select: { userId: true },
    });
    for (const profile of overdue) {
      const result = await prisma.profile.updateMany({
        where: {
          userId: profile.userId,
          readyNowEnabled: true,
          instantAvailableUntil: { lte: now },
        },
        data: {
          readyNowEnabled: false,
          instantAvailable: false,
          instantAvailableUntil: null,
          instantCategories: [],
          instantNote: null,
        },
      });
      if (result.count > 0) {
        sendGlobalToAll({
          event: 'instants_updated',
          userId: profile.userId,
          instantAvailable: false,
        });
      }
    }
    const next = await prisma.profile.findFirst({
      where: {
        readyNowEnabled: true,
        instantAvailableUntil: { not: null },
      },
      orderBy: { instantAvailableUntil: 'asc' },
      select: { instantAvailableUntil: true },
    });
    if (next?.instantAvailableUntil) armExpiration(next.instantAvailableUntil);
  } catch (error) {
    logger.error(`Ready Now profile expiration failed: ${error}`);
    armExpiration(new Date(Date.now() + RETRY_DELAY_MS));
  }
}

export function startReadyNowProfileExpirationScheduler(): void {
  void expireProfilesAndScheduleNext();
}
