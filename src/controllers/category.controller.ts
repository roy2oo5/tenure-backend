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

  public static async languages(_req: Request, res: Response, next: NextFunction) {
    try {
      const languages = await prisma.language.findMany({
        orderBy: { name: 'asc' },
      });

      res.status(200).json({
        status: 'success',
        data: { languages },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async qualifications(_req: Request, res: Response, next: NextFunction) {
    try {
      const qualifications = await prisma.qualification.findMany({
        orderBy: { id: 'asc' },
      });

      res.status(200).json({
        status: 'success',
        data: { qualifications },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async professions(_req: Request, res: Response, next: NextFunction) {
    try {
      const professions = await prisma.profession.findMany({
        orderBy: { id: 'asc' },
      });

      res.status(200).json({
        status: 'success',
        data: { professions },
      });
    } catch (error) {
      next(error);
    }
  }
}
