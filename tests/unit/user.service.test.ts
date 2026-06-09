import { UserService } from '@/services/user.service';
import { prisma } from '@/config/database';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

vi.mock('@/config/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashedPassword123'),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mocked-jwt-token'),
  },
}));

describe('UserService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a user successfully and return details and token', async () => {
      const mockUserData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const mockDbUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        password: 'hashedPassword123',
        name: 'Test User',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock DB methods
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue(mockDbUser);

      const result = await UserService.register(mockUserData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: mockUserData.email } });
      expect(bcrypt.hash).toHaveBeenCalledWith(mockUserData.password, 12);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.token).toBe('mocked-jwt-token');
      expect(result.user.email).toBe(mockUserData.email);
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw an error if the email is already registered', async () => {
      const mockUserData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const existingUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
      };

      (prisma.user.findUnique as any).mockResolvedValue(existingUser);

      await expect(UserService.register(mockUserData)).rejects.toThrow('Email address is already registered');
    });
  });
});
