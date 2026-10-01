import { prisma } from '@/config/database';
import { restoreReadyNow, suspendReadyNow } from '@/services/ready-now.service';
import { sendGlobalToAll } from '@/services/websocket.service';

vi.mock('@/config/database', () => ({
  prisma: { profile: { updateMany: vi.fn() } },
}));

vi.mock('@/services/websocket.service', () => ({ sendGlobalToAll: vi.fn() }));

describe('Ready Now meeting lifecycle', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('temporarily suspends only users who still have Ready Now enabled', async () => {
    (prisma.profile.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await suspendReadyNow([1, 2]);

    expect(prisma.profile.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 1,
        readyNowEnabled: true,
        instantAvailable: true,
      },
      data: { instantAvailable: false },
    });
  });

  it('restores availability only if the user did not manually turn Ready Now off', async () => {
    (prisma.profile.updateMany as any).mockResolvedValue({ count: 1 });

    await restoreReadyNow([1, 2]);

    expect(prisma.profile.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 1,
        readyNowEnabled: true,
        instantAvailable: false,
        instantAvailableUntil: { gt: expect.any(Date) },
      },
      data: { instantAvailable: true },
    });
    expect(sendGlobalToAll).toHaveBeenCalledTimes(2);
  });
});
