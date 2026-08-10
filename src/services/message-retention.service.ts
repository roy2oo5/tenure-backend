import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export const MESSAGE_RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function messageRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function deleteExpiredMessages(now = new Date()): Promise<number> {
  const result = await prisma.message.deleteMany({
    where: { createdAt: { lt: messageRetentionCutoff(now) } },
  });
  return result.count;
}

export function startMessageRetentionCleanup(): NodeJS.Timeout {
  const runCleanup = () => {
    deleteExpiredMessages()
      .then((count) => {
        if (count > 0) logger.info(`Deleted ${count} chat messages older than 30 days`);
      })
      .catch((error) => logger.error(`Message retention cleanup failed: ${error}`));
  };
  runCleanup();
  const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
