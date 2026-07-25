import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { Profile, SessionStatus, RequestStatus } from '@prisma/client';
import { sendToUser, sendGlobalToUser } from './websocket.service';
import { NotificationService } from './notification.service';
import { getCategoryMatchVariants } from '../constants/mate-categories';

export type MappedSession = {
  id: number;
  requestId: number;
  senderId: number;
  receiverId: number;
  status: 'running' | 'pause_requested' | 'paused' | 'resume_requested' | 'ended';
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
  lastActionBy: number | null;
  endReason: string | null;
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
      ...getCategoryMatchVariants(categoryLabel ?? '').map(value => value.toLowerCase()),
    ]);
    const matched = Object.entries(categoryRatesRecord(profile.categoryRates)).find(
      ([category]) => variants.has(category.trim().toLowerCase()),
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

  const hourlyRate = hourlyRateForRequest(mateProfile, request?.categoryLabel);

  // Calculate dynamic elapsed time if running
  let elapsedSec = session.totalElapsedSeconds;
  const runningStatuses = [
    SessionStatus.RUNNING,
    SessionStatus.PAUSE_REQUESTED,
    SessionStatus.RESUME_REQUESTED,
  ];
  if (runningStatuses.includes(session.status) && session.lastTimerStart) {
    const deltaMs = Date.now() - session.lastTimerStart.getTime();
    elapsedSec += Math.floor(deltaMs / 1000);
  }

  const billingAmount = parseFloat(((elapsedSec / 3600) * hourlyRate).toFixed(2));

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
    toDateTime: request?.toDateTime?.toISOString() ?? (session.endedAt ?? session.startedAt).toISOString(),
    elapsedSec,
    mateUserId: partnerId,
    mateName: partner?.profile?.fullName ?? partner?.name ?? 'Anonymous',
    mateTenureId: partner?.tenureId ?? 'Not assigned',
    mateAvatar: partner?.profile?.profilePhoto ?? '',
    hourlyRate,
    billingAmount,
    lastActionBy: session.lastActionBy,
    endReason: session.endReason ?? null,
  };
}

function broadcastSessionUpdate(session: any, mappedForSender: MappedSession, mappedForReceiver: MappedSession) {
  sendToUser(session.senderId, { event: 'session_update', session: mappedForSender });
  sendToUser(session.receiverId, { event: 'session_update', session: mappedForReceiver });
  sendGlobalToUser(session.senderId, { event: 'session_updated' });
  sendGlobalToUser(session.receiverId, { event: 'session_updated' });
}

export class SessionService {
  public static async startSession(userId: number, requestId: number, _otp: string): Promise<MappedSession> {
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

    if (!_otp || request.otp !== _otp) {
      throw new AppError('Invalid verification OTP code', 400);
    }

    const existingSession = await prisma.session.findUnique({
      where: { requestId },
    });

    if (existingSession) {
      return mapSession(existingSession, userId);
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
      where: { requestId },
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

    const now = new Date();
    let additionalSeconds = 0;
    const isRunning = ([
      SessionStatus.RUNNING,
      SessionStatus.PAUSE_REQUESTED,
      SessionStatus.RESUME_REQUESTED,
    ] as SessionStatus[]).includes(session.status);

    if (isRunning && session.lastTimerStart) {
      additionalSeconds = Math.floor((now.getTime() - session.lastTimerStart.getTime()) / 1000);
    }

    const updated = await prisma.session.update({
      where: { requestId },
      data: {
        status: SessionStatus.ENDED,
        totalElapsedSeconds: session.totalElapsedSeconds + additionalSeconds,
        lastTimerStart: null,
        endedAt: now,
        lastActionBy: null,
        endReason: endReason?.trim() || session.endReason || null,
      },
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
        `you paid ${mappedSender.billingAmount} to ${mappedSender.mateName}`
      );
      await NotificationService.createNotification(
        updated.receiverId,
        'payment_received',
        `you received ${mappedReceiver.billingAmount} from ${mappedReceiver.mateName}`
      );
    } catch (notifErr: any) {
      console.error('Failed to create session billing notifications:', notifErr.message);
    }

    return mapSession(updated, userId);
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
