import { Prisma, Profile, RequestStatus, SessionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import {
  canonicalCategoryLabel,
  getCategoryMatchVariants,
  profileMatchesCategory,
} from '../constants/mate-categories';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export type DiscoverSearchInput = {
  q?: string;
  district?: string | null;
  category?: string | null;
  languages?: string[];
  latitude?: number | null;
  longitude?: number | null;
  gender?: 'all' | 'male' | 'female';
  ageRange?: 'all' | 'under30' | '30to45' | 'over45';
  hourlyRateRange?: 'all' | 'under70' | '70to200' | '200to300' | 'custom';
  customHourlyRateMin?: number | null;
  customHourlyRateMax?: number | null;
  requiredVehicleTypes?: Array<'two_wheeler' | 'four_wheeler'>;
  drivingVehicleType?: 'two_wheeler' | 'four_wheeler' | null;
};

export type DiscoverMateResult = {
  userId: number;
  tenureId: string;
  fullName: string;
  profilePhoto: string | null;
  location: string | null;
  district: string;
  state: string;
  gender: string | null;
  dob: Date;
  isMinor: boolean;
  category: string;
  categories: string[];
  hourlyRate: number | null;
  rating: number;
  ratingCount: number;
  categoryRates: Record<string, number>;
  languages: string[];
  vehicles: string[];
  canRideBike: boolean | null;
  canDriveCar: boolean | null;
  about: string | null;
  professions: string[];
  qualification: string | null;
  bloodGroup: string | null;
  availableDays: string[];
  availableTimeRange: string | null;
  weeklyAvailability: unknown;
  bestTime: string | null;
  aadhaarVerified: boolean;
  phoneAdded: boolean;
  emailAdded: boolean;
  livePhotoAdded: boolean;
  gallery: string[];
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  website: string | null;
  contactEmail: string | null;
  whatsappUsername: string | null;
  whatsappNumber: string | null;
  instantAvailable: boolean;
  instantAvailableUntil: Date | null;
  instantCategories: string[];
  instantNote: string | null;
  distanceKm: number | null;
  travelDurationSeconds: number | null;
  latitude: number | null;
  longitude: number | null;
  saved: boolean;
  busyToday: boolean;
  activeSessionStatus: SessionStatus | null;
  scheduledMeets: Array<{ fromDateTime: string; toDateTime: string | null }>;
};

type PublicProfile = Profile & {
  user?: {
    tenureId: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type PublicProfileWithUser = Profile & {
  user: {
    tenureId: string | null;
    email: string | null;
    phone: string | null;
  };
};

const PLACEHOLDER_NAME = /^user\s+\d{10}$/i;

const GENDER_GROUPS: Record<'male' | 'female', string[]> = {
  male: ['man', 'male'],
  female: ['woman', 'female'],
};

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function normalizeGender(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function matchesGender(profileGender: string | null, filter: 'all' | 'male' | 'female'): boolean {
  if (filter === 'all') {
    return true;
  }
  const normalized = normalizeGender(profileGender);
  return GENDER_GROUPS[filter].includes(normalized);
}

function matchesAgeRange(dob: Date, ageRange: DiscoverSearchInput['ageRange']): boolean {
  if (!ageRange || ageRange === 'all') {
    return true;
  }
  const age = ageFromDob(dob);
  switch (ageRange) {
    case 'under30':
      return age < 30;
    case '30to45':
      return age >= 30 && age <= 45;
    case 'over45':
      return age > 45;
    default:
      return true;
  }
}

function matchesHourlyRate(rate: number | null, input: DiscoverSearchInput): boolean {
  const hourlyRate = rate ?? 0;
  const { hourlyRateRange, customHourlyRateMin, customHourlyRateMax } = input;

  switch (hourlyRateRange) {
    case 'under70':
      return hourlyRate < 70;
    case '70to200':
      return hourlyRate >= 70 && hourlyRate <= 200;
    case '200to300':
      return hourlyRate >= 200 && hourlyRate <= 300;
    case 'custom': {
      if (customHourlyRateMin != null && hourlyRate < customHourlyRateMin) {
        return false;
      }
      if (customHourlyRateMax != null && hourlyRate > customHourlyRateMax) {
        return false;
      }
      return true;
    }
    case 'all':
    default:
      return true;
  }
}

function isValidCoordinate(latitude?: number | null, longitude?: number | null): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceKmBetween(
  fromLatitude?: number | null,
  fromLongitude?: number | null,
  toLatitude?: number | null,
  toLongitude?: number | null,
): number | null {
  if (
    !isValidCoordinate(fromLatitude, fromLongitude) ||
    !isValidCoordinate(toLatitude, toLongitude)
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(toLatitude! - fromLatitude!);
  const deltaLongitude = toRadians(toLongitude! - fromLongitude!);
  const fromLatRad = toRadians(fromLatitude!);
  const toLatRad = toRadians(toLatitude!);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusKm * c * 10) / 10;
}

function categoryRatesRecord(value: Profile['categoryRates']): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([category, rate]) => [category, Number(rate)] as const)
      .filter(([category, rate]) => category.trim() && Number.isFinite(rate) && rate >= 0),
  );
}

function routeMatrixRows(body: string): Record<string, unknown>[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (row): row is Record<string, unknown> => row != null && typeof row === 'object',
      );
    }
    return parsed != null && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : [];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function routeDurationSeconds(value: unknown): number | null {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(String(value));
  if (!match) return null;
  const seconds = Math.round(Number(match[1]));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function withRoadRouteMetrics(
  results: DiscoverMateResult[],
  input: DiscoverSearchInput,
): Promise<DiscoverMateResult[]> {
  if (!isValidCoordinate(input.latitude, input.longitude)) return results;
  // Unit tests intentionally stay deterministic and network-free.
  if (env.NODE_ENV === 'test') return results;

  const routable = results.filter((result) => isValidCoordinate(result.latitude, result.longitude));
  const withoutStraightLineFallback = results.map((result) => ({
    ...result,
    distanceKm: null,
    travelDurationSeconds: null,
  }));
  if (!env.GOOGLE_ROUTES_API_KEY || routable.length === 0) {
    return withoutStraightLineFallback;
  }

  const metricByUserId = new Map<number, { distanceKm: number; travelDurationSeconds: number }>();
  try {
    // TRAFFIC_AWARE_OPTIMAL Route Matrix requests are capped at 100 elements.
    for (let offset = 0; offset < routable.length; offset += 100) {
      const chunk = routable.slice(offset, offset + 100);
      const response = await fetch(
        'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
            'X-Goog-FieldMask':
              'originIndex,destinationIndex,distanceMeters,duration,condition,status',
          },
          body: JSON.stringify({
            origins: [
              {
                waypoint: {
                  location: {
                    latLng: {
                      latitude: input.latitude,
                      longitude: input.longitude,
                    },
                  },
                },
              },
            ],
            destinations: chunk.map((result) => ({
              waypoint: {
                location: {
                  latLng: {
                    latitude: result.latitude,
                    longitude: result.longitude,
                  },
                },
              },
            })),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`Google Routes status ${response.status}`);
      const rows = routeMatrixRows(await response.text());
      for (const row of rows) {
        if (row.condition !== 'ROUTE_EXISTS') continue;
        const destinationIndex = Number(row.destinationIndex);
        const meters = Number(row.distanceMeters);
        const seconds = routeDurationSeconds(row.duration);
        const result = chunk[destinationIndex];
        if (result && Number.isFinite(meters) && meters >= 0 && seconds != null) {
          metricByUserId.set(result.userId, {
            distanceKm: Math.round((meters / 1000) * 10) / 10,
            travelDurationSeconds: seconds,
          });
        }
      }
    }
  } catch (error) {
    logger.warn(`Google road-distance lookup failed: ${String(error)}`);
  }

  return withoutStraightLineFallback.map((result) => ({
    ...result,
    ...(metricByUserId.get(result.userId) ?? {}),
  }));
}

function matchesVehiclePreferences(profile: Profile, input: DiscoverSearchInput): boolean {
  const vehicles = new Set((profile.vehicles ?? []).map((value) => value.toLowerCase()));
  const hasTwoWheeler = vehicles.has('bike') || vehicles.has('scooter');
  const hasFourWheeler = vehicles.has('car');
  const required = input.requiredVehicleTypes ?? [];
  if (
    required.length &&
    !required.some((type) => (type === 'two_wheeler' ? hasTwoWheeler : hasFourWheeler))
  )
    return false;
  return input.drivingVehicleType === 'two_wheeler'
    ? profile.canRideBike === true
    : input.drivingVehicleType === 'four_wheeler'
      ? profile.canDriveCar === true
      : true;
}

function canonicalCategoryRatesRecord(value: Profile['categoryRates']): Record<string, number> {
  return Object.fromEntries(
    Object.entries(categoryRatesRecord(value)).map(([category, rate]) => [
      canonicalCategoryLabel(category),
      rate,
    ]),
  );
}

function rateForCategory(profile: Profile, category?: string | null): number | null {
  const rates = categoryRatesRecord(profile.categoryRates);
  const selectedCategory = category?.trim().toLowerCase();
  if (selectedCategory) {
    const variants = new Set([
      selectedCategory,
      ...getCategoryMatchVariants(category ?? '').map((value) => value.toLowerCase()),
    ]);
    const matched = Object.entries(rates).find(([key]) => variants.has(key.trim().toLowerCase()));
    if (matched) {
      return matched[1];
    }
  }

  const firstProfileCategory = profile.categories[0]?.trim().toLowerCase();
  if (firstProfileCategory) {
    const matched = Object.entries(rates).find(
      ([key]) => key.trim().toLowerCase() === firstProfileCategory,
    );
    if (matched) {
      return matched[1];
    }
  }

  return profile.hourlyRate;
}

function isDiscoverableProfile(profile: Profile): boolean {
  const name = profile.fullName?.trim() ?? '';
  if (!name || name.toLowerCase() === 'anonymous' || PLACEHOLDER_NAME.test(name)) {
    return false;
  }
  if (!getProfileAvatar(profile)) {
    return false;
  }
  if (!profile.categories?.length) {
    return false;
  }
  return true;
}

function isInstantDiscoverableProfile(profile: Profile): boolean {
  const name = profile.fullName?.trim() ?? '';
  return Boolean(name && name.toLowerCase() !== 'anonymous' && !PLACEHOLDER_NAME.test(name));
}

function getProfileAvatar(profile: Profile): string | null {
  const profilePhoto = profile.profilePhoto?.trim();
  return profilePhoto || null;
}

function hasUserProvidedEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && !/^phone_\d+@tenure\.app$/.test(normalized));
}

function matchesTextQuery(profile: Profile, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return true;
  }

  // Search by user name prefix only (e.g. "r" -> "Ravi", "ri" -> "Rishith").
  return profile.fullName.trim().toLowerCase().startsWith(q);
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase();
}

function matchesLanguages(profile: Profile, selectedLanguages?: string[]): boolean {
  const selected = (selectedLanguages ?? []).map(normalizeLanguage).filter(Boolean);
  if (!selected.length) {
    return true;
  }

  const profileLanguages = new Set(
    (profile.languages ?? []).map(normalizeLanguage).filter(Boolean),
  );
  return selected.some((language) => profileLanguages.has(language));
}

function displayCategory(profile: Profile, requestedCategory?: string | null): string {
  const requested = requestedCategory?.trim().toLowerCase();
  if (requested) {
    return (
      profile.categories.find((category) => profileMatchesCategory([category], requested)) ??
      profile.categories[0] ??
      'Support'
    );
  }

  return profile.categories[0] ?? 'Support';
}

function toDiscoverMate(
  profile: PublicProfile,
  input: DiscoverSearchInput = {},
  savedMateIds = new Set<number>(),
  activeSessionByUserId = new Map<number, SessionStatus>(),
  ratingBySupporterId = new Map<number, { average: number; count: number }>(),
): DiscoverMateResult {
  const category = canonicalCategoryLabel(displayCategory(profile, input.category));
  const categories = [...new Set(profile.categories.map(canonicalCategoryLabel))];
  const gallery = (profile.gallery ?? []).filter(
    (uri) => !uri.toLowerCase().includes('live-photo'),
  );
  const livePhotoAdded =
    Boolean(profile.livePhotoUrl?.trim()) ||
    gallery.some((uri) => uri.toLowerCase().includes('live-photo'));
  const activeSessionStatus = activeSessionByUserId.get(profile.userId) ?? null;
  const rating = ratingBySupporterId.get(profile.userId) ?? { average: 0, count: 0 };
  return {
    userId: profile.userId,
    tenureId: profile.user?.tenureId ?? 'Not assigned',
    fullName: profile.fullName,
    profilePhoto: getProfileAvatar(profile),
    location: profile.location,
    district: profile.district,
    state: profile.state,
    gender: profile.gender,
    dob: profile.dob ?? new Date('2000-01-01'),
    isMinor: profile.isMinor,
    category,
    categories,
    hourlyRate: rateForCategory(profile, category),
    rating: rating.average,
    ratingCount: rating.count,
    categoryRates: canonicalCategoryRatesRecord(profile.categoryRates),
    languages: profile.languages ?? [],
    vehicles: profile.vehicles ?? [],
    canRideBike: profile.canRideBike,
    canDriveCar: profile.canDriveCar,
    about: profile.about,
    professions: profile.professions ?? [],
    qualification: profile.qualification,
    bloodGroup: profile.bloodGroup,
    availableDays: profile.availableDays ?? [],
    availableTimeRange: profile.availableTimeRange,
    weeklyAvailability: profile.weeklyAvailability,
    bestTime: profile.bestTime,
    aadhaarVerified: profile.aadhaarVerified,
    phoneAdded: Boolean(profile.user?.phone?.trim()),
    emailAdded: hasUserProvidedEmail(profile.user?.email),
    livePhotoAdded,
    gallery,
    instagram: profile.instagram,
    facebook: profile.facebook,
    youtube: profile.youtube,
    website: profile.website,
    contactEmail: profile.contactEmail,
    whatsappUsername: profile.whatsappUsername,
    whatsappNumber: profile.whatsappNumber,
    instantAvailable: profile.instantAvailable,
    instantAvailableUntil: profile.instantAvailableUntil,
    instantCategories: profile.instantCategories ?? [],
    instantNote: profile.instantNote,
    distanceKm: distanceKmBetween(
      input.latitude,
      input.longitude,
      profile.latitude,
      profile.longitude,
    ),
    travelDurationSeconds: null,
    latitude: profile.latitude,
    longitude: profile.longitude,
    saved: savedMateIds.has(profile.userId),
    busyToday: activeSessionStatus != null,
    activeSessionStatus,
    scheduledMeets: [],
  };
}

async function ratingsForSupporters(
  supporterIds: number[],
): Promise<Map<number, { average: number; count: number }>> {
  if (!supporterIds.length) return new Map();
  // Unit-test database doubles created before rating aggregation do not expose
  // Prisma's groupBy method. Real Prisma clients always do; returning an empty
  // aggregate keeps those older callers compatible without affecting runtime.
  if (typeof prisma.session.groupBy !== 'function') return new Map();
  const rows = await prisma.session.groupBy({
    by: ['receiverId'],
    where: { receiverId: { in: supporterIds }, senderRating: { not: null } },
    _avg: { senderRating: true },
    _count: { senderRating: true },
  });
  return new Map(
    rows.map((row) => [
      row.receiverId,
      { average: row._avg.senderRating ?? 0, count: row._count.senderRating },
    ]),
  );
}

async function savedMateIdsForUser(userId: number): Promise<Set<number>> {
  const rows = await prisma.savedMate.findMany({
    where: { userId },
    select: { mateUserId: true },
  });
  return new Set(rows.map((row) => row.mateUserId));
}

async function activeSessionStatusesForUsers(
  userIds: number[],
): Promise<Map<number, SessionStatus>> {
  if (!userIds.length) {
    return new Map();
  }

  const sessions = await prisma.session.findMany({
    where: {
      status: { not: SessionStatus.ENDED },
      OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }],
    },
    select: {
      senderId: true,
      receiverId: true,
      status: true,
    },
  });

  const statuses = new Map<number, SessionStatus>();
  for (const session of sessions) {
    if (userIds.includes(session.senderId)) {
      statuses.set(session.senderId, session.status);
    }
    if (userIds.includes(session.receiverId)) {
      statuses.set(session.receiverId, session.status);
    }
  }

  const confirmedReadyNowRequests = await prisma.request.findMany({
    where: {
      instantBooking: true,
      status: RequestStatus.CONFIRMED,
      OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }],
      AND: [
        {
          OR: [{ session: null }, { session: { is: { status: { not: SessionStatus.ENDED } } } }],
        },
      ],
    },
    select: { senderId: true, receiverId: true },
  });
  for (const request of confirmedReadyNowRequests) {
    if (userIds.includes(request.senderId) && !statuses.has(request.senderId)) {
      statuses.set(request.senderId, SessionStatus.RUNNING);
    }
    if (userIds.includes(request.receiverId) && !statuses.has(request.receiverId)) {
      statuses.set(request.receiverId, SessionStatus.RUNNING);
    }
  }
  return statuses;
}

export class DiscoverService {
  public static async searchMates(
    currentUserId: number,
    input: DiscoverSearchInput,
  ): Promise<DiscoverMateResult[]> {
    const blocks = await prisma.block.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });
    const blockedUserIds = blocks.map((b) =>
      b.blockerId === currentUserId ? b.blockedId : b.blockerId,
    );

    const where: Prisma.ProfileWhereInput = {
      isMinor: false,
      userId: {
        notIn: [currentUserId, ...blockedUserIds],
      },
      profileVisibility: true,
      categories: { isEmpty: false },
      user: {
        isActive: true,
      },
    };

    if (input.district && input.district !== 'all') {
      where.district = input.district;
    }

    const profiles = await prisma.profile.findMany({
      where,
      include: { user: { select: { tenureId: true, email: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const savedMateIds = await savedMateIdsForUser(currentUserId);
    const filteredProfiles = profiles
      .filter(isDiscoverableProfile)
      .filter((profile) => profileMatchesCategory(profile.categories, input.category))
      .filter((profile) => matchesLanguages(profile, input.languages))
      .filter((profile) => matchesTextQuery(profile, input.q ?? ''))
      .filter((profile) => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter((profile) => matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange))
      .filter((profile) => matchesHourlyRate(rateForCategory(profile, input.category), input))
      .filter((profile) => matchesVehiclePreferences(profile, input));
    const activeSessionByUserId = await activeSessionStatusesForUsers(
      filteredProfiles.map((profile) => profile.userId),
    );
    const ratingBySupporterId = await ratingsForSupporters(
      filteredProfiles.map((profile) => profile.userId),
    );

    const results = await withRoadRouteMetrics(
      filteredProfiles.map((profile) =>
        toDiscoverMate(profile, input, savedMateIds, activeSessionByUserId, ratingBySupporterId),
      ),
      input,
    );
    return results.sort(
      (a, b) =>
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
    );
  }

  public static async getMatePublicProfile(
    currentUserId: number,
    targetUserId: number,
  ): Promise<DiscoverMateResult | null> {
    if (currentUserId === targetUserId) {
      return null;
    }

    const isBlocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });
    if (isBlocked) {
      return null;
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: targetUserId },
      include: { user: true },
    });

    if (
      !profile ||
      !profile.user?.isActive ||
      !(
        (profile.profileVisibility && isDiscoverableProfile(profile)) ||
        (!profile.isMinor &&
          profile.readyNowEnabled &&
          profile.instantAvailable &&
          profile.instantAvailableUntil &&
          profile.instantAvailableUntil > new Date() &&
          isInstantDiscoverableProfile(profile))
      )
    ) {
      return null;
    }

    const savedMateIds = await savedMateIdsForUser(currentUserId);
    const activeSessionByUserId = await activeSessionStatusesForUsers([targetUserId]);
    const ratingBySupporterId = await ratingsForSupporters([targetUserId]);
    const result = toDiscoverMate(
      profile,
      {},
      savedMateIds,
      activeSessionByUserId,
      ratingBySupporterId,
    );
    const scheduledMeets = await prisma.request.findMany({
      where: {
        OR: [{ senderId: targetUserId }, { receiverId: targetUserId }],
        instantBooking: false,
        status: RequestStatus.CONFIRMED,
        fromDateTime: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        AND: [
          {
            OR: [{ session: null }, { session: { is: { status: { not: SessionStatus.ENDED } } } }],
          },
        ],
      },
      orderBy: { fromDateTime: 'asc' },
      select: { fromDateTime: true, toDateTime: true },
    });
    return {
      ...result,
      scheduledMeets: scheduledMeets.map((meet) => ({
        fromDateTime: meet.fromDateTime.toISOString(),
        toDateTime: meet.toDateTime?.toISOString() ?? null,
      })),
    };
  }

  public static async getInstantMates(
    currentUserId: number,
    input: DiscoverSearchInput,
  ): Promise<DiscoverMateResult[]> {
    const blocks = await prisma.block.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });
    const blockedUserIds = blocks.map((b) =>
      b.blockerId === currentUserId ? b.blockedId : b.blockerId,
    );

    const where: Prisma.ProfileWhereInput = {
      isMinor: false,
      userId: {
        notIn: [currentUserId, ...blockedUserIds],
      },
      instantAvailable: true,
      readyNowEnabled: true,
      instantAvailableUntil: { gt: new Date() },
      user: {
        isActive: true,
      },
    };

    if (input.district && input.district !== 'all') {
      where.district = input.district;
    }

    const profiles = await prisma.profile.findMany({
      where,
      include: { user: { select: { tenureId: true, email: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const savedMateIds = await savedMateIdsForUser(currentUserId);
    const filteredProfiles = profiles
      .filter(isInstantDiscoverableProfile)
      .filter((profile) => profileMatchesCategory(profile.categories, input.category))
      .filter((profile) => matchesLanguages(profile, input.languages))
      .filter((profile) => matchesTextQuery(profile, input.q ?? ''))
      .filter((profile) => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter((profile) => matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange))
      .filter((profile) => matchesHourlyRate(rateForCategory(profile, input.category), input))
      .filter((profile) => matchesVehiclePreferences(profile, input));
    const activeSessionByUserId = await activeSessionStatusesForUsers(
      filteredProfiles.map((profile) => profile.userId),
    );
    const ratingBySupporterId = await ratingsForSupporters(
      filteredProfiles.map((profile) => profile.userId),
    );

    const results = await withRoadRouteMetrics(
      filteredProfiles.map((profile) =>
        toDiscoverMate(profile, input, savedMateIds, activeSessionByUserId, ratingBySupporterId),
      ),
      input,
    );
    return results.sort(
      (a, b) =>
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
    );
  }

  public static async listSavedMates(
    currentUserId: number,
    input: DiscoverSearchInput,
  ): Promise<DiscoverMateResult[]> {
    const savedRows = await prisma.savedMate.findMany({
      where: { userId: currentUserId },
      select: { mateUserId: true },
      orderBy: { createdAt: 'desc' },
    });
    const savedMateIds = new Set(savedRows.map((row) => row.mateUserId));
    if (!savedMateIds.size) {
      return [];
    }

    const profiles = await prisma.profile.findMany({
      where: {
        userId: { in: [...savedMateIds] },
        profileVisibility: true,
        categories: { isEmpty: false },
        user: { isActive: true },
      },
      include: { user: { select: { tenureId: true, email: true, phone: true } } },
    });
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    const filteredProfiles = savedRows
      .map((row) => profileByUserId.get(row.mateUserId))
      .filter((profile): profile is PublicProfileWithUser => Boolean(profile))
      .filter(isDiscoverableProfile)
      .filter((profile) => profileMatchesCategory(profile.categories, input.category))
      .filter((profile) => matchesLanguages(profile, input.languages))
      .filter((profile) => matchesVehiclePreferences(profile, input));
    const activeSessionByUserId = await activeSessionStatusesForUsers(
      filteredProfiles.map((profile) => profile.userId),
    );
    const ratingBySupporterId = await ratingsForSupporters(
      filteredProfiles.map((profile) => profile.userId),
    );

    return withRoadRouteMetrics(
      filteredProfiles.map((profile) =>
        toDiscoverMate(profile, input, savedMateIds, activeSessionByUserId, ratingBySupporterId),
      ),
      input,
    );
  }

  public static async saveMate(currentUserId: number, mateUserId: number): Promise<void> {
    if (currentUserId === mateUserId) {
      throw new AppError('You cannot save your own profile.', 400);
    }

    await prisma.savedMate.upsert({
      where: {
        userId_mateUserId: {
          userId: currentUserId,
          mateUserId,
        },
      },
      update: {},
      create: {
        userId: currentUserId,
        mateUserId,
      },
    });
  }

  public static async unsaveMate(currentUserId: number, mateUserId: number): Promise<void> {
    await prisma.savedMate.deleteMany({
      where: {
        userId: currentUserId,
        mateUserId,
      },
    });
  }
}
