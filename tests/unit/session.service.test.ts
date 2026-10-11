import { SessionService } from '@/services/session.service';
import { prisma } from '@/config/database';
import { SessionStatus, RequestStatus } from '@prisma/client';
import { sendToUser } from '@/services/websocket.service';

vi.mock('@/config/database', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    request: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/config/firebase', () => ({
  sendSilentDataNotification: vi.fn(),
}));

vi.mock('@/services/upload.service', () => ({
  UploadService: { deleteUploadedFile: vi.fn() },
}));

vi.mock('@/services/websocket.service', () => ({
  sendToUser: vi.fn(),
  sendGlobalToUser: vi.fn(),
  sendGlobalToAll: vi.fn(),
}));

describe('SessionService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  beforeEach(() => {
    (prisma.profile.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.message.findMany as any).mockResolvedValue([]);
    (prisma.message.deleteMany as any).mockResolvedValue({ count: 0 });
    (prisma.user.findMany as any).mockResolvedValue([]);
  });

  const mockRequest = {
    id: 101,
    senderId: 1,
    receiverId: 2,
    status: RequestStatus.CONFIRMED,
    otp: '1234',
    fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
    timezoneOffsetMinutes: 330,
    senderCurrentLatitude: 13.3409,
    senderCurrentLongitude: 74.7421,
    senderLocationUpdatedAt: new Date(),
    receiverCurrentLatitude: 13.3409,
    receiverCurrentLongitude: 74.7421,
    receiverLocationUpdatedAt: new Date(),
  };

  const mockSenderUser = {
    id: 1,
    name: 'Sender User',
    tenureId: 'SNDR123',
    profile: {
      fullName: 'Sender FullName',
      profilePhoto: 'sender-avatar.jpg',
      hourlyRate: 50,
    },
  };

  const mockReceiverUser = {
    id: 2,
    name: 'Receiver User',
    tenureId: 'RCVR123',
    profile: {
      fullName: 'Receiver FullName',
      profilePhoto: 'receiver-avatar.jpg',
      hourlyRate: 60,
    },
  };

  describe('startSession', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(SessionService.startSession(1, 101, '1234')).rejects.toThrow(
        'Meet request not found',
      );
    });

    it('should throw an error if request is not confirmed', async () => {
      (prisma.request.findUnique as any).mockResolvedValue({
        ...mockRequest,
        status: RequestStatus.PENDING,
      });

      await expect(SessionService.startSession(1, 101, '1234')).rejects.toThrow(
        'Cannot start a session on an unconfirmed request',
      );
    });

    it('should throw an error if user is not authorized', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(SessionService.startSession(999, 101, '1234')).rejects.toThrow(
        'You are not authorized to start a session for this request',
      );
    });

    it('should throw an error if OTP is invalid', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T10:30:00.000Z'));
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(null);

      await expect(SessionService.startSession(2, 101, 'invalid-otp')).rejects.toThrow(
        'Invalid verification OTP code',
      );
    });

    it('allows OTP verification before the scheduled time on the scheduled date', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T01:00:00.000Z'));

      const created = {
        id: 202,
        requestId: 101,
        senderId: 1,
        receiverId: 2,
        status: SessionStatus.RUNNING,
        startedAt: new Date(),
        lastTimerStart: new Date(),
        totalElapsedSeconds: 0,
        lastActionBy: null,
      };
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(null);
      (prisma.session.create as any).mockResolvedValue(created);
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      await expect(SessionService.startSession(2, 101, '1234')).resolves.toMatchObject({
        status: 'running',
      });
    });

    it('allows OTP verification after the scheduled time on the scheduled date', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T18:00:00.000Z'));

      const created = {
        id: 202,
        requestId: 101,
        senderId: 1,
        receiverId: 2,
        status: SessionStatus.RUNNING,
        startedAt: new Date(),
        lastTimerStart: new Date(),
        totalElapsedSeconds: 0,
        lastActionBy: null,
      };
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(null);
      (prisma.session.create as any).mockResolvedValue(created);
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      await expect(SessionService.startSession(2, 101, '1234')).resolves.toMatchObject({
        status: 'running',
      });
    });

    it('rejects OTP verification before the scheduled date without cancelling the request', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-19T18:00:00.000Z'));
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(null);

      await expect(SessionService.startSession(2, 101, '1234')).rejects.toThrow(
        'OTP verification is allowed only on the scheduled support date.',
      );
      expect(prisma.request.update).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects OTP verification outside the scheduled support date', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T19:00:00.000Z'));

      (prisma.request.findUnique as any).mockResolvedValue({
        ...mockRequest,
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
      });
      (prisma.session.findUnique as any).mockResolvedValue(null);

      await expect(SessionService.startSession(2, 101, '1234')).rejects.toThrow(
        'OTP verification is allowed only on the scheduled support date.',
      );

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
          cancellationFeeReason: 'OTP was not entered on the scheduled support date.',
        },
      });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('should return existing mapped session if it already exists', async () => {
      const now = new Date();
      const existing = {
        id: 201,
        requestId: 101,
        senderId: 1,
        receiverId: 2,
        status: SessionStatus.RUNNING,
        startedAt: now,
        lastTimerStart: now,
        totalElapsedSeconds: 100,
        lastActionBy: null,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(existing);
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      const result = await SessionService.startSession(2, 101, '1234');
      expect(result.id).toBe(201);
      expect(result.status).toBe('running');
    });

    it('should create and broadcast new session if none exists', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T10:30:00.000Z'));
      const now = new Date();
      const created = {
        id: 202,
        requestId: 101,
        senderId: 1,
        receiverId: 2,
        status: SessionStatus.RUNNING,
        startedAt: now,
        lastTimerStart: now,
        totalElapsedSeconds: 0,
        lastActionBy: null,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.session.findUnique as any).mockResolvedValue(null);
      (prisma.session.create as any).mockResolvedValue(created);
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      const result = await SessionService.startSession(2, 101, '1234');
      expect(prisma.session.create).toHaveBeenCalled();
      expect(sendToUser).toHaveBeenCalledTimes(2); // broadcast to sender and receiver
      expect(result.status).toBe('running');
    });
  });

  describe('12-hour auto-pause', () => {
    it('pauses an overdue session and notifies both participants', async () => {
      const overdueSession = {
        id: 201,
        requestId: 101,
        senderId: 1,
        receiverId: 2,
        status: SessionStatus.RUNNING,
        startedAt: new Date('2027-06-20T00:00:00.000Z'),
        lastTimerStart: new Date('2027-06-20T00:00:00.000Z'),
        totalElapsedSeconds: 0,
        lastActionBy: null,
      };
      (prisma.session.findMany as any).mockResolvedValue([overdueSession]);
      (prisma.session.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.user.findUnique as any).mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 1 ? mockSenderUser : mockReceiverUser),
      );
      (prisma.notification.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.userId + 1000, ...data }),
      );

      const count = await SessionService.autoPauseOverdueSessions(
        new Date('2027-06-20T12:00:01.000Z'),
      );

      expect(count).toBe(1);
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SessionStatus.PAUSED,
            // Preserve all active seconds, including the second that crossed
            // the continuous 12-hour pause threshold.
            totalElapsedSeconds: 43_201,
            lastTimerStart: null,
          }),
        }),
      );
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(sendToUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('pause transitions', () => {
    const startedAt = new Date(Date.now() - 5000);
    const lastTimerStart = new Date(Date.now() - 5000);

    const activeSession = {
      id: 201,
      requestId: 101,
      senderId: 1,
      receiverId: 2,
      status: SessionStatus.RUNNING,
      startedAt,
      lastTimerStart,
      totalElapsedSeconds: 0,
      lastActionBy: null,
    };

    it('pauseRequest should transition status to PAUSE_REQUESTED and set lastActionBy', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(activeSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...activeSession,
          status: data.status,
          lastActionBy: data.lastActionBy,
        });
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      const result = await SessionService.pauseRequest(1, 101);
      expect(result.status).toBe('pause_requested');
      expect(result.lastActionBy).toBe(1);
    });

    it('pauseConfirm should throw error if the same user tries to confirm', async () => {
      const pausedRequestedSession = {
        ...activeSession,
        status: SessionStatus.PAUSE_REQUESTED,
        lastActionBy: 1,
      };
      (prisma.session.findUnique as any).mockResolvedValue(pausedRequestedSession);

      await expect(SessionService.pauseConfirm(1, 101)).rejects.toThrow(
        'You cannot confirm your own pause request',
      );
    });

    it('pauseConfirm should succeed when confirmed by the partner, accumulating elapsed time', async () => {
      const pausedRequestedSession = {
        ...activeSession,
        status: SessionStatus.PAUSE_REQUESTED,
        lastActionBy: 1,
      };
      (prisma.session.findUnique as any).mockResolvedValue(pausedRequestedSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...pausedRequestedSession,
          status: data.status,
          totalElapsedSeconds: data.totalElapsedSeconds,
          lastTimerStart: data.lastTimerStart,
          lastActionBy: data.lastActionBy,
        });
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockSenderUser);

      const result = await SessionService.pauseConfirm(2, 101);
      expect(result.status).toBe('paused');
      expect(result.lastActionBy).toBeNull();
      expect(result.elapsedSec).toBeGreaterThanOrEqual(5);
    });
  });

  describe('resume transitions', () => {
    const startedAt = new Date();
    const pausedSession = {
      id: 201,
      requestId: 101,
      senderId: 1,
      receiverId: 2,
      status: SessionStatus.PAUSED,
      startedAt,
      lastTimerStart: null,
      totalElapsedSeconds: 120,
      lastActionBy: null,
    };

    it('resumeRequest should transition status to RESUME_REQUESTED and set lastActionBy', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(pausedSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...pausedSession,
          status: data.status,
          lastActionBy: data.lastActionBy,
        });
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      const result = await SessionService.resumeRequest(1, 101);
      expect(result.status).toBe('resume_requested');
      expect(result.lastActionBy).toBe(1);
    });

    it('resumeConfirm should throw error if the same user tries to confirm', async () => {
      const resumeRequestedSession = {
        ...pausedSession,
        status: SessionStatus.RESUME_REQUESTED,
        lastActionBy: 1,
      };
      (prisma.session.findUnique as any).mockResolvedValue(resumeRequestedSession);

      await expect(SessionService.resumeConfirm(1, 101)).rejects.toThrow(
        'You cannot confirm your own resume request',
      );
    });

    it('resumeConfirm should succeed when confirmed by partner', async () => {
      const resumeRequestedSession = {
        ...pausedSession,
        status: SessionStatus.RESUME_REQUESTED,
        lastActionBy: 1,
      };
      (prisma.session.findUnique as any).mockResolvedValue(resumeRequestedSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...resumeRequestedSession,
          status: data.status,
          lastTimerStart: data.lastTimerStart,
          lastActionBy: data.lastActionBy,
        });
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockSenderUser);

      const result = await SessionService.resumeConfirm(2, 101);
      expect(result.status).toBe('running');
      expect(result.lastActionBy).toBeNull();
    });
  });

  describe('endSession & billing', () => {
    const startedAt = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const lastTimerStart = new Date(Date.now() - 3600 * 1000);

    const activeSession = {
      id: 201,
      requestId: 101,
      senderId: 1,
      receiverId: 2,
      status: SessionStatus.RUNNING,
      startedAt,
      lastTimerStart,
      totalElapsedSeconds: 0,
      lastActionBy: null,
    };

    it('should transition status to ENDED, clear lastActionBy, and calculate correct billing', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(activeSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...activeSession,
          status: data.status,
          totalElapsedSeconds: data.totalElapsedSeconds,
          lastTimerStart: data.lastTimerStart,
          endedAt: data.endedAt,
          lastActionBy: data.lastActionBy,
        });
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser); // receiver is the mate (rate 60)

      // Receiver is the supporter, so their end action is immediate.
      const result = await SessionService.endSession(2, 101);
      expect(result.status).toBe('ended');
      expect(result.lastActionBy).toBeNull();
      expect(result.elapsedSec).toBeGreaterThanOrEqual(3600);
      expect(result.billingAmount).toBeCloseTo(50.0, 1);
      expect(prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { requestId: 101 },
      });
    });

    it('adds the selected extra-support amount to billing at the fixed request rate', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(activeSession);
      (prisma.session.update as any).mockImplementation(({ data }: any) =>
        Promise.resolve({
          ...activeSession,
          status: data.status,
          totalElapsedSeconds: 3600,
          lastTimerStart: data.lastTimerStart,
          endedAt: data.endedAt,
          lastActionBy: data.lastActionBy,
        }),
      );
      (prisma.request.findUnique as any).mockResolvedValue({
        ...mockRequest,
        categoryLabel: 'Companionship',
        quotedHourlyRate: 80,
        readyToPayTip: true,
        extraSupportAmount: 25,
      });
      (prisma.user.findUnique as any).mockResolvedValue(mockReceiverUser);

      const result = await SessionService.endSession(2, 101);

      expect(result.billingAmount).toBe(105);
    });
  });
});
