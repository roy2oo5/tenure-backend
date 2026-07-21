import { Prisma, Profile } from '@prisma/client';
import { prisma } from '../config/database';
import { getCategoryMatchVariants, profileMatchesCategory } from '../constants/mate-categories';
import { AppError } from '../utils/app-error';

export type DiscoverSearchInput = {
  q?: string;
  district?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gender?: 'all' | 'male' | 'female';
  ageRange?: 'all' | 'under30' | '30to45' | 'over45';
  hourlyRateRange?: 'all' | 'under70' | '70to200' | '200to300' | 'custom';
  customHourlyRateMin?: number | null;
  customHourlyRateMax?: number | null;
};

export type DiscoverMateResult = {
  userId: string;
  tenureId: string;
  fullName: string;
  profilePhoto: string | null;
  district: string;
  state: string;
  gender: string | null;
  dob: Date;
  category: string;
  categories: string[];
  hourlyRate: number | null;
  categoryRates: Record<string, number>;
  languages: string[];
  about: string | null;
  professions: string[];
  qualification: string | null;
  bloodGroup: string | null;
  availableDays: string[];
  availableTimeRange: string | null;
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
  instantAvailable: boolean;
  instantAvailableUntil: Date | null;
  instantCategories: string[];
  instantNote: string | null;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  saved: boolean;
};

type PublicProfile = Profile & {
  user?: {
    email?: string | null;
    phone?: string | null;
  } | null;
};

type PublicProfileWithUser = Profile & {
  user: {
    email: string;
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

function getProfileAvatar(profile: Profile): string | null {
  const profilePhoto = profile.profilePhoto?.trim();
  if (profilePhoto) {
    return profilePhoto;
  }
  return profile.gallery.find((uri) => uri.trim()) ?? null;
}

function matchesTextQuery(profile: Profile, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return true;
  }

  // Search by user name prefix only (e.g. "r" -> "Ravi", "ri" -> "Rishith").
  return profile.fullName.trim().toLowerCase().startsWith(q);
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
  savedMateIds = new Set<string>(),
): DiscoverMateResult {
  const category = displayCategory(profile, input.category);
  const livePhotoAdded = profile.gallery.some((uri) =>
    uri.toLowerCase().includes('live-photo'),
  );
  return {
    userId: profile.userId,
    tenureId: profile.tenureId,
    fullName: profile.fullName,
    profilePhoto: getProfileAvatar(profile),
    district: profile.district,
    state: profile.state,
    gender: profile.gender,
    dob: profile.dob ?? new Date('2000-01-01'),
    category,
    categories: profile.categories,
    hourlyRate: rateForCategory(profile, category),
    categoryRates: categoryRatesRecord(profile.categoryRates),
    languages: profile.languages,
    about: profile.about,
    professions: profile.professions,
    qualification: profile.qualification,
    bloodGroup: profile.bloodGroup,
    availableDays: profile.availableDays,
    availableTimeRange: profile.availableTimeRange,
    bestTime: profile.bestTime,
    aadhaarVerified: profile.aadhaarVerified,
    phoneAdded: Boolean(profile.user?.phone?.trim()),
    emailAdded: Boolean(profile.user?.email?.trim()),
    livePhotoAdded,
    gallery: profile.gallery,
    instagram: profile.instagram,
    facebook: profile.facebook,
    youtube: profile.youtube,
    website: profile.website,
    instantAvailable: profile.instantAvailable,
    instantAvailableUntil: profile.instantAvailableUntil,
    instantCategories: profile.instantCategories,
    instantNote: profile.instantNote,
    distanceKm: distanceKmBetween(
      input.latitude,
      input.longitude,
      profile.latitude,
      profile.longitude,
    ),
    latitude: profile.latitude,
    longitude: profile.longitude,
    saved: savedMateIds.has(profile.userId),
  };
}

async function savedMateIdsForUser(userId: string): Promise<Set<string>> {
  const rows = await prisma.savedMate.findMany({
    where: { userId },
    select: { mateUserId: true },
  });
  return new Set(rows.map((row) => row.mateUserId));
}

export class DiscoverService {
  public static async searchMates(
    currentUserId: string,
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
      include: { user: { select: { email: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const savedMateIds = await savedMateIdsForUser(currentUserId);

    return profiles
      .filter(isDiscoverableProfile)
      .filter((profile) => profileMatchesCategory(profile.categories, input.category))
      .filter((profile) => matchesTextQuery(profile, input.q ?? ''))
      .filter((profile) => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter((profile) => matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange))
      .filter((profile) => matchesHourlyRate(rateForCategory(profile, input.category), input))
      .map((profile) => toDiscoverMate(profile, input, savedMateIds));
  }

  public static async getMatePublicProfile(
    currentUserId: string,
    targetUserId: string,
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
      !isDiscoverableProfile(profile) ||
      !profile.profileVisibility
    ) {
      return null;
    }

    const savedMateIds = await savedMateIdsForUser(currentUserId);
    return toDiscoverMate(profile, {}, savedMateIds);
  }

  public static async getInstantMates(
    currentUserId: string,
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
      userId: {
        notIn: [currentUserId, ...blockedUserIds],
      },
      profileVisibility: true,
      instantAvailable: true,
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
      include: { user: { select: { email: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const savedMateIds = await savedMateIdsForUser(currentUserId);

    return profiles
      .filter(isDiscoverableProfile)
      .filter((profile) => profileMatchesCategory(profile.categories, input.category))
      .filter((profile) => matchesTextQuery(profile, input.q ?? ''))
      .filter((profile) => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter((profile) => matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange))
      .filter((profile) => matchesHourlyRate(rateForCategory(profile, input.category), input))
      .map((profile) => toDiscoverMate(profile, input, savedMateIds));
  }

  public static async listSavedMates(
    currentUserId: string,
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
      include: { user: { select: { email: true, phone: true } } },
    });
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    return savedRows
      .map((row) => profileByUserId.get(row.mateUserId))
      .filter((profile): profile is PublicProfileWithUser => Boolean(profile))
      .filter(isDiscoverableProfile)
      .map((profile) => toDiscoverMate(profile, input, savedMateIds));
  }

  public static async saveMate(currentUserId: string, mateUserId: string): Promise<void> {
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

  public static async unsaveMate(currentUserId: string, mateUserId: string): Promise<void> {
    await prisma.savedMate.deleteMany({
      where: {
        userId: currentUserId,
        mateUserId,
      },
    });
  }
}
