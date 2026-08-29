import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error';

export interface CreateReportInput {
  targetId?: number | null;
  requestId?: number | null;
  category: string;
  message: string;
}

export class ReportService {
  /**
   * Create a support/abuse report
   */
  public static async createReport(reporterId: number, data: CreateReportInput) {
    const { targetId, requestId, category, message } = data;

    if (!category || !category.trim()) {
      throw new AppError('Category is required', 400);
    }
    if (!message || !message.trim()) {
      throw new AppError('Message/description is required', 400);
    }
    if (message.trim().length > 50) {
      throw new AppError('Report description must be 50 characters or fewer', 400);
    }

    if (requestId != null) {
      const support = await prisma.request.findFirst({
        where: {
          id: requestId,
          OR: [{ senderId: reporterId }, { receiverId: reporterId }],
        },
        include: { session: true },
      });
      if (!support?.session?.endedAt) {
        throw new AppError('Only a completed support can be reported', 403);
      }
      if (support.senderId !== targetId && support.receiverId !== targetId) {
        throw new AppError('Reported user is not part of this support', 400);
      }
      if (Date.now() >= support.session.endedAt.getTime() + 2 * 60 * 60 * 1000) {
        throw new AppError('The 2-hour reporting window has ended', 403);
      }
      const existing = await prisma.report.findFirst({
        where: { reporterId, requestId },
        select: { id: true },
      });
      if (existing) {
        throw new AppError('You have already reported this completed support', 409);
      }
    }

    if (targetId) {
      if (reporterId === targetId) {
        throw new AppError('You cannot report yourself', 400);
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
      });
      if (!targetUser) {
        throw new AppError('Reported user not found', 404);
      }
      const startedMeeting =
        requestId == null
          ? await prisma.request.findFirst({
              where: {
                OR: [
                  { senderId: reporterId, receiverId: targetId },
                  { senderId: targetId, receiverId: reporterId },
                ],
                fromDateTime: { lte: new Date() },
              },
              select: { id: true },
            })
          : { id: requestId };
      if (!startedMeeting) {
        throw new AppError(
          'You can report this user only after your meeting time has started',
          403,
        );
      }
    }

    try {
      return await prisma.report.create({
        data: {
          reporterId,
          targetId: targetId || null,
          requestId: requestId || null,
          category: category.trim(),
          message: message.trim(),
        },
      });
    } catch (error) {
      if (
        requestId != null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError('You have already reported this completed support', 409);
      }
      throw error;
    }
  }
}
