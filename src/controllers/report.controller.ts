import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service';
import { AppError } from '../utils/app-error';

export class ReportController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated', 401));
      }
      const { targetId, category, message } = req.body;

      const report = await ReportService.createReport(req.user.id, {
        targetId,
        category,
        message,
      });

      res.status(201).json({
        status: 'success',
        data: {
          report,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
