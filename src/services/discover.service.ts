import { Prisma, Profile } from '@prisma/client';
import { prisma } from '../config/database';
import { profileMatchesCategory } from '../constants/mate-categories';

export type DiscoverSearchInput = {
  q?: string;
  district?: string | null;
  category?: string | null;
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
  categories: string[];
  hourlyRate: number | null;
  languages: string[];
  about: string | null;
  aadhaarVerified: boolean;
  gallery: string[];
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  website: string | null;
  instantAvailable: boolean;
  instantAvailableUntil: Date | null;
  instantCategories: string[];
  instantNote: string | null;
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

function matchesHourlyRate(
  rate: number | null,
  input: DiscoverSearchInput,
): boolean {
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
  return profile.gallery.find(uri => uri.trim()) ?? null;
}

function matchesTextQuery(profile: Profile, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return true;
  }

  // Search by user name prefix only (e.g. "r" -> "Ravi", "ri" -> "Rishith").
  return profile.fullName.trim().toLowerCase().startsWith(q);
}

function toDiscoverMate(profile: Profile): DiscoverMateResult {
  return {
    userId: profile.userId,
    tenureId: profile.tenureId,
    fullName: profile.fullName,
    profilePhoto: getProfileAvatar(profile),
    district: profile.district,
    state: profile.state,
    gender: profile.gender,
    dob: profile.dob ?? new Date('2000-01-01'),
    categories: profile.categories,
    hourlyRate: profile.hourlyRate,
    languages: profile.languages,
    about: profile.about,
    aadhaarVerified: profile.aadhaarVerified,
    gallery: profile.gallery,
    instagram: profile.instagram,
    facebook: profile.facebook,
    youtube: profile.youtube,
    website: profile.website,
    instantAvailable: profile.instantAvailable,
    instantAvailableUntil: profile.instantAvailableUntil,
    instantCategories: profile.instantCategories,
    instantNote: profile.instantNote,
  };
}

export class DiscoverService {
  public static async searchMates(
    currentUserId: string,
    input: DiscoverSearchInput,
  ): Promise<DiscoverMateResult[]> {
    const where: Prisma.ProfileWhereInput = {
      userId: { not: currentUserId },
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
      orderBy: { updatedAt: 'desc' },
    });

    return profiles
      .filter(isDiscoverableProfile)
      .filter(profile => profileMatchesCategory(profile.categories, input.category))
      .filter(profile => matchesTextQuery(profile, input.q ?? ''))
      .filter(profile => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter(profile =>
        matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange),
      )
      .filter(profile => matchesHourlyRate(profile.hourlyRate, input))
      .map(toDiscoverMate);
  }

  public static async getMatePublicProfile(
    currentUserId: string,
    targetUserId: string,
  ): Promise<DiscoverMateResult | null> {
    if (currentUserId === targetUserId) {
      return null;
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: targetUserId },
      include: { user: true },
    });

    if (!profile || !profile.user?.isActive || !isDiscoverableProfile(profile)) {
      return null;
    }

    return toDiscoverMate(profile);
  }

  public static async getInstantMates(
    currentUserId: string,
    input: DiscoverSearchInput,
  ): Promise<DiscoverMateResult[]> {
    const where: Prisma.ProfileWhereInput = {
      userId: { not: currentUserId },
      instantAvailable: true,
      instantAvailableUntil: { gt: new Date() },
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
      orderBy: [{ instantAvailableUntil: 'asc' }, { updatedAt: 'desc' }],
    });

    return profiles
      .filter(isDiscoverableProfile)
      .filter(profile => profileMatchesCategory(profile.categories, input.category))
      .filter(profile => matchesTextQuery(profile, input.q ?? ''))
      .filter(profile => matchesGender(profile.gender, input.gender ?? 'all'))
      .filter(profile =>
        matchesAgeRange(profile.dob ?? new Date('2000-01-01'), input.ageRange),
      )
      .filter(profile => matchesHourlyRate(profile.hourlyRate, input))
      .map(toDiscoverMate);
  }
}
