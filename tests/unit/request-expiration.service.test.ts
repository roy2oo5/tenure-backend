import { RequestStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import {
  confirmedOtpExpiresAt,
  expireConfirmedRequestsPastOtpDeadline,
  expireReadyNowRequests,
} from '@/services/request-expiration.service';
import { sendGlobalToUser } from '@/services/websocket.service';
import { NotificationService } from '@/services/notification.service';
import { restoreReadyNow } from '@/services/ready-now.service';

vi.mock('@/config/database', () => ({
  prisma: {
    request: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/services/websocket.service', () => ({
  sendGlobalToUser: vi.fn(),
}));

vi.mock('@/services/notification.service', () => ({
  NotificationService: { createNotification: vi.fn().mockResolvedValue({}) },
}));

vi.mock('@/services/ready-now.service', () => ({
  restoreReadyNow: vi.fn().mockResolvedValue(0),
}));

describe('Ready Now request expiration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('expires unanswered requests and refreshes both participants', async () => {
    const deadline = new Date('2027-06-20T08:05:00.000Z');
    (prisma.request.findMany as any).mockResolvedValue([
      { id: 101, senderId: 1, receiverId: 2, responseDeadlineAt: deadline },
    ]);
    (prisma.request.updateMany as any).mockResolvedValue({ count: 1 });

    const count = await expireReadyNowRequests(new Date('2027-06-20T08:05:01.000Z'));

    expect(count).toBe(1);
    expect(prisma.request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instantBooking: true,
          status: RequestStatus.PENDING,
        }),
      }),
    );
    expect(prisma.request.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: RequestStatus.EXPIRED, otp: null },
      }),
    );
    expect(sendGlobalToUser).toHaveBeenCalledTimes(2);
    expect(sendGlobalToUser).toHaveBeenCalledWith(1, {
      event: 'request_expired',
      requestId: 101,
      status: 'expired',
    });
    expect(NotificationService.createNotification).toHaveBeenCalledTimes(2);
  });

  it('automatically cancels an unanswered Quick Pick at its response deadline', async () => {
    const deadline = new Date('2027-06-20T08:05:00.000Z');
    (prisma.request.findMany as any).mockResolvedValue([
      {
        id: 102,
        senderId: 1,
        receiverId: 2,
        responseDeadlineAt: deadline,
        quickPickGroupId: 'group-id',
      },
    ]);
    (prisma.request.updateMany as any).mockResolvedValue({ count: 1 });

    const count = await expireReadyNowRequests(deadline);

    expect(count).toBe(1);
    expect(prisma.request.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: RequestStatus.PENDING }),
        data: {
          status: RequestStatus.CANCELLED,
          cancelledAt: deadline,
          cancellationFeeReason: 'Response time elapsed',
          otp: null,
        },
      }),
    );
    expect(sendGlobalToUser).toHaveBeenCalledWith(1, {
      event: 'request_auto_cancelled',
      requestId: 102,
      status: 'cancelled',
    });
  });
});

describe('confirmed request OTP expiration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calculates midnight after the scheduled date in the request timezone', () => {
    const scheduledAt = new Date('2027-06-20T10:00:00.000Z');

    expect(confirmedOtpExpiresAt(scheduledAt, 330)).toEqual(new Date('2027-06-20T18:30:00.000Z'));
  });

  it('keeps a confirmed request active until the scheduled local date ends', async () => {
    (prisma.request.findMany as any).mockResolvedValue([
      {
        id: 201,
        senderId: 1,
        receiverId: 2,
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        timezoneOffsetMinutes: 330,
      },
    ]);

    const count = await expireConfirmedRequestsPastOtpDeadline(
      new Date('2027-06-20T18:29:59.999Z'),
    );

    expect(count).toBe(0);
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });

  it('expires a confirmed request after the scheduled local date ends', async () => {
    (prisma.request.findMany as any).mockResolvedValue([
      {
        id: 202,
        senderId: 1,
        receiverId: 2,
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        timezoneOffsetMinutes: 330,
      },
    ]);
    (prisma.request.updateMany as any).mockResolvedValue({ count: 1 });

    const count = await expireConfirmedRequestsPastOtpDeadline(
      new Date('2027-06-20T18:30:00.000Z'),
    );

    expect(count).toBe(1);
    expect(prisma.request.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RequestStatus.EXPIRED,
          otp: null,
        }),
      }),
    );
    expect(sendGlobalToUser).toHaveBeenCalledTimes(2);
    expect(restoreReadyNow).toHaveBeenCalledWith([1, 2]);
  });
});
