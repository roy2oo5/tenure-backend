import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';

export class BlockService {
  /**
   * Block a user
   */
  public static async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new AppError('You cannot block yourself', 400);
    }

    // Verify blocked user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: blockedId },
    });

    if (!targetUser) {
      throw new AppError('User to block not found', 404);
    }

    // Check if block already exists
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (existingBlock) {
      return existingBlock;
    }

    // Create the block
    return prisma.block.create({
      data: {
        blockerId,
        blockedId,
      },
    });
  }

  /**
   * Unblock a user
   */
  public static async unblockUser(blockerId: string, blockedId: string) {
    // Check if block exists
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (!existingBlock) {
      throw new AppError('Block relation not found', 404);
    }

    // Delete the block record
    await prisma.block.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });
  }

  /**
   * Get list of blocked users by blockerId
   */
  public static async getBlockedUsers(blockerId: string) {
    const blocks = await prisma.block.findMany({
      where: { blockerId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            profile: {
              select: {
                tenureId: true,
                fullName: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    return blocks.map((b) => ({
      userId: b.blocked.id,
      name: b.blocked.name,
      email: b.blocked.email,
      phone: b.blocked.phone,
      tenureId: b.blocked.profile?.tenureId || '',
      fullName: b.blocked.profile?.fullName || '',
      profilePhoto: b.blocked.profile?.profilePhoto || null,
    }));
  }

  /**
   * Check if userA blocked userB, or userB blocked userA
   */
  public static async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    const blockRelation = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
    });

    return !!blockRelation;
  }
}
