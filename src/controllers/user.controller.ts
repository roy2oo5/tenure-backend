import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { SessionService } from '../services/session.service';
import { AppError } from '../utils/app-error';


export class UserController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name, role, phone } = req.body;
      const result = await UserService.register({ email, password, name, role, phone });
      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await UserService.login({ email, password });
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async phoneAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.body;
      const result = await UserService.authenticateByPhone(phone);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const user = await UserService.getProfile(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await UserService.getAllUsers();
      res.status(200).json({
        status: 'success',
        results: users.length,
        data: { users },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const updatedUser = await UserService.updateUser(req.user.id, req.body);
      res.status(200).json({
        status: 'success',
        data: { user: updatedUser },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await UserService.deleteUser(id);
      res.status(204).json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deactivateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      await UserService.updateUser(req.user.id, { isActive: false });
      res.status(200).json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      await UserService.deleteUser(req.user.id);
      res.status(204).json({
        status: 'success',
        data: null,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getActiveSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const session = await SessionService.getActiveSession(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  }
}

