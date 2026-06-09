import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { Role, User } from '@prisma/client';

export type UserWithoutPassword = Omit<User, 'password'>;

export interface AuthResponse {
  user: UserWithoutPassword;
  token: string;
}

const formatUser = (user: User): UserWithoutPassword => {
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

const signToken = (id: string, email: string, role: Role): string => {
  return jwt.sign({ id, email, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

export class UserService {
  public static async register(data: Prisma.UserCreateInput): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('Email address is already registered', 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newUser = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    const token = signToken(newUser.id, newUser.email, newUser.role);

    return {
      user: formatUser(newUser),
      token,
    };
  }

  public static async login(data: Prisma.UserWhereInput): Promise<AuthResponse> {
    if (!data.email || !data.password) {
      throw new AppError('Please provide email and password', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email as string },
    });

    if (!user || !(await bcrypt.compare(data.password as string, user.password))) {
      throw new AppError('Incorrect email or password', 401);
    }

    const token = signToken(user.id, user.email, user.role);

    return {
      user: formatUser(user),
      token,
    };
  }

  public static async getProfile(id: string): Promise<UserWithoutPassword> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return formatUser(user);
  }

  public static async getAllUsers(): Promise<UserWithoutPassword[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(formatUser);
  }

  public static async updateUser(id: string, data: Prisma.UserUpdateInput): Promise<UserWithoutPassword> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password as string, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    return formatUser(updatedUser);
  }

  public static async deleteUser(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}

// Import Prisma namespace to resolve compiler types
import { Prisma } from '@prisma/client';
