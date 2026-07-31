import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';

export interface CreateReportInput {
  targetId?: number | null;
  category: string;
  message: string;
}

export class ReportService {
  /**
   * Create a support/abuse report
   */
  public static async createReport(reporterId: number, data: CreateReportInput) {
    const { targetId, category, message } = data;

    if (!category || !category.trim()) {
      throw new AppError('Category is required', 400);
    }
    if (!message || !message.trim()) {
      throw new AppError('Message/description is required', 400);
    }
    if (message.trim().length > 50) {
      throw new AppError('Report description must be 50 characters or fewer', 400);
    }
    if (message.trim().length > 50) {
      throw new AppError('Report description must be 50 characters or fewer', 400);
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
    }

    return prisma.report.create({
      data: {
        reporterId,
        targetId: targetId || null,
        category: category.trim(),
        message: message.trim(),
      },
    });
  }
}
