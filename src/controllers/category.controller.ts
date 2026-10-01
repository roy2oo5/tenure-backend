import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { MATE_CATEGORIES } from '../constants/mate-categories';

export class CategoryController {
  public static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.category.findMany();
      const categoryOrder = new Map(
        MATE_CATEGORIES.map((category, index) => [category.label, index]),
      );
      categories.sort(
        (left, right) =>
          (categoryOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
            (categoryOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER) ||
          left.name.localeCompare(right.name),
      );
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
