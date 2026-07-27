import { prisma } from '../config/database';

export class CallService {
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
