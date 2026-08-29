import { prisma } from '../config/database';

export interface AppStatus {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  minIosVersion: string;
  minAndroidVersion: string;
  forceUpdate: boolean;
  requireAadhaar: boolean;
  requireLivePhoto: boolean;
}

const CACHE_TTL_MS = 5_000;
let cachedStatus: AppStatus | null = null;
let cachedAt = 0;
let inFlight: Promise<AppStatus> | null = null;

const loadStatus = async (): Promise<AppStatus> => {
  const settings = await prisma.platformSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return {
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    minIosVersion: settings.minIosVersion,
    minAndroidVersion: settings.minAndroidVersion,
    forceUpdate: settings.forceUpdate,
    requireAadhaar: settings.requireAadhaar,
    requireLivePhoto: settings.requireLivePhoto,
  };
};

export const getAppStatus = async (forceRefresh = false): Promise<AppStatus> => {
  if (!forceRefresh && cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }
  if (!inFlight) {
    inFlight = loadStatus()
      .then(status => {
        cachedStatus = status;
        cachedAt = Date.now();
        return status;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

