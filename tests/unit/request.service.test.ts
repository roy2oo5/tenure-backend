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
    },
    user: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
  },
}));

describe('RequestService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createRequest', () => {
    it('should throw an error if sender tries to send a request to themselves', async () => {
      await expect(
        RequestService.createRequest('user-id-1', {
          receiverId: 'user-id-1',
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date(),
          toDateTime: new Date(),
        })
      ).rejects.toThrow('You cannot send a mate request to yourself');
    });

    it('should throw an error if receiver user does not exist', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        RequestService.createRequest('user-id-1', {
          receiverId: 'user-id-2',
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date(),
          toDateTime: new Date(),
        })
      ).rejects.toThrow('The target companion user does not exist');
    });

    it('should successfully create a request and return it in frontend mapped format', async () => {
      const mockReceiver = {
        id: 'user-id-2',
        name: 'Jane Doe',
        profile: {
          fullName: 'Jane Doe Profile',
          tenureId: 'TN123',
          profilePhoto: 'https://example.com/avatar.jpg',
        },
      };

      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2026-06-20T10:00:00.000Z'),
        toDateTime: new Date('2026-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        status: RequestStatus.PENDING,
        createdAt: new Date('2026-06-20T08:00:00.000Z'),
        updatedAt: new Date('2026-06-20T08:00:00.000Z'),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockReceiver);
      (prisma.request.create as any).mockResolvedValue(mockRequest);

      const result = await RequestService.createRequest('user-id-1', {
        receiverId: 'user-id-2',
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2026-06-20T10:00:00.000Z'),
        toDateTime: new Date('2026-06-20T12:00:00.000Z'),
        message: 'Let us study together',
      });

      expect(prisma.request.create).toHaveBeenCalled();
      expect(result.id).toBe('req-id-123');
      expect(result.direction).toBe('sent');
      expect(result.mateUserId).toBe('user-id-2');
      expect(result.mateName).toBe('Jane Doe Profile');
      expect(result.mateTenureId).toBe('TN123');
      expect(result.mateAvatar).toBe('https://example.com/avatar.jpg');
      expect(result.status).toBe('pending');
    });
  });

  describe('listUserRequests', () => {
    it('should query and return sent and received requests separated', async () => {
      const mockSent = [
        {
          id: 'req-id-sent',
          senderId: 'user-id-current',
          receiverId: 'user-id-receiver',
          categoryId: 'study',
          categoryLabel: 'Study Partner',
          meetLocation: 'Library',
          fromDateTime: new Date('2026-06-20T10:00:00.000Z'),
          toDateTime: new Date('2026-06-20T12:00:00.000Z'),
          message: 'Study!',
          status: RequestStatus.PENDING,
          createdAt: new Date('2026-06-20T08:00:00.000Z'),
          receiver: {
            id: 'user-id-receiver',
            name: 'Jane Doe',
            profile: {
              fullName: 'Jane Doe Profile',
              tenureId: 'TN123',
              profilePhoto: 'https://example.com/avatar.jpg',
            },
          },
        },
      ];

      const mockReceived = [
        {
          id: 'req-id-rec',
          senderId: 'user-id-sender',
          receiverId: 'user-id-current',
          categoryId: 'food',
          categoryLabel: 'Food Buddy',
          meetLocation: 'Cafe',
          fromDateTime: new Date('2026-06-20T14:00:00.000Z'),
          toDateTime: new Date('2026-06-20T15:00:00.000Z'),
          message: 'Eat!',
          status: RequestStatus.CONFIRMED,
          createdAt: new Date('2026-06-20T09:00:00.000Z'),
          sender: {
            id: 'user-id-sender',
            name: 'John Smith',
            profile: {
              fullName: 'John Smith Profile',
              tenureId: 'TN456',
              profilePhoto: 'https://example.com/john.jpg',
            },
          },
        },
      ];

      (prisma.request.findMany as any)
        .mockResolvedValueOnce(mockSent)
        .mockResolvedValueOnce(mockReceived);

      const result = await RequestService.listUserRequests('user-id-current');

      expect(prisma.request.findMany).toHaveBeenCalledTimes(2);
      expect(result.sent.length).toBe(1);
      expect(result.sent[0].id).toBe('req-id-sent');
      expect(result.sent[0].direction).toBe('sent');
      expect(result.sent[0].mateName).toBe('Jane Doe Profile');

      expect(result.received.length).toBe(1);
      expect(result.received[0].id).toBe('req-id-rec');
      expect(result.received[0].direction).toBe('received');
      expect(result.received[0].mateName).toBe('John Smith Profile');
      expect(result.received[0].status).toBe('confirmed');
    });
  });

  describe('updateRequestStatus', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(
        RequestService.updateRequestStatus('user-id-1', 'invalid-id', 'confirmed')
      ).rejects.toThrow('Request not found');
    });

    it('should throw an error if sender tries to accept or decline', async () => {
      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.updateRequestStatus('user-id-1', 'req-id-123', 'confirmed')
      ).rejects.toThrow('You are not authorized to accept or decline this request');
    });

    it('should throw an error if receiver tries to cancel', async () => {
      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
        status: RequestStatus.PENDING,
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.updateRequestStatus('user-id-2', 'req-id-123', 'cancelled')
      ).rejects.toThrow('You are not authorized to cancel this request');
    });

    it('should successfully update status when valid', async () => {
      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
        categoryId: 'study',
        categoryLabel: 'Study Partner',
        meetLocation: 'Library',
        fromDateTime: new Date('2026-06-20T10:00:00.000Z'),
        toDateTime: new Date('2026-06-20T12:00:00.000Z'),
        message: 'Let us study together',
        status: RequestStatus.PENDING,
      };

      const mockUpdated = {
        ...mockRequest,
        status: RequestStatus.CONFIRMED,
        createdAt: new Date(),
        sender: {
          id: 'user-id-1',
          name: 'Sender name',
          profile: {
            fullName: 'Sender Profile',
            tenureId: 'TN111',
            profilePhoto: '',
          },
        },
        receiver: {
          id: 'user-id-2',
          name: 'Receiver name',
          profile: {
            fullName: 'Receiver Profile',
            tenureId: 'TN222',
            profilePhoto: '',
          },
        },
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.request.update as any).mockResolvedValue(mockUpdated);

      const result = await RequestService.updateRequestStatus('user-id-2', 'req-id-123', 'confirmed');

      expect(prisma.request.update).toHaveBeenCalledWith({
        where: { id: 'req-id-123' },
        data: { status: RequestStatus.CONFIRMED },
        include: {
          sender: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      });
      expect(result.status).toBe('confirmed');
      expect(result.direction).toBe('received');
      expect(result.mateUserId).toBe('user-id-1');
      expect(result.mateName).toBe('Sender Profile');
    });
  });

  describe('getRequestMessages', () => {
    it('should throw an error if request does not exist', async () => {
      (prisma.request.findUnique as any).mockResolvedValue(null);

      await expect(
        RequestService.getRequestMessages('user-id-1', 'req-invalid')
      ).rejects.toThrow('Request not found');
    });

    it('should throw an error if user is not part of the request', async () => {
      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
      };

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);

      await expect(
        RequestService.getRequestMessages('user-id-unauthorized', 'req-id-123')
      ).rejects.toThrow('You are not authorized to view messages for this request');
    });

    it('should successfully retrieve and map chat messages', async () => {
      const mockRequest = {
        id: 'req-id-123',
        senderId: 'user-id-1',
        receiverId: 'user-id-2',
      };

      const mockMessages = [
        {
          id: 'msg-1',
          requestId: 'req-id-123',
          senderId: 'user-id-1',
          receiverId: 'user-id-2',
          content: 'Hello mate!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          createdAt: new Date('2026-06-25T10:00:00.000Z'),
        },
        {
          id: 'msg-2',
          requestId: 'req-id-123',
          senderId: 'user-id-2',
          receiverId: 'user-id-1',
          content: 'Hi there!',
          type: 'text',
          mediaUrl: null,
          voiceDuration: null,
          createdAt: new Date('2026-06-25T10:01:00.000Z'),
        },
      ];

      (prisma.request.findUnique as any).mockResolvedValue(mockRequest);
      (prisma.message.findMany as any).mockResolvedValue(mockMessages);

      const result = await RequestService.getRequestMessages('user-id-1', 'req-id-123');

      expect(prisma.request.findUnique).toHaveBeenCalledWith({ where: { id: 'req-id-123' } });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { requestId: 'req-id-123' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[0].sender).toBe('me');
      expect(result[0].text).toBe('Hello mate!');
      expect(result[1].id).toBe('msg-2');
      expect(result[1].sender).toBe('them');
      expect(result[1].text).toBe('Hi there!');
    });
  });
});
