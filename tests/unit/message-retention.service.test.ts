import { prisma } from '@/config/database';
import { deleteExpiredMessages } from '@/services/message-retention.service';

vi.mock('@/config/database', () => ({
  prisma: {
    message: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('message retention', () => {
  it('deletes each message when its stored calendar-month expiry is reached', async () => {
    const now = new Date('2026-09-11T09:49:00.000Z');
    (prisma.message.findMany as any).mockResolvedValue([]);
    (prisma.message.deleteMany as any).mockResolvedValue({ count: 3 });

    const count = await deleteExpiredMessages(now);

    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
    expect(count).toBe(3);
  });
});
