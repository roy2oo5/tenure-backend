import { NextFunction, Request, Response } from 'express';
import { getAppStatus } from '../services/maintenance.service';

const ALLOWED_PATHS = new Set(['/health', '/app-status']);

export const enforceMaintenanceMode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (ALLOWED_PATHS.has(req.path) || req.path.startsWith('/admin/')) {
      next();
      return;
    }
    const status = await getAppStatus();
    if (!status.maintenanceMode) {
      next();
      return;
    }
    res.status(503).json({
      status: 'fail',
      code: 'MAINTENANCE_MODE',
      message: status.maintenanceMessage,
    });
  } catch (error) {
    next(error);
  }
};

