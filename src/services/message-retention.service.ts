import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { UploadService } from './upload.service';

// Node timers cannot exceed about 24.8 days. Longer waits are split into
// checkpoints without changing the message's exact database expiry timestamp.
const MAX_TIMER_DELAY_MS = 2_147_000_000;

let cleanupTimer: NodeJS.Timeout | null = null;
let scheduledWakeAt: number | null = null;

export async function deleteExpiredMessages(now = new Date()): Promise<number> {
  const expiredVoiceMessages = await prisma.message.findMany({
    where: {
      expiresAt: { lte: now },
      type: 'voice',
      mediaUrl: { not: null },
    },
    select: { mediaUrl: true },
  });
  for (const message of expiredVoiceMessages) {
    if (message.mediaUrl) await UploadService.deleteUploadedFile(message.mediaUrl);
  }
  const result = await prisma.message.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return result.count;
}

function armCleanup(expiresAt: Date): void {
  const now = Date.now();
  const wakeAt = Math.min(expiresAt.getTime(), now + MAX_TIMER_DELAY_MS);

  if (cleanupTimer && scheduledWakeAt !== null && scheduledWakeAt <= wakeAt) {
    return;
  }

  if (cleanupTimer) clearTimeout(cleanupTimer);
  scheduledWakeAt = wakeAt;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    scheduledWakeAt = null;
    void runCleanupAndScheduleNext();
  }, Math.max(0, wakeAt - now));
  cleanupTimer.unref();
}

async function runCleanupAndScheduleNext(): Promise<void> {
  try {
    const count = await deleteExpiredMessages();
    if (count > 0) logger.info(`Deleted ${count} expired chat messages`);

    const next = await prisma.message.findFirst({
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    });
    if (next) armCleanup(next.expiresAt);
  } catch (error) {
    logger.error(`Message retention cleanup failed: ${error}`);
    // Retry transient database failures without falling back to a coarse batch job.
    armCleanup(new Date(Date.now() + 60_000));
  }
}

/** Re-arm the single timer when a newly-created message expires before it. */
export function scheduleMessageExpiration(expiresAt: Date): void {
  armCleanup(expiresAt);
}

export function startMessageRetentionCleanup(): void {
  void runCleanupAndScheduleNext();
}
