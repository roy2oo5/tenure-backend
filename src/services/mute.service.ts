import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';

export class MuteService {
  public static async muteUser(muterId: number, mutedUserId: number) {
    if (muterId === mutedUserId) {
      throw new AppError('You cannot mute yourself', 400);
    }
    const user = await prisma.user.findUnique({ where: { id: mutedUserId }, select: { id: true } });
    if (!user) throw new AppError('User to mute not found', 404);

    return prisma.mute.upsert({
      where: { muterId_mutedUserId: { muterId, mutedUserId } },
      create: { muterId, mutedUserId },
      update: {},
    });
  }

  public static async unmuteUser(muterId: number, mutedUserId: number) {
    await prisma.mute.deleteMany({ where: { muterId, mutedUserId } });
  }

  public static async getMutedUsers(muterId: number) {
    return prisma.mute.findMany({
      where: { muterId },
      select: { mutedUserId: true },
    });
  }
}
