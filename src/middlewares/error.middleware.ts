import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // Handle Prisma Specific Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      error = new AppError(`A record with this ${target} already exists.`, 409);
    } else if (err.code === 'P2025') {
      error = new AppError('Record to update or delete does not exist.', 404);
    }
  }

  const statusCode = (error as AppError).statusCode || 500;
  const status = (error as AppError).status || 'error';
  const isOperational = (error as AppError).isOperational || false;

  // Log the error
  logger.error(
    `[${req.method}] ${req.originalUrl} - Status: ${statusCode} - Message: ${error.message}`
  );
  if (!isOperational && error.stack) {
    logger.error(error.stack);
  }

  res.status(statusCode).json({
    status,
    message: error.message,
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};
