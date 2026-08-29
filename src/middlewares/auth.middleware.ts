import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { prisma } from '../config/database';
import { Role } from '@prisma/client';

interface DecodedToken {
  id: number;
  email?: string | null;
  role: Role;
  authVersion: number;
  sid: string;
  did: string;
  iat: number;
  exp?: number;
}

export const protect = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as DecodedToken;

    const requestDeviceId = req.header('x-device-id');
    if (!decoded.sid || !decoded.did || !requestDeviceId || requestDeviceId !== decoded.did) {
      return next(new AppError('This session is not valid for this device.', 401));
    }

    // Check if user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        isActive: true,
        authVersion: true,
      },
    });

    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('This user account has been deactivated.', 401));
    }

    if (decoded.authVersion !== user.authVersion) {
      return next(new AppError('This account was logged in on another device. Please log in again.', 401));
    }

    const session = await prisma.authSession.findUnique({ where: { id: decoded.sid } });
    if (
      !session ||
      session.userId !== user.id ||
      session.deviceId !== decoded.did ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }

    // Grant access to protected route by attaching user to request
    req.user = user;
    req.authSessionId = session.id;
    req.authDeviceId = session.deviceId;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Your token has expired. Please log in again.', 401));
    }
    next(error);
  }
};

export const restrictTo = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('User not authenticated.', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};
