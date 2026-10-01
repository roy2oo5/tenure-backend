import { prisma } from '@/config/database';
import { ReportService } from '@/services/report.service';

vi.mock('@/config/database', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    request: { findFirst: vi.fn() },
    report: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

describe('ReportService meeting eligibility', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects reports before the users have a started meeting', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 2 });
    (prisma.request.findFirst as any).mockResolvedValue(null);

    await expect(
      ReportService.createReport(1, {
        targetId: 2,
        category: 'Safety concern',
        message: 'Description',
      }),
    ).rejects.toThrow('only after your meeting time has started');
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('allows reports after the meeting start time', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 2 });
    (prisma.request.findFirst as any).mockResolvedValue({ id: 101 });
    (prisma.report.create as any).mockResolvedValue({ id: 1 });

    await ReportService.createReport(1, {
      targetId: 2,
      category: 'Safety concern',
      message: 'Description',
    });

    expect(prisma.request.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { senderId: 1, receiverId: 2 },
          { senderId: 2, receiverId: 1 },
        ],
        fromDateTime: { lte: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(prisma.report.create).toHaveBeenCalledOnce();
  });

  it('allows one report within two hours after a completed support', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    (prisma.user.findUnique as any).mockResolvedValue({ id: 2 });
    (prisma.request.findFirst as any).mockResolvedValue({
      id: 101,
      senderId: 1,
      receiverId: 2,
      session: { endedAt: new Date('2026-08-22T11:00:00.000Z') },
    });
    (prisma.report.findFirst as any).mockResolvedValue(null);
    (prisma.report.create as any).mockResolvedValue({ id: 10 });

    await ReportService.createReport(1, {
      targetId: 2,
      requestId: 101,
      category: 'Completed support',
      message: 'Description',
    });

    expect(prisma.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterId: 1, targetId: 2, requestId: 101 }),
    });
    vi.useRealTimers();
  });

  it('rejects reports after two hours or after a prior report', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T14:00:00.000Z'));
    (prisma.user.findUnique as any).mockResolvedValue({ id: 2 });
    (prisma.request.findFirst as any).mockResolvedValue({
      id: 101,
      senderId: 1,
      receiverId: 2,
      session: { endedAt: new Date('2026-08-22T11:59:59.000Z') },
    });

    await expect(
      ReportService.createReport(1, {
        targetId: 2,
        requestId: 101,
        category: 'Completed support',
        message: 'Description',
      }),
    ).rejects.toThrow('2-hour reporting window has ended');

    (prisma.request.findFirst as any).mockResolvedValue({
      id: 101,
      senderId: 1,
      receiverId: 2,
      session: { endedAt: new Date('2026-08-22T13:00:00.000Z') },
    });
    (prisma.report.findFirst as any).mockResolvedValue({ id: 10 });
    await expect(
      ReportService.createReport(1, {
        targetId: 2,
        requestId: 101,
        category: 'Completed support',
        message: 'Description',
      }),
    ).rejects.toThrow('already reported this completed support');
    vi.useRealTimers();
  });
});
