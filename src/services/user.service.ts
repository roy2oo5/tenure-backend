import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { User } from '@prisma/client';
import { disconnectUserForNewLogin, sendGlobalToAll } from './websocket.service';
import { AuthSessionService } from './auth-session.service';
import { enforceAgeRestriction } from '../utils/age-restriction';

export type UserWithoutPassword = Omit<User, 'password'>;

export interface AuthResponse {
  user: UserWithoutPassword;
  token: string;
  refreshToken?: string;
}

const formatUser = (user: User): UserWithoutPassword => {
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new AppError('Please provide a valid 10-digit phone number', 400);
  }
  if (!['6', '7', '8', '9'].includes(digits[0])) {
    throw new AppError('Please provide a valid Indian mobile number', 400);
  }
  return digits;
};

export class UserService {
  public static async register(data: Prisma.UserCreateInput, deviceId: string): Promise<AuthResponse> {
    if (!data.email || !data.password) {
      throw new AppError('Please provide email and password', 400);
    }
    const email = data.email;
    const password = data.password;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('Email address is already registered', 409);
    }

    if (data.phone) {
      const phone = normalizePhone(data.phone as string);
      const existingPhoneUser = await prisma.user.findUnique({
        where: { phone },
      });
      if (existingPhoneUser) {
        throw new AppError('Phone number is already registered', 409);
      }
      data.phone = phone;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    const credentials = await AuthSessionService.create(newUser, deviceId);

    return {
      user: formatUser(newUser),
      ...credentials,
    };
  }

  /**
   * Find existing user by phone or create a new account.
   * Used by the mobile app so logout + re-login restores the same user/profile.
   */
  public static async authenticateByPhone(
    phoneInput: string,
    deviceId?: string,
  ): Promise<AuthResponse> {
    const phone = normalizePhone(phoneInput);

    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      const profile = await prisma.profile.findUnique({
        where: { userId: existingUser.id },
        select: { dob: true },
      });
      // A missing profile is a first-time registration and must be allowed to
      // continue to DOB collection. Existing profiles are checked on every login.
      if (profile) enforceAgeRestriction(profile.dob);

      const loggedInUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          isActive: true,
          authVersion: { increment: 1 },
          lastLoginAt: new Date(),
          activeDeviceId: deviceId ?? null,
        },
      });
      if (!deviceId) throw new AppError('A valid device ID is required', 400);
      const credentials = await AuthSessionService.create(loggedInUser, deviceId);
      disconnectUserForNewLogin(existingUser.id);
      return {
        user: formatUser(loggedInUser),
        ...credentials,
      };
    }

    const email = `phone_${phone}@tenure.app`;
    const password = `pass_${phone}`;
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        phone,
        email,
        password: hashedPassword,
        name: `User ${phone}`,
        lastLoginAt: new Date(),
        activeDeviceId: deviceId ?? null,
      },
    });

    if (!deviceId) throw new AppError('A valid device ID is required', 400);
    const credentials = await AuthSessionService.create(newUser, deviceId);

    return {
      user: formatUser(newUser),
      ...credentials,
    };
  }

  public static async login(data: Prisma.UserWhereInput, deviceId: string): Promise<AuthResponse> {
    if (!data.email || !data.password) {
      throw new AppError('Please provide email and password', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email as string },
    });

    if (!user || !user.password || !(await bcrypt.compare(data.password as string, user.password))) {
      throw new AppError('Incorrect email or password', 401);
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { dob: true },
    });
    if (profile) enforceAgeRestriction(profile.dob);

    if (!user.isActive) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      });
      user.isActive = true;
    }

    const credentials = await AuthSessionService.create(user, deviceId);

    return {
      user: formatUser(user),
      ...credentials,
    };
  }

  public static async getProfile(id: number): Promise<UserWithoutPassword> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return formatUser(user);
  }

  public static async phoneLoginStatus(
    phoneInput: string,
    deviceId?: string,
  ): Promise<{ loggedInElsewhere: boolean }> {
    const phone = normalizePhone(phoneInput);
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { lastLoginAt: true, activeDeviceId: true },
    });
    const activeSince = Date.now() - 24 * 60 * 60 * 1000;
    return {
      loggedInElsewhere: Boolean(
        user?.lastLoginAt &&
          user.lastLoginAt.getTime() >= activeSince &&
          (!deviceId || !user.activeDeviceId || user.activeDeviceId !== deviceId),
      ),
    };
  }

  public static async logout(userId: number): Promise<void> {
    const readyNowReset = await prisma.profile.updateMany({
      where: { userId, instantAvailable: true },
      data: {
        instantAvailable: false,
        readyNowEnabled: false,
        instantAvailableUntil: null,
        instantCategories: [],
        instantNote: null,
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: null,
        activeDeviceId: null,
        authVersion: { increment: 1 },
      },
    });
    if (readyNowReset.count > 0) {
      sendGlobalToAll({
        event: 'instants_updated',
        userId,
        instantAvailable: false,
      });
    }
  }

  public static async getAllUsers(): Promise<UserWithoutPassword[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(formatUser);
  }

  public static async updateUser(id: number, data: Prisma.UserUpdateInput): Promise<UserWithoutPassword> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password as string, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    return formatUser(updatedUser);
  }

  public static async changePassword(
    userId: number,
    currentPassword?: string,
    newPassword?: string
  ): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new AppError('Please provide current password and new password', 400);
    }
    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.password) {
      throw new AppError('Password is not set for this account', 400);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new AppError('Incorrect current password', 400);
    }

    await this.updateUser(userId, { password: newPassword });
  }

  public static async deleteUser(id: number): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}

// Import Prisma namespace to resolve compiler types
import { Prisma } from '@prisma/client';
