import { prisma } from '@/config/database';
import {
  deleteExpiredMessages,
  messageRetentionCutoff,
} from '@/services/message-retention.service';

vi.mock('@/config/database', () => ({
  prisma: { message: { deleteMany: vi.fn() } },
}));

describe('message retention', () => {
  it('deletes messages older than 30 days', async () => {
    const now = new Date('2026-08-08T12:00:00.000Z');
    (prisma.message.deleteMany as any).mockResolvedValue({ count: 3 });

    const count = await deleteExpiredMessages(now);

    expect(messageRetentionCutoff(now)).toEqual(new Date('2026-07-09T12:00:00.000Z'));
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-07-09T12:00:00.000Z') },
      },
    });
    expect(count).toBe(3);
  });
});
