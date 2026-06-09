import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';

// Prevent multiple instances of Prisma Client in development (hot-reloading)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('🐘 Database connected successfully');
  } catch (error) {
    logger.error('❌ Database connection failure:', error);
    process.exit(1);
  }
};
