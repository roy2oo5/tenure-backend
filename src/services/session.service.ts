import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { SessionStatus, RequestStatus } from '@prisma/client';
import { sendToUser } from './websocket.service';

export type MappedSession = {
  id: string;
  requestId: string;
  senderId: string;
  receiverId: string;
  status: 'running' | 'pause_requested' | 'paused' | 'resume_requested' | 'ended';
  startedAt: number;
  endedAt: number | null;
  elapsedSec: number;
  mateUserId: string;
  mateName: string;
  mateTenureId: string;
  mateAvatar: string;
  hourlyRate: number;
  billingAmount: number;
  lastActionBy: string | null;
};

async function mapSession(session: any, currentUserId: string): Promise<MappedSession> {
  const isSender = session.senderId === currentUserId;
  const partnerId = isSender ? session.receiverId : session.senderId;

  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    include: { profile: true },
  });

  const mateProfile = isSender
    ? partner?.profile
    : await prisma.profile.findFirst({ where: { userId: session.receiverId } });

  const hourlyRate = mateProfile?.hourlyRate ?? 50;

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
    elapsedSec,
    mateUserId: partnerId,
    mateName: partner?.profile?.fullName ?? partner?.name ?? 'Anonymous',
    mateTenureId: partner?.profile?.tenureId ?? 'Not assigned',
    mateAvatar: partner?.profile?.profilePhoto ?? '',
    hourlyRate,
    billingAmount,
    lastActionBy: session.lastActionBy,
  };
}

function broadcastSessionUpdate(session: any, mappedForSender: MappedSession, mappedForReceiver: MappedSession) {
  sendToUser(session.senderId, { event: 'session_update', session: mappedForSender });
  sendToUser(session.receiverId, { event: 'session_update', session: mappedForReceiver });
}

export class SessionService {
  public static async startSession(userId: string, requestId: string, otp: string): Promise<MappedSession> {
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

    if (!otp || request.otp !== otp) {
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

  public static async pauseRequest(userId: string, requestId: string): Promise<MappedSession> {
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

  public static async pauseConfirm(userId: string, requestId: string): Promise<MappedSession> {
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

  public static async resumeRequest(userId: string, requestId: string): Promise<MappedSession> {
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

  public static async resumeConfirm(userId: string, requestId: string): Promise<MappedSession> {
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

  public static async endSession(userId: string, requestId: string): Promise<MappedSession> {
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
    const isRunning = [
      SessionStatus.RUNNING,
      SessionStatus.PAUSE_REQUESTED,
      SessionStatus.RESUME_REQUESTED,
    ].includes(session.status);

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
      },
    });

    // Also update request status to cancel or expire if finished
    // But since session has finished, we can just keep request status as confirmed, or keep request state.
    // Let's map it.
    const mappedSender = await mapSession(updated, updated.senderId);
    const mappedReceiver = await mapSession(updated, updated.receiverId);
    broadcastSessionUpdate(updated, mappedSender, mappedReceiver);

    return mapSession(updated, userId);
  }

  public static async getSession(userId: string, requestId: string): Promise<MappedSession> {
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

  public static async getActiveSession(userId: string): Promise<MappedSession | null> {
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
