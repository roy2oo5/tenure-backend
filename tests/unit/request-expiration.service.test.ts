import { RequestStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { expireReadyNowRequests } from '@/services/request-expiration.service';
import { sendGlobalToUser } from '@/services/websocket.service';

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

describe('Ready Now request expiration', () => {
  afterEach(() => vi.clearAllMocks());

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
  });
});
