import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { enforceAgeRestriction } from '../utils/age-restriction';

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 30;

const tokenHash = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const newRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

const accessToken = (user: User, sessionId: string, deviceId: string): string =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      authVersion: user.authVersion,
      sid: sessionId,
      did: deviceId,
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_SECONDS },
  );

export type SessionCredentials = { token: string; refreshToken: string };

export class AuthSessionService {
  public static async create(user: User, deviceId: string): Promise<SessionCredentials> {
    if (!deviceId || deviceId.length < 16) throw new AppError('A valid device ID is required', 400);

    // The mobile product currently has a single-device-login policy.
    await prisma.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const refreshToken = newRefreshToken();
    const session = await prisma.authSession.create({
      data: {
        userId: user.id,
        deviceId,
        refreshTokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return { token: accessToken(user, session.id, deviceId), refreshToken };
  }

  public static async refresh(refreshToken: string, deviceId: string): Promise<SessionCredentials & { user: User }> {
    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: tokenHash(refreshToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.deviceId !== deviceId ||
      !session.user.isActive
    ) {
      throw new AppError('Session expired or invalid. Please log in again.', 401);
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: session.userId },
      select: { dob: true },
    });
    if (profile) enforceAgeRestriction(profile.dob);

    const replacement = newRefreshToken();
    await prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: tokenHash(replacement) },
    });
    return {
      token: accessToken(session.user, session.id, deviceId),
      refreshToken: replacement,
      user: session.user,
    };
  }

  public static async revoke(sessionId: string, userId: number): Promise<void> {
    await prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
