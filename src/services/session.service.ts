import { prisma } from '../config/database';
import { otpProximityForRequest } from '../utils/otp-proximity';
import { AppError } from '../utils/app-error';
import { Profile, SessionStatus, RequestStatus } from '@prisma/client';
import { sendToUser, sendGlobalToAll, sendGlobalToUser } from './websocket.service';
import { NotificationService } from './notification.service';
import { getCategoryMatchVariants } from '../constants/mate-categories';
import { restoreReadyNow } from './ready-now.service';

// The 12-hour limit applies to one uninterrupted running period. A resumed
// session keeps its accumulated billable time and receives a new 12-hour run.
const MAX_CONTINUOUS_SESSION_SECONDS = 12 * 60 * 60;
const AUTO_PAUSE_RETRY_MS = 60_000;
let autoPauseTimer: NodeJS.Timeout | null = null;
let scheduledAutoPauseAt: number | null = null;

function isSameLocalCalendarDay(first: Date, second: Date, timezoneOffsetMinutes = 0): boolean {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const firstLocal = new Date(first.getTime() + offsetMs);
  const secondLocal = new Date(second.getTime() + offsetMs);
  return (
    firstLocal.getUTCFullYear() === secondLocal.getUTCFullYear() &&
    firstLocal.getUTCMonth() === secondLocal.getUTCMonth() &&
    firstLocal.getUTCDate() === secondLocal.getUTCDate()
  );
}

function localCalendarDayValue(date: Date, timezoneOffsetMinutes = 0): number {
  const local = new Date(date.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

export type MappedSession = {
  id: number;
  requestId: number;
  senderId: number;
  receiverId: number;
  status: 'running' | 'pause_requested' | 'paused' | 'resume_requested' | 'end_requested' | 'ended';
  startedAt: number;
  endedAt: number | null;
  fromDateTime: string;
  toDateTime: string;
  elapsedSec: number;
  mateUserId: number;
  mateName: string;
  mateTenureId: string;
  mateAvatar: string;
  hourlyRate: number;
  billingAmount: number;
  paymentReceiverUpiId: string | null;
  lastActionBy: number | null;
  endReason: string | null;
  postMeet: {
    rating: number | null;
    review: string | null;
    ratedAt: number | null;
    paymentCompleted: boolean;
    paymentUpiId: string | null;
    paymentMode: string | null;
    paidAt: number | null;
  };
};

function categoryRatesRecord(value: Profile['categoryRates']): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([category, rate]) => [category, Number(rate)] as const)
      .filter(([category, rate]) => category.trim() && Number.isFinite(rate) && rate >= 0),
  );
}

function hourlyRateForRequest(
  profile: Profile | null | undefined,
  categoryLabel?: string | null,
): number {
  if (!profile) {
    return 50;
  }

  const requestedCategory = categoryLabel?.trim().toLowerCase();
  if (requestedCategory) {
    const variants = new Set([
      requestedCategory,
      ...getCategoryMatchVariants(categoryLabel ?? '').map((value) => value.toLowerCase()),
    ]);
    const matched = Object.entries(categoryRatesRecord(profile.categoryRates)).find(([category]) =>
      variants.has(category.trim().toLowerCase()),
    );
    if (matched) {
      return matched[1];
    }
  }

  return profile.hourlyRate ?? 50;
}

async function mapSession(session: any, currentUserId: number): Promise<MappedSession> {
  const isSender = session.senderId === currentUserId;
  const partnerId = isSender ? session.receiverId : session.senderId;

  const [partner, request] = await Promise.all([
    prisma.user.findUnique({
      where: { id: partnerId },
      include: { profile: true },
    }),
    session.request
      ? Promise.resolve(session.request)
      : prisma.request.findUnique({ where: { id: session.requestId } }),
  ]);

  const mateProfile = isSender
    ? partner?.profile
    : await prisma.profile.findFirst({ where: { userId: session.receiverId } });

  const quotedHourlyRate = Number(request?.quotedHourlyRate);
  const hourlyRate =
    Number.isFinite(quotedHourlyRate) && quotedHourlyRate > 0
      ? quotedHourlyRate
      : hourlyRateForRequest(mateProfile, request?.categoryLabel);

  // Calculate dynamic elapsed time if running
  let elapsedSec = session.totalElapsedSeconds;
  const runningStatuses = [
    SessionStatus.RUNNING,
    SessionStatus.PAUSE_REQUESTED,
    SessionStatus.RESUME_REQUESTED,
    SessionStatus.END_REQUESTED,
  ];
  if (runningStatuses.includes(session.status) && session.lastTimerStart) {
    const deltaMs = Date.now() - session.lastTimerStart.getTime();
    elapsedSec += Math.floor(deltaMs / 1000);
  }

  const supportAmount = (elapsedSec / 3600) * hourlyRate;
  const extraSupportAmount =
    request?.readyToPayTip && request.extraSupportAmount != null
      ? Number(request.extraSupportAmount)
      : 0;
  const billingAmount = parseFloat((supportAmount + extraSupportAmount).toFixed(2));

  let statusMapped: MappedSession['status'] = 'running';
  switch (session.status) {
    case SessionStatus.RUNNING:
      statusMapped = 'running';
      break;
    case SessionStatus.PAUSE_REQUESTED:
      statusMapped = 'pause_requested';
      break;
    case SessionStatus.PAUSED:
      statusMapped = 'paused';
      break;
    case SessionStatus.RESUME_REQUESTED:
      statusMapped = 'resume_requested';
      break;
    case SessionStatus.END_REQUESTED:
      statusMapped = 'end_requested';
      break;
    case SessionStatus.ENDED:
      statusMapped = 'ended';
      break;
  }

  return {
    id: session.id,
    requestId: session.requestId,
    senderId: session.senderId,
    receiverId: session.receiverId,
    status: statusMapped,
    startedAt: session.startedAt.getTime(),
    endedAt: session.endedAt ? session.endedAt.getTime() : null,
    fromDateTime: request?.fromDateTime?.toISOString() ?? session.startedAt.toISOString(),
    toDateTime:
      request?.toDateTime?.toISOString() ?? (session.endedAt ?? session.startedAt).toISOString(),
    elapsedSec,
    mateUserId: partnerId,
    mateName: partner?.profile?.fullName ?? partner?.name ?? 'Anonymous',
    mateTenureId: partner?.tenureId ?? 'Not assigned',
    mateAvatar: partner?.profile?.profilePhoto ?? '',
    hourlyRate,
    billingAmount,
    paymentReceiverUpiId: isSender ? (partner?.profile?.defaultUpiId ?? null) : null,
    lastActionBy: session.lastActionBy,
    endReason: session.endReason ?? null,
    postMeet: {
      rating: isSender ? (session.senderRating ?? null) : (session.receiverRating ?? null),
      review: isSender ? (session.senderReview ?? null) : (session.receiverReview ?? null),
      ratedAt: (isSender ? session.senderRatedAt : session.receiverRatedAt)?.getTime() ?? null,
      paymentCompleted: session.paymentCompletedAt != null,
      paymentUpiId: session.paymentUpiId ?? null,
      paymentMode: session.paymentMode ?? null,
      paidAt: session.paymentCompletedAt?.getTime() ?? null,
    },
  };
}

function broadcastSessionUpdate(
  session: any,
  mappedForSender: MappedSession,
  mappedForReceiver: MappedSession,
) {
  sendToUser(session.senderId, { event: 'session_update', session: mappedForSender });
  sendToUser(session.receiverId, { event: 'session_update', session: mappedForReceiver });
  sendGlobalToUser(session.senderId, { event: 'session_updated' });
  sendGlobalToUser(session.receiverId, { event: 'session_updated' });
}

function armSessionAutoPause(deadline: Date): void {
  const wakeAt = deadline.getTime();
  if (autoPauseTimer && scheduledAutoPauseAt !== null && scheduledAutoPauseAt <= wakeAt) {
    return;
  }
  if (autoPauseTimer) clearTimeout(autoPauseTimer);
  scheduledAutoPauseAt = wakeAt;
  autoPauseTimer = setTimeout(
    () => {
      autoPauseTimer = null;
      scheduledAutoPauseAt = null;
      void runSessionAutoPauseAndScheduleNext();
    },
    Math.max(0, wakeAt - Date.now()),
  );
  autoPauseTimer.unref();
}

async function runSessionAutoPauseAndScheduleNext(): Promise<void> {
  try {
    await SessionService.autoPauseOverdueSessions();
    const activeSessions = await prisma.session.findMany({
      where: {
        status: {
          in: [
            SessionStatus.RUNNING,
            SessionStatus.PAUSE_REQUESTED,
            SessionStatus.RESUME_REQUESTED,
            SessionStatus.END_REQUESTED,
          ],
        },
        lastTimerStart: { not: null },
      },
      select: { lastTimerStart: true, totalElapsedSeconds: true },
    });
    const nextDeadline = activeSessions.reduce<Date | null>((earliest, session) => {
      if (!session.lastTimerStart) return earliest;
      const deadline = new Date(
        session.lastTimerStart.getTime() + MAX_CONTINUOUS_SESSION_SECONDS * 1000,
      );
      return !earliest || deadline < earliest ? deadline : earliest;
    }, null);
    if (nextDeadline) armSessionAutoPause(nextDeadline);
  } catch (error) {
    console.error('Session auto-pause failed:', error);
    armSessionAutoPause(new Date(Date.now() + AUTO_PAUSE_RETRY_MS));
  }
}

export function scheduleSessionAutoPause(lastTimerStart: Date, _totalElapsedSeconds = 0): void {
  armSessionAutoPause(new Date(lastTimerStart.getTime() + MAX_CONTINUOUS_SESSION_SECONDS * 1000));
}

export function startSessionAutoPauseScheduler(): void {
  void runSessionAutoPauseAndScheduleNext();
}

export class SessionService {
  public static async autoPauseOverdueSessions(now = new Date()): Promise<number> {
    const activeSessions = await prisma.session.findMany({
      where: {
        status: {
          in: [
            SessionStatus.RUNNING,
            SessionStatus.PAUSE_REQUESTED,
            SessionStatus.RESUME_REQUESTED,
            SessionStatus.END_REQUESTED,
          ],
        },
        lastTimerStart: { not: null },
      },
    });
    let pausedCount = 0;

    for (const session of activeSessions) {
      if (!session.lastTimerStart) continue;
      const additionalSeconds = Math.max(
        0,
        Math.floor((now.getTime() - session.lastTimerStart.getTime()) / 1000),
      );
      if (additionalSeconds < MAX_CONTINUOUS_SESSION_SECONDS) continue;

      const result = await prisma.session.updateMany({
        where: {
          id: session.id,
          status: session.status,
          lastTimerStart: session.lastTimerStart,
        },
        data: {
          status: SessionStatus.PAUSED,
          totalElapsedSeconds: session.totalElapsedSeconds + additionalSeconds,
          lastTimerStart: null,
          lastActionBy: null,
        },
      });
      if (result.count === 0) continue;

      const updated = {
        ...session,
        status: SessionStatus.PAUSED,
        totalElapsedSeconds: session.totalElapsedSeconds + additionalSeconds,
        lastTimerStart: null,
        lastActionBy: null,
      };
      const [mappedSender, mappedReceiver] = await Promise.all([
        mapSession(updated, updated.senderId),
        mapSession(updated, updated.receiverId),
      ]);
      broadcastSessionUpdate(updated, mappedSender, mappedReceiver);
      const message = 'Your meeting was automatically paused after reaching the 12-hour limit.';
      await Promise.all([
        NotificationService.createNotification(updated.senderId, 'session_auto_paused', message),
        NotificationService.createNotification(updated.receiverId, 'session_auto_paused', message),
      ]);
      pausedCount += 1;
    }
    return pausedCount;
  }

  private static async endedParticipantSession(userId: number, requestId: number) {
    const session = await prisma.session.findUnique({ where: { requestId } });
    if (!session) throw new AppError('Session not found', 404);
    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }
    if (session.status !== SessionStatus.ENDED) {
      throw new AppError('The meet must end before this action', 400);
    }
    return session;
  }

  public static async submitFeedback(
    userId: number,
    requestId: number,
    rating: number,
  ): Promise<MappedSession> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError('Rating must be between 1 and 5', 400);
    }
    const session = await SessionService.endedParticipantSession(userId, requestId);
    if (session.senderId !== userId) {
      throw new AppError('Only the beneficiary can submit a review', 403);
    }
    const updated = await prisma.session.update({
      where: { requestId },
      data: { senderRating: rating, senderReview: null, senderRatedAt: new Date() },
    });
    return mapSession(updated, userId);
  }

  public static async completeMockPayment(
    userId: number,
    requestId: number,
    paymentMode: 'cash' | 'upi' | 'qr',
  ): Promise<MappedSession> {
    const session = await SessionService.endedParticipantSession(userId, requestId);
    if (session.senderId !== userId) {
      throw new AppError('Only the request sender can complete payment', 403);
    }
    const receiverProfile = await prisma.profile.findUnique({
      where: { userId: session.receiverId },
      select: { defaultUpiId: true, upiIds: true },
    });
    const usesUpi = paymentMode === 'upi' || paymentMode === 'qr';
    const paymentUpiId = usesUpi ? (receiverProfile?.defaultUpiId ?? null) : null;
    if (usesUpi && (!paymentUpiId || !receiverProfile?.upiIds.includes(paymentUpiId))) {
      throw new AppError('The supporter has not configured a default UPI ID', 400);
    }
    const updated = await prisma.session.update({
      where: { requestId },
      data: {
        paymentCompletedBy: userId,
        paymentMode,
        paymentUpiId,
        paymentCompletedAt: new Date(),
      },
    });
    const [mappedSender, mappedReceiver] = await Promise.all([
      mapSession(updated, updated.senderId),
      mapSession(updated, updated.receiverId),
    ]);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);
    return mappedSender;
  }

  public static async startSession(
    userId: number,
    requestId: number,
    _otp: string,
  ): Promise<MappedSession> {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Meet request not found', 404);
    }

    if (request.status !== RequestStatus.CONFIRMED) {
      throw new AppError('Cannot start a session on an unconfirmed request', 400);
    }

    if (request.senderId !== userId && request.receiverId !== userId) {
      throw new AppError('You are not authorized to start a session for this request', 403);
    }
    if (request.receiverId !== userId) {
      throw new AppError('Only the supporter can verify the OTP and start this session', 403);
    }

    const existingSession = await prisma.session.findUnique({
      where: { requestId },
    });

    if (existingSession) {
      return mapSession(existingSession, userId);
    }

    const now = new Date();
    const timezoneOffsetMinutes = request.timezoneOffsetMinutes ?? 0;
    const isScheduledDate = isSameLocalCalendarDay(
      now,
      request.fromDateTime,
      timezoneOffsetMinutes,
    );
    if (!isScheduledDate) {
      const isBeforeScheduledDate =
        localCalendarDayValue(now, timezoneOffsetMinutes) <
        localCalendarDayValue(request.fromDateTime, timezoneOffsetMinutes);
      if (isBeforeScheduledDate) {
        throw new AppError('OTP verification is allowed only on the scheduled support date.', 400);
      }

      await prisma.request.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
          cancellationFeeReason: 'OTP was not entered on the scheduled support date.',
        },
      });
      await restoreReadyNow([request.senderId, request.receiverId]);
      throw new AppError('OTP verification is allowed only on the scheduled support date.', 400);
    }

    const proximity = otpProximityForRequest(request);
    if (!proximity.ready) {
      throw new AppError(proximity.message, 400);
    }
    if (!_otp || request.otp !== _otp) {
      throw new AppError('Invalid verification OTP code', 400);
    }

    const session = await prisma.session.create({
      data: {
        requestId,
        senderId: request.senderId,
        receiverId: request.receiverId,
        status: SessionStatus.RUNNING,
        startedAt: new Date(),
        lastTimerStart: new Date(),
      },
    });

    const mappedSender = await mapSession(session, session.senderId);
    const mappedReceiver = await mapSession(session, session.receiverId);
    broadcastSessionUpdate(session, mappedSender, mappedReceiver);
    scheduleSessionAutoPause(session.lastTimerStart!, session.totalElapsedSeconds);

    return mapSession(session, userId);
  }

  public static async pauseRequest(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    if (session.status !== SessionStatus.RUNNING) {
      throw new AppError('Session is not running', 400);
    }

    const updated = await prisma.session.update({
      where: { requestId: session.requestId },
      data: {
        status: SessionStatus.PAUSE_REQUESTED,
        lastActionBy: userId,
      },
    });

    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);

    return mapSession(updated, userId);
  }

  public static async pauseConfirm(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    if (session.status !== SessionStatus.PAUSE_REQUESTED) {
      throw new AppError('No pause request pending', 400);
    }

    if (session.lastActionBy === userId) {
      throw new AppError('You cannot confirm your own pause request', 400);
    }

    // Accumulate elapsed seconds
    const now = new Date();
    let additionalSeconds = 0;
    if (session.lastTimerStart) {
      additionalSeconds = Math.floor((now.getTime() - session.lastTimerStart.getTime()) / 1000);
    }

    const updated = await prisma.session.update({
      where: { requestId },
      data: {
        status: SessionStatus.PAUSED,
        totalElapsedSeconds: session.totalElapsedSeconds + additionalSeconds,
        lastTimerStart: null,
        lastActionBy: null,
      },
    });

    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);

    return mapSession(updated, userId);
  }

  public static async resumeRequest(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    if (session.status !== SessionStatus.PAUSED) {
      throw new AppError('Session is not paused', 400);
    }

    const updated = await prisma.session.update({
      where: { requestId },
      data: {
        status: SessionStatus.RESUME_REQUESTED,
        lastActionBy: userId,
      },
    });

    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);

    return mapSession(updated, userId);
  }

  public static async resumeConfirm(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    if (session.status !== SessionStatus.RESUME_REQUESTED) {
      throw new AppError('No resume request pending', 400);
    }

    if (session.lastActionBy === userId) {
      throw new AppError('You cannot confirm your own resume request', 400);
    }

    const updated = await prisma.session.update({
      where: { requestId },
      data: {
        status: SessionStatus.RUNNING,
        lastTimerStart: new Date(),
        lastActionBy: null,
      },
    });

    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);
    scheduleSessionAutoPause(updated.lastTimerStart!, updated.totalElapsedSeconds);

    return mapSession(updated, userId);
  }

  public static async endSession(
    userId: number,
    requestId: number,
    endReason?: string | null,
  ): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    if (session.status === SessionStatus.ENDED) {
      return mapSession(session, userId);
    }

    // The receiver is the supporter and may end immediately. The sender is
    // the beneficiary, whose end request must be confirmed by the supporter.
    if (userId === session.senderId) {
      if (session.status === SessionStatus.END_REQUESTED) {
        return mapSession(session, userId);
      }
      const requested = await prisma.session.update({
        where: { requestId },
        data: {
          status: SessionStatus.END_REQUESTED,
          lastActionBy: userId,
          endReason: endReason?.trim() || session.endReason || null,
        },
      });
      const mappedSender = await mapSession(requested, requested.senderId);
      const mappedReceiver = await mapSession(requested, requested.receiverId);
      broadcastSessionUpdate(requested, mappedSender, mappedReceiver);
      return mapSession(requested, userId);
    }

    return this.finalizeSession(session, endReason);
  }

  public static async confirmEndSession(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({ where: { requestId } });
    if (!session) throw new AppError('Session not found', 404);
    if (userId !== session.receiverId) {
      throw new AppError('Only the supporter can confirm ending this tenure', 403);
    }
    if (session.status !== SessionStatus.END_REQUESTED) {
      throw new AppError('No end request is pending', 400);
    }
    return this.finalizeSession(session, session.endReason);
  }

  private static async finalizeSession(
    session: any,
    endReason?: string | null,
  ): Promise<MappedSession> {
    const now = new Date();
    let additionalSeconds = 0;
    const isRunning = (
      [
        SessionStatus.RUNNING,
        SessionStatus.PAUSE_REQUESTED,
        SessionStatus.RESUME_REQUESTED,
        SessionStatus.END_REQUESTED,
      ] as SessionStatus[]
    ).includes(session.status);

    if (isRunning && session.lastTimerStart) {
      additionalSeconds = Math.floor((now.getTime() - session.lastTimerStart.getTime()) / 1000);
    }

    const updated = await prisma.session.update({
      where: { requestId: session.requestId },
      data: {
        status: SessionStatus.ENDED,
        totalElapsedSeconds: session.totalElapsedSeconds + additionalSeconds,
        lastTimerStart: null,
        endedAt: now,
        lastActionBy: null,
        endReason: endReason?.trim() || session.endReason || null,
      },
    });

    await restoreReadyNow([updated.senderId, updated.receiverId]);
    sendGlobalToAll({
      event: 'busy_now_changed',
      userIds: [updated.senderId, updated.receiverId],
      busyNow: false,
    });

    // Also update request status to cancel or expire if finished
    // But since session has finished, we can just keep request status as confirmed, or keep request state.
    // Let's map it.
    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);

    // Create notifications for billing
    try {
      await NotificationService.createNotification(
        updated.senderId,
        'payment_sent',
        `you paid ${mappedSender.billingAmount} to ${mappedSender.mateName}`,
        updated.receiverId,
      );
      await NotificationService.createNotification(
        updated.receiverId,
        'payment_received',
        `you received ${mappedReceiver.billingAmount} from ${mappedReceiver.mateName}`,
        updated.senderId,
      );
    } catch (notifErr: any) {
      console.error('Failed to create session billing notifications:', notifErr.message);
    }

    return mapSession(updated, updated.receiverId);
  }

  public static async getSession(userId: number, requestId: number): Promise<MappedSession> {
    const session = await prisma.session.findUnique({
      where: { requestId },
    });

    if (!session) {
      throw new AppError('Session not found', 404);
    }

    if (session.senderId !== userId && session.receiverId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    return mapSession(session, userId);
  }

  public static async getActiveSession(userId: number): Promise<MappedSession | null> {
    const session = await prisma.session.findFirst({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: { not: SessionStatus.ENDED },
      },
    });

    if (!session) {
      return null;
    }

    return mapSession(session, userId);
  }
}
