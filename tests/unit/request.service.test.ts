import { RequestService } from '@/services/request.service';
import { prisma } from '@/config/database';
import { RequestStatus, SessionStatus } from '@prisma/client';
import { sendGlobalToUser, sendToUserForRequest } from '@/services/websocket.service';

vi.mock('@/config/firebase', () => ({
  sendPushNotification: vi.fn(),
}));

vi.mock('@/services/websocket.service', () => ({
  sendToUserForRequest: vi.fn(),
  sendGlobalToUser: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    request: {
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    block: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: any) => callback(prisma)),
  },
}));

describe('RequestService', () => {
  beforeEach(() => {
    (prisma.$transaction as any).mockImplementation(async (callback: any) => callback(prisma));
    (prisma.block.findFirst as any).mockResolvedValue(null);
    (prisma.block.findMany as any).mockResolvedValue([]);
    (prisma.request.findFirst as any).mockResolvedValue(null);
    (prisma.request.findMany as any).mockResolvedValue([]);
    (prisma.request.count as any).mockResolvedValue(0);
    (prisma.message.deleteMany as any).mockResolvedValue({ count: 0 });
    (prisma.profile.findUnique as any).mockResolvedValue({
      dob: new Date('1995-01-01'),
      isMinor: false,
    });
    (prisma.profile.updateMany as any).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  describe('Quick Pick', () => {
    const input = {
      category: 'Travel Companion',
      meetLocation: 'Selected location',
      latitude: 12.9716,
      longitude: 77.5946,
      hourlyRate: 400,
      durationMinutes: 60,
      responseTime: 5,
      timezoneOffsetMinutes: 330,
    };

    it('reports no eligible supporter separately from a response timeout', async () => {
      (prisma.profile.findMany as any).mockResolvedValue([]);
      await expect(RequestService.createQuickPick(1, input)).rejects.toThrow(
        'No supporter found within 50 km of your selected location.',
      );
      expect(prisma.request.createMany).not.toHaveBeenCalled();
    });

    it('blocks another Quick Pick for self while support is confirmed or running', async () => {
      (prisma.request.findFirst as any).mockResolvedValueOnce({ id: 101 });
      (prisma.profile.findMany as any).mockResolvedValue([]);

      await expect(RequestService.createQuickPick(1, input)).rejects.toThrow(
        'Book for Someone Else while your support is confirmed or running.',
      );
      expect(prisma.request.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [{ senderId: 1 }, { receiverId: 1 }],
          status: RequestStatus.CONFIRMED,
          AND: [
            {
              OR: [
                { session: null },
                { session: { is: { status: { not: SessionStatus.ENDED } } } },
              ],
            },
          ],
        }),
        select: { id: true },
      });
      expect(prisma.request.createMany).not.toHaveBeenCalled();
    });

    it('blocks Quick Pick for self while confirmed as a supporter', async () => {
      (prisma.request.findFirst as any).mockImplementationOnce(({ where }: any) =>
        where.OR?.some((condition: any) => condition.receiverId === 1)
          ? { id: 102 }
          : null,
      );
      (prisma.profile.findMany as any).mockResolvedValue([]);

      await expect(RequestService.createQuickPick(1, input)).rejects.toThrow(
        'Book for Someone Else while your support is confirmed or running.',
      );
      expect(prisma.request.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [{ senderId: 1 }, { receiverId: 1 }],
          status: RequestStatus.CONFIRMED,
        }),
        select: { id: true },
      });
      expect(prisma.request.createMany).not.toHaveBeenCalled();
    });

    it('allows someone else mode during current support but caps confirmed bookings at three', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T20:00:00.000Z'));
      (prisma.request.findFirst as any).mockResolvedValueOnce({ id: 101 });
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Companion'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.request.count as any).mockResolvedValue(3);

      await expect(
        RequestService.createQuickPick(1, {
          ...input,
          bookingFor: 'someone_else',
          beneficiaryName: 'Another person',
        }),
      ).rejects.toThrow('You have already booked for 3 people.');
      expect(prisma.request.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          senderId: 1,
          bookingFor: 'someone_else',
          status: RequestStatus.CONFIRMED,
          fromDateTime: {
            gte: new Date('2027-06-20T18:30:00.000Z'),
            lt: new Date('2027-06-21T18:30:00.000Z'),
          },
        }),
      });
      expect(prisma.request.createMany).not.toHaveBeenCalled();
    });

    it('creates a someone else Quick Pick when two bookings are confirmed', async () => {
      (prisma.request.findFirst as any).mockResolvedValueOnce({ id: 101 });
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Companion'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 202, receiverId: 2 }]);
      (prisma.request.count as any).mockResolvedValue(2);
      (prisma.request.createMany as any).mockResolvedValue({ count: 1 });

      const result = await RequestService.createQuickPick(1, {
        ...input,
        bookingFor: 'someone_else',
        beneficiaryName: '  Third person  ',
        beneficiaryNote: 'Age: 30',
      });

      expect(result.supporterCount).toBe(1);
      expect(prisma.request.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            receiverId: 2,
            bookingFor: 'someone_else',
            beneficiaryName: 'Third person',
            beneficiaryNote: 'Age: 30',
          }),
        ],
      });
    });

    it('dispatches only to Ready Now supporters within 50 km', async () => {
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Companion'] },
        { userId: 3, latitude: 13.9, longitude: 77.595, categories: ['Travel Companion'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 201, receiverId: 2 }]);
      (prisma.request.createMany as any).mockResolvedValue({ count: 1 });

      const result = await RequestService.createQuickPick(1, input);

      expect(result.supporterCount).toBe(1);
      expect(prisma.request.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            receiverId: 2,
            quotedHourlyRate: 400,
            instantBooking: true,
            status: RequestStatus.PENDING,
          }),
        ],
      });
    });

    it('allows the same supporter after their confirmed support session has ended', async () => {
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Companion'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([]) // No scheduled meeting.
        .mockResolvedValueOnce([]) // The ended session is excluded by the query.
        .mockResolvedValueOnce([{ id: 202, receiverId: 2 }]);
      (prisma.request.createMany as any).mockResolvedValue({ count: 1 });

      const result = await RequestService.createQuickPick(1, input);

      expect(prisma.request.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            senderId: 1,
            receiverId: { in: [2] },
            AND: [
              {
                OR: [
                  { session: null },
                  { session: { is: { status: { not: SessionStatus.ENDED } } } },
                ],
              },
            ],
          }),
        }),
      );
      expect(result.supporterCount).toBe(1);
      expect(prisma.request.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ receiverId: 2, status: RequestStatus.PENDING })],
      });
    });

    it('keeps a supporter with an unfinished request ineligible', async () => {
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Companion'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ receiverId: 2 }]);

      await expect(RequestService.createQuickPick(1, input)).rejects.toThrow(
        'No supporter found within 50 km of your selected location.',
      );
      expect(prisma.request.createMany).not.toHaveBeenCalled();
    });

    it('matches legacy and open-to-any categories the same way as Ready Now discovery', async () => {
      (prisma.profile.findMany as any).mockResolvedValue([
        { userId: 2, latitude: 12.972, longitude: 77.595, categories: ['Travel Buddy'] },
        { userId: 3, latitude: 12.972, longitude: 77.595, categories: ['Open to Any'] },
        { userId: 4, latitude: 12.972, longitude: 77.595, categories: ['Shopping Support'] },
      ]);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 201, receiverId: 2 },
          { id: 202, receiverId: 3 },
        ]);
      (prisma.request.createMany as any).mockResolvedValue({ count: 2 });

      const result = await RequestService.createQuickPick(1, {
        ...input,
        category: 'Travel Support',
      });

      expect(result.supporterCount).toBe(2);
      expect(prisma.request.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ receiverId: 2 }),
          expect.objectContaining({ receiverId: 3 }),
        ],
      });
    });

    it('reports a response timeout when eligible supporters did not accept', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T10:06:00.000Z'));
      (prisma.request.findMany as any).mockResolvedValue([
        {
          id: 201,
          status: RequestStatus.EXPIRED,
          responseDeadlineAt: new Date('2027-06-20T10:05:00.000Z'),
        },
      ]);

      const result = await RequestService.getQuickPickStatus(1, 'group-id');

      expect(result.state).toBe('timed_out');
      expect(result.supporter).toBeNull();
    });

    it('reports an automatically cancelled Quick Pick as a response timeout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T10:06:00.000Z'));
      (prisma.request.findMany as any).mockResolvedValue([
        {
          id: 201,
          status: RequestStatus.CANCELLED,
          cancellationFeeReason: 'Response time elapsed',
          createdAt: new Date('2027-06-20T10:00:00.000Z'),
          responseDeadlineAt: new Date('2027-06-20T10:05:00.000Z'),
        },
      ]);

      const result = await RequestService.getQuickPickStatus(1, 'group-id');

      expect(result.state).toBe('timed_out');
      expect(result.responseTimeMinutes).toBe(5);
    });

    it('waits until the response deadline even when every supporter declines early', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T10:04:00.000Z'));
      (prisma.request.findMany as any).mockResolvedValue([
        {
          id: 201,
          status: RequestStatus.DECLINED,
          responseDeadlineAt: new Date('2027-06-20T10:05:00.000Z'),
        },
      ]);

      const result = await RequestService.getQuickPickStatus(1, 'group-id');

      expect(result.state).toBe('waiting');
    });
  });

  describe('createRequest', () => {
    it('should enforce the hourly request limit per receiver', async () => {
      (prisma.request.count as any).mockResolvedValue(5);

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date(),
          toDateTime: new Date(),
        }),
      ).rejects.toThrow('You can send up to 5 requests per hour to this supporter');

      expect(prisma.request.count).toHaveBeenCalledWith({
        where: {
          senderId: 1,
          receiverId: 2,
          createdAt: { gte: expect.any(Date) },
        },
      });
    });

    it('should throw an error if sender tries to send a request to themselves', async () => {
      await expect(
        RequestService.createRequest(1, {
          receiverId: 1,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date(),
          toDateTime: new Date(),
        }),
      ).rejects.toThrow('You cannot send a mate request to yourself');
    });

    it('should throw an error if receiver user does not exist', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date(),
          toDateTime: new Date(),
        }),
      ).rejects.toThrow('The target companion user does not exist');
    });

    it('should successfully create a request and return it in frontend mapped format', async () => {
      const mockReceiver = {
        id: 2,
        name: 'Jane Doe',
        tenureId: 'TN123',
        profile: {
          fullName: 'Jane Doe Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };

      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.create as any).mockResolvedValue(mockRequest);

      const result = await RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: 'Let us study together',
      });

      expect(prisma.request.create).toHaveBeenCalled();
      expect(result.id).toBe(101);
      expect(result.direction).toBe('sent');
      expect(result.mateUserId).toBe(2);
      expect(result.mateName).toBe('Jane Doe Profile');
      expect(result.mateTenureId).toBe('TN123');
      expect(result.mateAvatar).toBe('https://example.com/avatar.jpg');
      expect(result.status).toBe('pending');
    });

    it('should reject duplicate active requests to the same receiver', async () => {
      const mockReceiver = {
        id: 2,
        name: 'Jane Doe',
        tenureId: 'TN123',
        profile: {
          fullName: 'Jane Doe Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.findFirst as any)
        .mockResolvedValueOnce({ id: 101 });

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        }),
      ).rejects.toThrow('You have already sent a request to this user');

      expect(prisma.request.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: 1, receiverId: 2 }),
          select: { id: true },
        }),
      );
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('blocks an instant request for self during confirmed support in either role', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 2, profile: {} });
      (prisma.request.findFirst as any).mockResolvedValueOnce({ id: 101 });

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
          instantBooking: true,
        }),
      ).rejects.toThrow('Book for Someone Else while your support is confirmed or running.');
      expect(prisma.request.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ senderId: 1 }, { receiverId: 1 }],
          status: RequestStatus.CONFIRMED,
          AND: [
            {
              OR: [
                { session: null },
                { session: { is: { status: { not: SessionStatus.ENDED } } } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('requires Book for Someone Else only on the date of confirmed scheduled support', async () => {
      const fifth = new Date('2027-07-05T10:00:00.000Z');
      const sixth = new Date('2027-07-06T10:00:00.000Z');
      const confirmed = { id: 100, fromDateTime: fifth, toDateTime: null, receiverId: 3 };
      (prisma.user.findUnique as any).mockResolvedValue({ id: 2, profile: {} });
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([confirmed])
        .mockResolvedValueOnce([]);

      await expect(RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: fifth,
        toDateTime: new Date('2027-07-05T11:00:00.000Z'),
      })).rejects.toThrow('This date is fully booked by a confirmed scheduled meet');

      vi.clearAllMocks();
      (prisma.user.findUnique as any).mockResolvedValue({ id: 2, profile: {} });
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([confirmed])
        .mockResolvedValueOnce([]);
      (prisma.request.create as any).mockResolvedValue({
        id: 102,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: sixth,
        toDateTime: new Date('2027-07-06T11:00:00.000Z'),
        status: RequestStatus.PENDING,
        createdAt: new Date(),
      });

      await expect(RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: sixth,
        toDateTime: new Date('2027-07-06T11:00:00.000Z'),
      })).resolves.toMatchObject({ id: 102 });
      expect(prisma.request.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            senderId: 1,
            receiverId: 2,
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    status: RequestStatus.CONFIRMED,
                    fromDateTime: {
                      gte: new Date('2027-07-06T00:00:00.000Z'),
                      lt: new Date('2027-07-07T00:00:00.000Z'),
                    },
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('allows a normal scheduled request today when confirmed support is on the fifth', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-07-01T08:00:00.000Z'));
      const today = new Date('2027-07-01T10:00:00.000Z');
      const fifth = new Date('2027-07-05T10:00:00.000Z');
      (prisma.user.findUnique as any).mockResolvedValue({ id: 2, profile: {} });
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 100, fromDateTime: fifth, toDateTime: null, receiverId: 3 }])
        .mockResolvedValueOnce([]);
      (prisma.request.create as any).mockResolvedValue({
        id: 103,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: today,
        toDateTime: new Date('2027-07-01T11:00:00.000Z'),
        status: RequestStatus.PENDING,
        createdAt: new Date(),
      });

      await expect(RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: today,
        toDateTime: new Date('2027-07-01T11:00:00.000Z'),
      })).resolves.toMatchObject({ id: 103 });
    });

    it('rejects a fourth someone else request on the selected date', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 2, profile: {} });
      (prisma.request.count as any)
        .mockResolvedValueOnce(0) // Hourly request limit.
        .mockResolvedValueOnce(3); // Confirmed someone else bookings.

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2027-06-20T20:00:00.000Z'),
          toDateTime: new Date('2027-06-20T21:00:00.000Z'),
          timezoneOffsetMinutes: 330,
          bookingFor: 'someone_else',
          beneficiaryName: 'Fourth person',
        }),
      ).rejects.toThrow('You have already booked for 3 people.');

      expect(prisma.request.count).toHaveBeenNthCalledWith(2, {
        where: {
          senderId: 1,
          bookingFor: 'someone_else',
          status: RequestStatus.CONFIRMED,
          fromDateTime: {
            gte: new Date('2027-06-20T18:30:00.000Z'),
            lt: new Date('2027-06-21T18:30:00.000Z'),
          },
        },
      });
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('allows booking someone else alongside the sender’s confirmed scheduled meet', async () => {
      const fromDateTime = new Date('2027-06-20T10:00:00.000Z');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 2,
        name: 'Supporter',
        tenureId: 'TN123',
        profile: { fullName: 'Supporter' },
      });
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([
          { id: 100, fromDateTime, toDateTime: null, receiverId: 3 },
        ])
        .mockResolvedValueOnce([]);
      (prisma.request.create as any).mockResolvedValue({
        id: 102,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime,
        toDateTime: new Date('2027-06-20T11:00:00.000Z'),
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-19T10:00:00.000Z'),
        updatedAt: new Date('2027-06-19T10:00:00.000Z'),
      });

      await expect(RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime,
        toDateTime: new Date('2027-06-20T11:00:00.000Z'),
        bookingFor: 'someone_else',
        beneficiaryName: 'Another person',
      })).resolves.toMatchObject({ id: 102 });
      expect(prisma.request.create).toHaveBeenCalled();
    });

    it('should allow requests to different receivers while another request is active', async () => {
      const receiver = {
        id: 3,
        name: 'Another Supporter',
        tenureId: 'TN456',
        profile: {
          fullName: 'Another Supporter',
          profilePhoto: null,
        },
      };
      const createdRequest = {
        id: 102,
        senderId: 1,
        receiverId: 3,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: '',
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(receiver);
      (prisma.request.findFirst as any).mockResolvedValue(null);
      (prisma.request.create as any).mockResolvedValue(createdRequest);

      await expect(
        RequestService.createRequest(1, {
          receiverId: 3,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        }),
      ).resolves.toMatchObject({ id: 102, mateUserId: 3 });

      expect(prisma.request.count).toHaveBeenCalledWith({
        where: {
          senderId: 1,
          receiverId: 3,
          createdAt: { gte: expect.any(Date) },
        },
      });
      expect(prisma.request.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: 1, receiverId: 3 }),
        }),
      );
    });

    it('should check duplicates without blocking ended sessions', async () => {
      const mockReceiver = {
        id: 2,
        name: 'Jane Doe',
        tenureId: 'TN123',
        profile: {
          fullName: 'Jane Doe Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };

      const mockRequest = {
        id: 103,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: '',
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.findFirst as any).mockResolvedValue(null);
      (prisma.request.create as any).mockResolvedValue(mockRequest);

      await RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
      });

      expect(prisma.request.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: 1, receiverId: 2 }),
          select: { id: true },
        }),
      );
      expect(prisma.request.create).toHaveBeenCalled();
    });

    it('should create an instant request with a response deadline', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:00:00.000Z'));

      const responseDeadlineAt = new Date('2027-06-20T08:20:00.000Z');
      const clientDeadlineAt = new Date('2027-06-20T08:25:00.000Z');
      const mockReceiver = {
        id: 2,
        name: 'Ready User',
        tenureId: 'IN123',
        profile: {
          fullName: 'Ready User Profile',
          profilePhoto: '',
          gallery: [],
          instantAvailable: true,
        },
      };
      const mockRequest = {
        id: 102,
        senderId: 1,
        receiverId: 2,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Current GPS',
        fromDateTime: new Date('2027-06-20T08:00:00.000Z'),
        toDateTime: null,
        instantBooking: true,
        responseDeadlineAt,
        message: 'Instant request',
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.create as any).mockResolvedValue(mockRequest);

      const result = await RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Current GPS',
        fromDateTime: new Date('2027-06-20T08:00:00.000Z'),
        instantBooking: true,
        responseTime: 20,
        responseDeadlineAt: clientDeadlineAt,
        message: 'Instant request',
      });

      expect(prisma.request.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          instantBooking: true,
          responseDeadlineAt,
          toDateTime: undefined,
        }),
      });
      expect(result.instantBooking).toBe(true);
      expect(result.responseDeadlineAt).toBe(responseDeadlineAt.toISOString());
    });

    it('should not apply a response timer to scheduled requests', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:00:00.000Z'));

      const mockReceiver = {
        id: 2,
        name: 'Scheduled User',
        tenureId: 'IN123',
        profile: {
          fullName: 'Scheduled User Profile',
          profilePhoto: '',
          gallery: [],
          categories: ['Hospital support'],
          categoryRates: { 'Hospital support': 250 },
          availableDays: [],
          availableTimeRange: null,
        },
      };
      const mockRequest = {
        id: 103,
        senderId: 1,
        receiverId: 2,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Clinic',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T11:00:00.000Z'),
        instantBooking: false,
        responseDeadlineAt: null,
        message: 'Scheduled request',
        status: RequestStatus.PENDING,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.create as any).mockResolvedValue(mockRequest);

      const result = await RequestService.createRequest(1, {
        receiverId: 2,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Clinic',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T11:00:00.000Z'),
        instantBooking: false,
        responseTime: 10,
        message: 'Scheduled request',
      });

      expect(prisma.request.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          instantBooking: false,
          responseDeadlineAt: null,
        }),
      });
      expect(result.instantBooking).toBe(false);
      expect(result.responseDeadlineAt).toBeNull();
    });

    it('should reject scheduled requests less than 15 minutes from now', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:30:30.000Z'));

      const mockReceiver = {
        id: 2,
        name: 'Scheduled User',
        tenureId: 'IN123',
        profile: {
          fullName: 'Scheduled User Profile',
          profilePhoto: '',
          gallery: [],
          categories: ['Hospital support'],
          availableDays: [],
          availableTimeRange: null,
        },
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'hospital',
          categoryLabel: 'Hospital support',
          meetLocation: 'Clinic',
          fromDateTime: new Date('2027-06-20T08:44:00.000Z'),
          instantBooking: false,
          message: 'Too soon',
        }),
      ).rejects.toThrow('Scheduled requests must start at least 15 minutes from now');

      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('should reject a request on a weekday outside the receiver availability', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T00:00:00.000Z'));
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 2,
        profile: {
          fullName: 'Available User',
          availableDays: ['MON', 'THU', 'FRI'],
          availableTimeRange: '10:00 AM - 5:00 PM',
        },
      });

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'hospital',
          categoryLabel: 'Hospital support',
          meetLocation: 'Clinic',
          // Sunday 3:00 PM to 5:00 PM in India.
          fromDateTime: new Date('2027-06-27T09:30:00.000Z'),
          toDateTime: new Date('2027-06-27T11:30:00.000Z'),
          timezoneOffsetMinutes: 330,
        }),
      ).rejects.toThrow('Please choose a meeting time within this companion availability');
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('should reject a request outside the receiver hours in the selected timezone', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T00:00:00.000Z'));
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 2,
        profile: {
          fullName: 'Available User',
          availableDays: ['MON', 'THU', 'FRI'],
          availableTimeRange: '10:00 AM - 5:00 PM',
        },
      });

      await expect(
        RequestService.createRequest(1, {
          receiverId: 2,
          categoryId: 'hospital',
          categoryLabel: 'Hospital support',
          meetLocation: 'Clinic',
          // Thursday 6:00 PM to 7:00 PM in India.
          fromDateTime: new Date('2027-06-24T12:30:00.000Z'),
          toDateTime: new Date('2027-06-24T13:30:00.000Z'),
          timezoneOffsetMinutes: 330,
        }),
      ).rejects.toThrow('Please choose a meeting time within this companion availability');
      expect(prisma.request.create).not.toHaveBeenCalled();
    });
  });

  describe('listUserRequests', () => {
    it('should query and return sent and received requests separated', async () => {
      const mockSent = [
        {
          id: 103,
          senderId: 3,
          receiverId: 4,
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
          message: 'Study!',
          status: RequestStatus.PENDING,
          createdAt: new Date('2027-06-20T08:00:00.000Z'),
          receiver: {
            id: 4,
            name: 'Jane Doe',
            tenureId: 'TN123',
            profile: {
              fullName: 'Jane Doe Profile',
              profilePhoto: 'https://example.com/avatar.jpg',
            },
          },
        },
      ];

      const mockReceived = [
        {
          id: 104,
          senderId: 5,
          receiverId: 3,
          categoryId: 'food',
          categoryLabel: 'Food Buddy',
          meetLocation: 'Cafe',
          fromDateTime: new Date('2027-06-20T14:00:00.000Z'),
          toDateTime: new Date('2027-06-20T15:00:00.000Z'),
          message: 'Eat!',
          status: RequestStatus.CONFIRMED,
          createdAt: new Date('2027-06-20T09:00:00.000Z'),
          sender: {
            id: 5,
            name: 'John Smith',
            tenureId: 'TN456',
            profile: {
              fullName: 'John Smith Profile',
              profilePhoto: 'https://example.com/john.jpg',
            },
          },
        },
      ];

      (prisma.request.findMany as any)
        .mockResolvedValueOnce(mockSent)
        .mockResolvedValueOnce(mockReceived);

      const result = await RequestService.listUserRequests(3);

      expect(prisma.request.findMany).toHaveBeenCalledTimes(2);
      expect(result.sent.length).toBe(1);
      expect(result.sent[0].id).toBe(103);
      expect(result.sent[0].direction).toBe('sent');
      expect(result.sent[0].mateName).toBe('Jane Doe Profile');

      expect(result.received.length).toBe(1);
      expect(result.received[0].id).toBe(104);
      expect(result.received[0].direction).toBe('received');
      expect(result.received[0].mateName).toBe('John Smith Profile');
      expect(result.received[0].status).toBe('confirmed');
    });

    it('should persist stale requests as expired and return them in history state', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-21T10:00:00.000Z'));

      const receiver = {
        id: 4,
        name: 'Jane Doe',
        tenureId: 'TN123',
        profile: {
          fullName: 'Jane Doe Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };
      const baseRequest = {
        senderId: 3,
        receiverId: 4,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        message: '',
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        updatedAt: new Date('2027-06-20T08:00:00.000Z'),
        receiver,
        session: null,
      };
      const mockSent = [
        {
          ...baseRequest,
          id: 201,
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
          instantBooking: false,
          status: RequestStatus.PENDING,
        },
        {
          ...baseRequest,
          id: 202,
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          toDateTime: new Date('2027-06-20T12:00:00.000Z'),
          instantBooking: false,
          status: RequestStatus.ACCEPTED_BY_RECEIVER,
        },
        {
          ...baseRequest,
          id: 203,
          fromDateTime: new Date('2027-06-20T09:00:00.000Z'),
          toDateTime: new Date('2027-06-20T10:00:00.000Z'),
          instantBooking: false,
          status: RequestStatus.CONFIRMED,
          otp: '1234',
        },
      ];

      (prisma.request.findMany as any).mockResolvedValueOnce(mockSent).mockResolvedValueOnce([]);

      const result = await RequestService.listUserRequests(3);

      expect(prisma.request.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [201, 202] } },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
        },
      });
      expect(prisma.request.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: [203] },
          status: RequestStatus.CONFIRMED,
          session: null,
        },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
          cancellationFeeReason: 'OTP was not entered on the scheduled support date.',
        },
      });
      expect(result.sent.map((request) => request.status)).toEqual([
        'expired',
        'expired',
        'expired',
      ]);
    });

    it('should keep ready now pending requests visible until the response deadline', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:05:00.000Z'));

      const receiver = {
        id: 4,
        name: 'Ready User',
        tenureId: 'TN123',
        profile: {
          fullName: 'Ready User Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };
      const readyNowRequest = {
        id: 204,
        senderId: 3,
        receiverId: 4,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Current GPS',
        message: '',
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        fromDateTime: new Date('2027-06-20T08:00:00.000Z'),
        toDateTime: null,
        instantBooking: true,
        responseDeadlineAt: new Date('2027-06-20T08:10:00.000Z'),
        status: RequestStatus.PENDING,
        receiver,
        session: null,
      };

      (prisma.request.findMany as any)
        .mockResolvedValueOnce([readyNowRequest])
        .mockResolvedValueOnce([]);

      const result = await RequestService.listUserRequests(3);

      expect(prisma.request.updateMany).not.toHaveBeenCalled();
      expect(result.sent[0].status).toBe('pending');
      expect(result.sent[0].instantBooking).toBe(true);
    });

    it('should expire ready now pending requests after the response deadline', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:11:00.000Z'));

      const receiver = {
        id: 4,
        name: 'Ready User',
        tenureId: 'TN123',
        profile: {
          fullName: 'Ready User Profile',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };
      const readyNowRequest = {
        id: 205,
        senderId: 3,
        receiverId: 4,
        categoryId: 'hospital',
        categoryLabel: 'Hospital support',
        meetLocation: 'Current GPS',
        message: '',
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        fromDateTime: new Date('2027-06-20T08:00:00.000Z'),
        toDateTime: null,
        instantBooking: true,
        responseDeadlineAt: new Date('2027-06-20T08:10:00.000Z'),
        status: RequestStatus.PENDING,
        receiver,
        session: null,
      };

      (prisma.request.findMany as any)
        .mockResolvedValueOnce([readyNowRequest])
        .mockResolvedValueOnce([]);

      const result = await RequestService.listUserRequests(3);

      expect(prisma.request.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [205] } },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
        },
      });
      expect(result.sent[0].status).toBe('expired');
    });
  });

  describe('updateRequestStatus', () => {
    it('blocks confirming a self booking after another support became active', async () => {
      (prisma.request.findUnique as any)
        .mockResolvedValueOnce({
          id: 101,
          senderId: 1,
          receiverId: 2,
          status: RequestStatus.ACCEPTED_BY_RECEIVER,
          bookingFor: 'self',
          instantBooking: true,
          quotedHourlyRate: 275,
          fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
          timezoneOffsetMinutes: 330,
        })
        .mockResolvedValueOnce({ status: RequestStatus.ACCEPTED_BY_RECEIVER });
      (prisma.request.findFirst as any).mockResolvedValueOnce({ id: 102 });

      await expect(RequestService.updateRequestStatus(1, 101, 'confirmed')).rejects.toThrow(
        'Book for Someone Else while your support is confirmed or running.',
      );
      expect(prisma.request.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: 101 },
          OR: [{ senderId: 1 }, { receiverId: 1 }],
          status: RequestStatus.CONFIRMED,
          AND: [
            {
              OR: [
                { session: null },
                { session: { is: { status: { not: SessionStatus.ENDED } } } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      expect(prisma.request.update).not.toHaveBeenCalled();
    });

    it('rejects final confirmation of a fourth someone else booking', async () => {
      const request = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        bookingFor: 'someone_else',
        quotedHourlyRate: 275,
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        timezoneOffsetMinutes: 330,
      };
      (prisma.request.findUnique as any)
        .mockResolvedValueOnce(request)
        .mockResolvedValueOnce({ status: RequestStatus.ACCEPTED_BY_RECEIVER });
      (prisma.request.count as any).mockResolvedValue(3);

      await expect(RequestService.updateRequestStatus(1, 101, 'confirmed')).rejects.toThrow(
        'You have already booked for 3 people.',
      );
      expect(prisma.request.count).toHaveBeenCalledWith({
        where: {
          senderId: 1,
          bookingFor: 'someone_else',
          status: RequestStatus.CONFIRMED,
          fromDateTime: {
            gte: new Date('2027-06-19T18:30:00.000Z'),
            lt: new Date('2027-06-20T18:30:00.000Z'),
          },
        },
      });
      expect(prisma.request.update).not.toHaveBeenCalled();
    });

    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(RequestService.updateRequestStatus(1, 999, 'confirmed')).rejects.toThrow(
        'Request not found',
      );
    });

    it('should throw an error if sender tries to accept a pending request', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(RequestService.updateRequestStatus(1, 101, 'confirmed')).rejects.toThrow(
        'You are not authorized to accept this request',
      );
    });

    it('should throw an error if an unrelated user tries to cancel', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(RequestService.updateRequestStatus(999, 101, 'cancelled')).rejects.toThrow(
        'You are not authorized to cancel this request',
      );
    });

    it('should require sender confirmation even when receiver accepts a fixed rate', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        status: RequestStatus.PENDING,
        quotedHourlyRate: 275,
      };

      const mockUpdated = {
        ...mockRequest,
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        otp: null,
        createdAt: new Date(),
        sender: {
          id: 1,
          name: 'Sender name',
          tenureId: 'TN111',
          profile: {
            fullName: 'Sender Profile',
            profilePhoto: '',
          },
        },
        receiver: {
          id: 2,
          name: 'Receiver name',
          tenureId: 'TN222',
          profile: {
            fullName: 'Receiver Profile',
            profilePhoto: '',
          },
        },
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.request.update as any).mockResolvedValue(mockUpdated);

      const result = await RequestService.updateRequestStatus(2, 101, 'confirmed');

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.ACCEPTED_BY_RECEIVER,
          otp: null,
        },
        include: {
          sender: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      });
      expect(result.status).toBe('awaiting_sender_confirmation');
      expect(result.direction).toBe('received');
      expect(result.mateUserId).toBe(1);
      expect(result.mateName).toBe('Sender Profile');
    });

    it('should generate otp when sender gives final confirmation', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        quotedHourlyRate: 275,
        senderCurrentLatitude: 12.9716,
        senderCurrentLongitude: 77.5946,
        senderLocationUpdatedAt: new Date('2027-06-20T09:59:30.000Z'),
        receiverCurrentLatitude: 12.9716,
        receiverCurrentLongitude: 77.5946,
        receiverLocationUpdatedAt: new Date('2027-06-20T09:59:30.000Z'),
      };

      const mockUpdated = {
        ...mockRequest,
        status: RequestStatus.CONFIRMED,
        otp: '1234',
        createdAt: new Date(),
        sender: {
          id: 1,
          name: 'Sender name',
          tenureId: 'TN111',
          profile: {
            fullName: 'Sender Profile',
            profilePhoto: '',
          },
        },
        receiver: {
          id: 2,
          name: 'Receiver name',
          tenureId: 'TN222',
          profile: {
            fullName: 'Receiver Profile',
            profilePhoto: '',
          },
        },
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.request.update as any).mockResolvedValue(mockUpdated);

      const result = await RequestService.updateRequestStatus(1, 101, 'confirmed');

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.CONFIRMED,
          otp: expect.any(String),
        },
        include: {
          sender: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      });
      expect(result.status).toBe('confirmed');
      expect(result.direction).toBe('sent');
      expect(result.otp).toBe('1234');
    });

    it('should auto-cancel a reciprocal request for the same meeting date', async () => {
      const meetingDate = new Date('2027-06-20T10:00:00.000Z');
      const request = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: meetingDate,
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        timezoneOffsetMinutes: 330,
        message: '',
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        quotedHourlyRate: 275,
      };
      const confirmed = {
        ...request,
        status: RequestStatus.CONFIRMED,
        otp: null,
        createdAt: new Date(),
        sender: {
          id: 1,
          name: 'Person A',
          tenureId: 'TN111',
          profile: { fullName: 'Person A', profilePhoto: '' },
        },
        receiver: {
          id: 2,
          name: 'Person B',
          tenureId: 'TN222',
          profile: { fullName: 'Person B', profilePhoto: '' },
        },
      };

      (prisma.request.findUnique as any)
        .mockResolvedValueOnce(request)
        .mockResolvedValueOnce({ status: RequestStatus.ACCEPTED_BY_RECEIVER });
      (prisma.request.update as any).mockResolvedValue(confirmed);

      await RequestService.updateRequestStatus(1, 101, 'confirmed');

      const firstAutoCancellation = (prisma.request.updateMany as any).mock.calls[0][0];
      expect(firstAutoCancellation.where).toMatchObject({
        id: { not: 101 },
        status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
        OR: [{ senderId: 1 }, { senderId: 2, receiverId: 1 }],
      });
      expect(firstAutoCancellation.where.fromDateTime).toEqual({
        gte: new Date('2027-06-19T18:30:00.000Z'),
        lt: new Date('2027-06-20T18:30:00.000Z'),
      });
      expect(firstAutoCancellation.data).toMatchObject({
        status: RequestStatus.CANCELLED,
        otp: null,
        cancellationFeeReason: 'Auto Cancelled',
      });
    });

    it('cancels normal requests on Quick Pick confirmation and updates both participants', async () => {
      const request = {
        id: 101,
        senderId: 1,
        receiverId: 3,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-07-01T10:00:00.000Z'),
        toDateTime: new Date('2027-07-01T11:00:00.000Z'),
        timezoneOffsetMinutes: 0,
        instantBooking: true,
        quickPickGroupId: 'group-id',
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        quotedHourlyRate: 275,
      };
      const confirmed = {
        ...request,
        status: RequestStatus.CONFIRMED,
        otp: null,
        createdAt: new Date(),
        sender: {
          id: 1,
          name: 'Person A',
          tenureId: 'TN111',
          profile: { fullName: 'Person A', profilePhoto: '' },
        },
        receiver: {
          id: 3,
          name: 'Person C',
          tenureId: 'TN333',
          profile: { fullName: 'Person C', profilePhoto: '' },
        },
      };
      (prisma.request.findUnique as any)
        .mockResolvedValueOnce(request)
        .mockResolvedValueOnce({ status: RequestStatus.ACCEPTED_BY_RECEIVER });
      (prisma.request.update as any).mockResolvedValue(confirmed);
      (prisma.request.findMany as any).mockResolvedValueOnce([{ id: 202, receiverId: 2 }]);

      await RequestService.updateRequestStatus(1, 101, 'confirmed');

      expect(prisma.request.updateMany).toHaveBeenCalledWith({
        where: {
          senderId: 1,
          id: { not: 101 },
          quickPickGroupId: null,
          status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
        },
        data: expect.objectContaining({
          status: RequestStatus.CANCELLED,
          cancelledAt: expect.any(Date),
          cancellationFeeReason: 'Auto Cancelled',
        }),
      });
      expect(sendGlobalToUser).toHaveBeenCalledWith(1, { event: 'request_updated' });
      expect(sendGlobalToUser).toHaveBeenCalledWith(2, { event: 'request_updated' });
      expect(sendToUserForRequest).toHaveBeenCalledWith(1, 202, {
        event: 'request_cancelled',
        requestId: 202,
      });
      expect(sendToUserForRequest).toHaveBeenCalledWith(2, 202, {
        event: 'request_cancelled',
        requestId: 202,
      });
    });

    it('cancels the normal request as soon as the Quick Pick supporter accepts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-07-01T10:00:00.000Z'));
      const request = {
        id: 101,
        senderId: 1,
        receiverId: 3,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-07-01T10:00:00.000Z'),
        toDateTime: new Date('2027-07-01T11:00:00.000Z'),
        instantBooking: true,
        quickPickGroupId: 'group-id',
        responseDeadlineAt: new Date('2027-07-01T10:05:00.000Z'),
        status: RequestStatus.PENDING,
        quotedHourlyRate: 275,
      };
      const accepted = {
        ...request,
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
        createdAt: new Date(),
        sender: { id: 1, name: 'Person A', profile: {} },
        receiver: { id: 3, name: 'Person C', profile: {} },
      };
      (prisma.request.findUnique as any)
        .mockResolvedValueOnce(request)
        .mockResolvedValueOnce({
          status: RequestStatus.PENDING,
          responseDeadlineAt: request.responseDeadlineAt,
        });
      (prisma.request.update as any).mockResolvedValue(accepted);
      (prisma.request.findMany as any)
        .mockResolvedValueOnce([{ id: 202, receiverId: 2 }])
        .mockResolvedValueOnce([]);

      await RequestService.updateRequestStatus(3, 101, 'confirmed');

      expect(prisma.request.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            senderId: 1,
            quickPickGroupId: null,
            status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
          }),
          data: expect.objectContaining({ status: RequestStatus.CANCELLED }),
        }),
      );
      expect(sendGlobalToUser).toHaveBeenCalledWith(1, { event: 'request_updated' });
      expect(sendGlobalToUser).toHaveBeenCalledWith(2, { event: 'request_updated' });
      expect(sendToUserForRequest).toHaveBeenCalledWith(2, 202, {
        event: 'request_cancelled',
        requestId: 202,
      });
    });

    it('should not charge a fee when sender cancels within 1 hour of start', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T09:30:00.000Z'));

      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        bookingFor: 'self',
        beneficiaryName: null,
        beneficiaryPhone: null,
        beneficiaryRelation: null,
        beneficiaryNote: null,
        status: RequestStatus.CONFIRMED,
        quotedHourlyRate: 80,
        session: null,
        receiver: {
          id: 2,
          name: 'Receiver name',
          tenureId: 'TN222',
          profile: {
            fullName: 'Receiver Profile',
            profilePhoto: '',
            gallery: [],
            hourlyRate: 80,
            categoryRates: null,
          },
        },
      };

      const mockUpdated = {
        ...mockRequest,
        status: RequestStatus.CANCELLED,
        cancellationFee: 0,
        cancellationFeeReason: null,
        cancelledAt: new Date('2027-06-20T09:30:00.000Z'),
        cancelledById: 1,
        createdAt: new Date('2027-06-20T08:00:00.000Z'),
        sender: {
          id: 1,
          name: 'Sender name',
          tenureId: 'TN111',
          profile: {
            fullName: 'Sender Profile',
            profilePhoto: '',
            gender: 'man',
          },
        },
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.request.update as any).mockResolvedValue(mockUpdated);

      const result = await RequestService.updateRequestStatus(1, 101, 'cancelled', 'Plans changed');

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.CANCELLED,
          otp: null,
          cancelledAt: new Date('2027-06-20T09:30:00.000Z'),
          cancelledById: 1,
          cancellationFee: 0,
          cancellationFeeReason: 'Plans changed',
        },
        include: {
          sender: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      });
      expect(result.status).toBe('cancelled');
      expect(result.cancellationFee).toBe(0);
      expect(result.cancelledById).toBe(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should block request cancellation after the session has started', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.CONFIRMED,
        fromDateTime: new Date('2027-06-20T10:00:00.000Z'),
        toDateTime: new Date('2027-06-20T12:00:00.000Z'),
        session: { id: 301 },
        receiver: { profile: { hourlyRate: 80, categoryRates: null } },
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(RequestService.updateRequestStatus(1, 101, 'cancelled')).rejects.toThrow(
        'This meet has already started. End the session instead.',
      );
    });
  });

  describe('getRequestMessages', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(RequestService.getRequestMessages(1, 999)).rejects.toThrow('Request not found');
    });

    it('should throw an error if user is not part of the request', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.CONFIRMED,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(RequestService.getRequestMessages(999, 101)).rejects.toThrow(
        'You are not authorized to view messages for this request',
      );
    });

    it('should successfully retrieve and map chat messages', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.CONFIRMED,
      };

      const mockMessages = [
        {
          id: 401,
          clientMessageId: '11111111-1111-4111-8111-111111111111',
          isDeleted: false,
          requestId: 101,
          senderId: 1,
          receiverId: 2,
          content: 'Hello mate!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          viewOnce: false,
          expiresAt: new Date('2026-07-25T10:00:00.000Z'),
          createdAt: new Date('2026-06-25T10:00:00.000Z'),
        },
        {
          id: 402,
          clientMessageId: '22222222-2222-4222-8222-222222222222',
          isDeleted: false,
          requestId: 101,
          senderId: 2,
          receiverId: 1,
          content: 'Hi there!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          viewOnce: false,
          expiresAt: new Date('2026-07-25T10:01:00.000Z'),
          createdAt: new Date('2026-06-25T10:01:00.000Z'),
        },
      ];

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      // Prisma returns the newest records first for bounded pagination.
      (prisma.message.findMany as any).mockResolvedValue([...mockMessages].reverse());

      const result = await RequestService.getRequestMessages(1, 101);

      expect(prisma.request.findUnique).toHaveBeenCalledWith({ where: { id: 101 } });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          requestId: 101,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      expect(prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lte: expect.any(Date) } },
      });
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('11111111-1111-4111-8111-111111111111');
      expect(result[0].sender).toBe('me');
      expect(result[0].text).toBe('Hello mate!');
      expect(result[1].id).toBe('22222222-2222-4222-8222-222222222222');
      expect(result[1].sender).toBe('them');
      expect(result[1].text).toBe('Hi there!');
    });

    it('should keep chat history locked until final confirmation', async () => {
      (prisma.request.findUnique as any).mockResolvedValue({
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.ACCEPTED_BY_RECEIVER,
      });

      await expect(RequestService.getRequestMessages(1, 101)).rejects.toThrow(
        'Chat is available after both users confirm the request',
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});
