import { RequestService } from '@/services/request.service';
import { prisma } from '@/config/database';
import { RequestStatus } from '@prisma/client';

vi.mock('@/config/database', () => ({
  prisma: {
    request: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    block: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe('RequestService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('createRequest', () => {
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

    it('should create an instant request with a response deadline', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:00:00.000Z'));

      const responseDeadlineAt = new Date('2027-06-20T08:20:00.000Z');
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
        responseDeadlineAt,
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
  });

  describe('updateRequestStatus', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(
        RequestService.updateRequestStatus(1, 999, 'confirmed'),
      ).rejects.toThrow('Request not found');
    });

    it('should throw an error if sender tries to accept a pending request', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.updateRequestStatus(1, 101, 'confirmed'),
      ).rejects.toThrow('You are not authorized to accept this request');
    });

    it('should throw an error if receiver tries to cancel', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.updateRequestStatus(2, 101, 'cancelled'),
      ).rejects.toThrow('You are not authorized to cancel this request');
    });

    it('should mark request as waiting for sender confirmation when receiver accepts', async () => {
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

      const result = await RequestService.updateRequestStatus(
        2,
        101,
        'confirmed',
      );

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

      const result = await RequestService.updateRequestStatus(
        1,
        101,
        'confirmed',
      );

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
      expect(result.otp).toBeNull();
    });

    it('should charge one hour when sender cancels a confirmed request within 1 hour of start', async () => {
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
        cancellationFee: 80,
        cancellationFeeReason: 'Cancelled within 1 hour of the scheduled start time',
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

      const result = await RequestService.updateRequestStatus(
        1,
        101,
        'cancelled',
      );

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: RequestStatus.CANCELLED,
          otp: null,
          cancelledAt: new Date('2027-06-20T09:30:00.000Z'),
          cancelledById: 1,
          cancellationFee: 80,
          cancellationFeeReason: 'Cancelled within 1 hour of the scheduled start time',
        },
        include: {
          sender: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      });
      expect(result.status).toBe('cancelled');
      expect(result.cancellationFee).toBe(80);
      expect(result.cancelledById).toBe(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(3);
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

      await expect(
        RequestService.updateRequestStatus(1, 101, 'cancelled'),
      ).rejects.toThrow('This meet has already started. End the session instead.');
    });
  });

  describe('getRequestMessages', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(RequestService.getRequestMessages(1, 999)).rejects.toThrow(
        'Request not found',
      );
    });

    it('should throw an error if user is not part of the request', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.getRequestMessages(999, 101),
      ).rejects.toThrow('You are not authorized to view messages for this request');
    });

    it('should successfully retrieve and map chat messages', async () => {
      const mockRequest = {
        id: 101,
        senderId: 1,
        receiverId: 2,
      };

      const mockMessages = [
        {
          id: 401,
          requestId: 101,
          senderId: 1,
          receiverId: 2,
          content: 'Hello mate!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          createdAt: new Date('2026-06-25T10:00:00.000Z'),
        },
        {
          id: 402,
          requestId: 101,
          senderId: 2,
          receiverId: 1,
          content: 'Hi there!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          createdAt: new Date('2026-06-25T10:01:00.000Z'),
        },
      ];

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.message.findMany as any).mockResolvedValue(mockMessages);

      const result = await RequestService.getRequestMessages(1, 101);

      expect(prisma.request.findUnique).toHaveBeenCalledWith({ where: { id: 101 } });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { requestId: 101 },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(401);
      expect(result[0].sender).toBe('me');
      expect(result[0].text).toBe('Hello mate!');
      expect(result[1].id).toBe(402);
      expect(result[1].sender).toBe('them');
      expect(result[1].text).toBe('Hi there!');
    });
  });
});
