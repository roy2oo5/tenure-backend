import { UserService } from '@/services/user.service';
import { prisma } from '@/config/database';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

vi.mock('@/config/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/utils/tenure-id', () => ({
  generateUniqueTenureId: vi.fn().mockResolvedValue('AB123'),
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
        id: 123,
        tenureId: null,
        email: 'test@example.com',
        phone: null,
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
        id: 123,
        tenureId: 'AB123',
        email: 'test@example.com',
      };

      (prisma.user.findUnique as any).mockResolvedValue(existingUser);

      await expect(UserService.register(mockUserData)).rejects.toThrow('Email address is already registered');
    });
  });

  describe('authenticateByPhone', () => {
    it('should return token for an existing user matched by phone', async () => {
      const existingUser = {
        id: 123,
        tenureId: 'AB123',
        email: 'phone_9876543210@tenure.app',
        phone: '9876543210',
        password: 'hashedPassword123',
        name: 'User 9876543210',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(existingUser);

      const result = await UserService.authenticateByPhone('9876543210');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '9876543210' } });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.token).toBe('mocked-jwt-token');
      expect(result.user.phone).toBe('9876543210');
    });

    it('should create a new user when phone is not registered', async () => {
      const newUser = {
        id: 456,
        tenureId: null,
        email: 'phone_9876543210@tenure.app',
        phone: '9876543210',
        password: 'hashedPassword123',
        name: 'User 9876543210',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue(newUser);

      const result = await UserService.authenticateByPhone('9876543210');

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.user.phone).toBe('9876543210');
      expect(result.token).toBe('mocked-jwt-token');
    });

    it('should reactivate a deactivated user account by setting isActive to true', async () => {
      const deactivatedUser = {
        id: 123,
        tenureId: 'AB123',
        email: 'phone_9876543210@tenure.app',
        phone: '9876543210',
        password: 'hashedPassword123',
        name: 'User 9876543210',
        role: Role.USER,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(deactivatedUser);
      (prisma.user.update as any).mockResolvedValue({
        ...deactivatedUser,
        isActive: true,
      });

      const result = await UserService.authenticateByPhone('9876543210');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: deactivatedUser.id },
        data: { isActive: true },
      });
      expect(result.user.isActive).toBe(true);
    });
  });

  describe('login', () => {
    it('should login an active user successfully', async () => {
      const activeUser = {
        id: 123,
        tenureId: 'AB123',
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: Role.USER,
        isActive: true,
      };

      (prisma.user.findUnique as any).mockResolvedValue(activeUser);
      (bcrypt.compare as any).mockResolvedValue(true);

      const result = await UserService.login({ email: 'test@example.com', password: 'password123' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result.token).toBe('mocked-jwt-token');
      expect(result.user.isActive).toBe(true);
    });

    it('should reactivate a deactivated user on login', async () => {
      const deactivatedUser = {
        id: 123,
        tenureId: 'AB123',
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: Role.USER,
        isActive: false,
      };

      (prisma.user.findUnique as any).mockResolvedValue(deactivatedUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (prisma.user.update as any).mockResolvedValue({
        ...deactivatedUser,
        isActive: true,
      });

      const result = await UserService.login({ email: 'test@example.com', password: 'password123' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: deactivatedUser.id },
        data: { isActive: true },
      });
      expect(result.user.isActive).toBe(true);
    });
  });

  describe('deleteUser', () => {
    it('should permanently delete user account', async () => {
      (prisma.user.delete as any).mockResolvedValue({});

      await UserService.deleteUser(123);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 123 },
      });
    });
  });
});
