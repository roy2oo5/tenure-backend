import { prisma } from '../config/database';
import { sendGlobalToAll } from './websocket.service';

async function setAvailabilityForEnabledUsers(
  userIds: number[],
  instantAvailable: boolean,
): Promise<number> {
  if (userIds.length === 0) return 0;

  let updatedCount = 0;
  for (const userId of [...new Set(userIds)]) {
    const result = await prisma.profile.updateMany({
      where: {
        userId,
        readyNowEnabled: true,
        instantAvailable: !instantAvailable,
      },
      data: { instantAvailable },
    });
    if (result.count > 0) {
      updatedCount += result.count;
      sendGlobalToAll({ event: 'instants_updated', userId, instantAvailable });
    }
  }
  return updatedCount;
}

export function suspendReadyNow(userIds: number[]): Promise<number> {
  return setAvailabilityForEnabledUsers(userIds, false);
}

export function restoreReadyNow(userIds: number[]): Promise<number> {
  return setAvailabilityForEnabledUsers(userIds, true);
}
