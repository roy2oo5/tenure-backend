import { CallStatus } from '@prisma/client';
import { prisma } from '../config/database';

const DAILY_PAIR_CALL_LIMIT_SECONDS = 8 * 60;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export class CallService {
  public static readonly DAILY_PAIR_CALL_LIMIT_SECONDS = DAILY_PAIR_CALL_LIMIT_SECONDS;

  public static async getDailyPairUsage(userId: number, mateUserId: number) {
    const { start, end } = getTodayRangeInIst();
    const calls = await prisma.call.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
        OR: [
          { callerId: userId, receiverId: mateUserId },
          { callerId: mateUserId, receiverId: userId },
        ],
        status: {
          in: [CallStatus.ONGOING, CallStatus.COMPLETED],
        },
      },
      select: {
        status: true,
        duration: true,
        startedAt: true,
      },
    });

    const now = Date.now();
    const usedSeconds = calls.reduce((total, call) => {
      if (call.status === CallStatus.ONGOING && call.startedAt) {
        return total + Math.max(0, Math.floor((now - call.startedAt.getTime()) / 1000));
      }
      return total + Math.max(0, call.duration ?? 0);
    }, 0);
    const remainingSeconds = Math.max(0, DAILY_PAIR_CALL_LIMIT_SECONDS - usedSeconds);

    return {
      limitSeconds: DAILY_PAIR_CALL_LIMIT_SECONDS,
      usedSeconds,
      remainingSeconds,
      resetAt: end,
    };
  }

  public static async getCallHistory(userId: number) {
    const calls = await prisma.call.findMany({
      where: {
        OR: [
          { callerId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        caller: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                fullName: true,
                profilePhoto: true,
              },
            },
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            profile: {
              select: {
                fullName: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    return calls.map((call) => {
      const isOutgoing = call.callerId === userId;
      const otherUser = isOutgoing ? call.receiver : call.caller;
      return {
        id: call.id,
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        duration: call.duration,
        createdAt: call.createdAt,
        isOutgoing,
        otherUser: {
          id: otherUser.id,
          name: otherUser.profile?.fullName || otherUser.name || 'Unknown',
          avatar: otherUser.profile?.profilePhoto || null,
        },
      };
    });
  }
}

function getTodayRangeInIst() {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const startIst = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  );

  return {
    start: new Date(startIst - IST_OFFSET_MS),
    end: new Date(startIst + 24 * 60 * 60 * 1000 - IST_OFFSET_MS),
  };
}
