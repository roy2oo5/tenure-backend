import { RequestStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendGlobalToUser } from './websocket.service';

const RETRY_DELAY_MS = 60_000;
let expirationTimer: NodeJS.Timeout | null = null;
let scheduledAt: number | null = null;

function armExpiration(deadline: Date): void {
  const wakeAt = deadline.getTime();
  if (expirationTimer && scheduledAt !== null && scheduledAt <= wakeAt) return;
  if (expirationTimer) clearTimeout(expirationTimer);
  scheduledAt = wakeAt;
  expirationTimer = setTimeout(
    () => {
      expirationTimer = null;
      scheduledAt = null;
      void expireReadyNowRequestsAndScheduleNext();
    },
    Math.max(0, wakeAt - Date.now()),
  );
  expirationTimer.unref();
}

export function scheduleReadyNowExpiration(deadline: Date): void {
  armExpiration(deadline);
}

export async function expireReadyNowRequests(now = new Date()): Promise<number> {
  const overdue = await prisma.request.findMany({
    where: {
      instantBooking: true,
      status: RequestStatus.PENDING,
      responseDeadlineAt: { lte: now },
    },
    select: { id: true, senderId: true, receiverId: true, responseDeadlineAt: true },
  });
  let expiredCount = 0;
  for (const request of overdue) {
    const result = await prisma.request.updateMany({
      where: {
        id: request.id,
        status: RequestStatus.PENDING,
        responseDeadlineAt: request.responseDeadlineAt,
      },
      data: { status: RequestStatus.EXPIRED, otp: null },
    });
    if (result.count === 0) continue;
    sendGlobalToUser(request.senderId, { event: 'request_updated', requestId: request.id });
    sendGlobalToUser(request.receiverId, { event: 'request_updated', requestId: request.id });
    expiredCount += 1;
  }
  return expiredCount;
}

async function expireReadyNowRequestsAndScheduleNext(): Promise<void> {
  try {
    const count = await expireReadyNowRequests();
    if (count > 0) logger.info(`Expired ${count} unanswered Ready Now request(s)`);
    const next = await prisma.request.findFirst({
      where: {
        instantBooking: true,
        status: RequestStatus.PENDING,
        responseDeadlineAt: { not: null },
      },
      orderBy: { responseDeadlineAt: 'asc' },
      select: { responseDeadlineAt: true },
    });
    if (next?.responseDeadlineAt) armExpiration(next.responseDeadlineAt);
  } catch (error) {
    logger.error(`Ready Now expiration failed: ${error}`);
    armExpiration(new Date(Date.now() + RETRY_DELAY_MS));
  }
}

export function startReadyNowExpirationScheduler(): void {
  void expireReadyNowRequestsAndScheduleNext();
}
