import { RequestStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendGlobalToUser } from './websocket.service';
import { NotificationService } from './notification.service';
import { restoreReadyNow } from './ready-now.service';

const RETRY_DELAY_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const OTP_EXPIRATION_REASON = 'OTP was not entered on the scheduled support date.';
let expirationTimer: NodeJS.Timeout | null = null;
let scheduledAt: number | null = null;
let otpGraceTimer: NodeJS.Timeout | null = null;
let otpGraceScheduledAt: number | null = null;

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
    Math.min(MAX_TIMER_DELAY_MS, Math.max(0, wakeAt - Date.now())),
  );
  expirationTimer.unref();
}

export function scheduleReadyNowExpiration(deadline: Date): void {
  armExpiration(deadline);
}

/** First instant after the scheduled support date in the request's local timezone. */
export function confirmedOtpExpiresAt(scheduledMeetAt: Date, timezoneOffsetMinutes = 0): Date {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const local = new Date(scheduledMeetAt.getTime() + offsetMs);
  const nextLocalMidnightAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
  );
  return new Date(nextLocalMidnightAsUtc - offsetMs);
}

function armConfirmedOtpExpiration(deadline: Date): void {
  const wakeAt = deadline.getTime();
  if (otpGraceTimer && otpGraceScheduledAt !== null && otpGraceScheduledAt <= wakeAt) return;
  if (otpGraceTimer) clearTimeout(otpGraceTimer);
  otpGraceScheduledAt = wakeAt;
  otpGraceTimer = setTimeout(
    () => {
      otpGraceTimer = null;
      otpGraceScheduledAt = null;
      void expireConfirmedRequestsPastOtpDeadlineAndScheduleNext();
    },
    Math.min(MAX_TIMER_DELAY_MS, Math.max(0, wakeAt - Date.now())),
  );
  otpGraceTimer.unref();
}

export function scheduleConfirmedOtpExpiry(scheduledMeetAt: Date, timezoneOffsetMinutes = 0): void {
  armConfirmedOtpExpiration(confirmedOtpExpiresAt(scheduledMeetAt, timezoneOffsetMinutes));
}

export async function expireConfirmedRequestsPastOtpDeadline(now = new Date()): Promise<number> {
  const confirmed = await prisma.request.findMany({
    where: {
      status: RequestStatus.CONFIRMED,
      session: null,
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      fromDateTime: true,
      timezoneOffsetMinutes: true,
    },
  });
  const overdue = confirmed.filter(
    (request) =>
      confirmedOtpExpiresAt(request.fromDateTime, request.timezoneOffsetMinutes).getTime() <=
      now.getTime(),
  );
  let expiredCount = 0;
  for (const request of overdue) {
    const result = await prisma.request.updateMany({
      where: { id: request.id, status: RequestStatus.CONFIRMED, session: null },
      data: {
        status: RequestStatus.EXPIRED,
        otp: null,
        cancellationFeeReason: OTP_EXPIRATION_REASON,
      },
    });
    if (result.count === 0) continue;
    const event = { event: 'request_expired', requestId: request.id, status: 'expired' };
    sendGlobalToUser(request.senderId, event);
    sendGlobalToUser(request.receiverId, event);
    await restoreReadyNow([request.senderId, request.receiverId]);
    await Promise.allSettled([
      NotificationService.createNotification(
        request.senderId,
        'meet_expired',
        'Your support request expired because the OTP was not entered on the scheduled date.',
      ),
      NotificationService.createNotification(
        request.receiverId,
        'meet_expired',
        'Your support request expired because the OTP was not entered on the scheduled date.',
      ),
    ]);
    expiredCount += 1;
  }
  return expiredCount;
}

export async function expireReadyNowRequests(now = new Date()): Promise<number> {
  const overdue = await prisma.request.findMany({
    where: {
      instantBooking: true,
      status: RequestStatus.PENDING,
      responseDeadlineAt: { lte: now },
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      responseDeadlineAt: true,
      quickPickGroupId: true,
    },
  });
  let expiredCount = 0;
  for (const request of overdue) {
    const result = await prisma.request.updateMany({
      where: {
        id: request.id,
        status: RequestStatus.PENDING,
        responseDeadlineAt: request.responseDeadlineAt,
      },
      data: request.quickPickGroupId
        ? {
            status: RequestStatus.CANCELLED,
            cancelledAt: now,
            cancellationFeeReason: 'Response time elapsed',
            otp: null,
          }
        : { status: RequestStatus.EXPIRED, otp: null },
    });
    if (result.count === 0) continue;
    const status = request.quickPickGroupId ? 'cancelled' : 'expired';
    const event = {
      event: request.quickPickGroupId ? 'request_auto_cancelled' : 'request_expired',
      requestId: request.id,
      status,
    };
    sendGlobalToUser(request.senderId, event);
    sendGlobalToUser(request.receiverId, event);
    const kind = request.quickPickGroupId ? 'meet_canceled' : 'meet_expired';
    const message = request.quickPickGroupId
      ? 'Your Quick Pick request was automatically cancelled because its response time elapsed.'
      : 'Your Ready Now request expired before it was accepted.';
    await Promise.allSettled([
      NotificationService.createNotification(request.senderId, kind, message),
      NotificationService.createNotification(request.receiverId, kind, message),
    ]);
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

async function expireConfirmedRequestsPastOtpDeadlineAndScheduleNext(): Promise<void> {
  try {
    const count = await expireConfirmedRequestsPastOtpDeadline();
    if (count > 0)
      logger.info(`Expired ${count} confirmed request(s) without OTP on the support date`);
    const pending = await prisma.request.findMany({
      where: { status: RequestStatus.CONFIRMED, session: null },
      select: { fromDateTime: true, timezoneOffsetMinutes: true },
    });
    const next = pending
      .map((request) => confirmedOtpExpiresAt(request.fromDateTime, request.timezoneOffsetMinutes))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    if (next) armConfirmedOtpExpiration(next);
  } catch (error) {
    logger.error(`Confirmed OTP expiration failed: ${error}`);
    const retryTimer = setTimeout(() => {
      void expireConfirmedRequestsPastOtpDeadlineAndScheduleNext();
    }, RETRY_DELAY_MS);
    retryTimer.unref();
  }
}

export function startReadyNowExpirationScheduler(): void {
  void expireReadyNowRequestsAndScheduleNext();
  void expireConfirmedRequestsPastOtpDeadlineAndScheduleNext();
}
