import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

export class CategoryController {
  public static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' },
      });
      res.status(200).json({
        status: 'success',
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }
}
