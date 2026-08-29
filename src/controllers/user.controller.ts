import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { SessionService } from '../services/session.service';
import { AppError } from '../utils/app-error';
import { AuthSessionService } from '../services/auth-session.service';

export class UserController {
  public static async phoneLoginStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await UserService.phoneLoginStatus(
        req.query.phone?.toString() ?? '',
        req.query.deviceId?.toString(),
      );
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name, role, phone, deviceId } = req.body;
      const result = await UserService.register({ email, password, name, role, phone }, deviceId);
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
      const { email, password, deviceId } = req.body;
      const result = await UserService.login({ email, password }, deviceId);
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
      const { phone, deviceId } = req.body;
      const result = await UserService.authenticateByPhone(phone, deviceId);
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

  public static async refreshSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthSessionService.refresh(req.body.refreshToken, req.body.deviceId);
      const { password: _, ...user } = result.user;
      res.status(200).json({
        status: 'success',
        data: { token: result.token, refreshToken: result.refreshToken, user },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      if (req.authSessionId) {
        await AuthSessionService.revoke(req.authSessionId, req.user.id);
      }
      await UserService.logout(req.user.id);
      res.status(200).json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  public static async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
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
      const id = parseInt(req.params.id, 10);
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

  public static async changePassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError('You are not authenticated.', 401));
      }
      const { currentPassword, newPassword } = req.body;

      await UserService.changePassword(req.user.id, currentPassword, newPassword);

      res.status(200).json({
        status: 'success',
        message: 'Password successfully updated',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getActiveSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
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
