import { prisma } from '../config/database';
import { Prisma, Profile } from '@prisma/client';
import { generateUniqueTenureId } from '../utils/tenure-id';
import { AppError } from '../utils/app-error';
import { sendGlobalToAll } from './websocket.service';
import { processAadhaarSecureQR, AadhaarDemographics, matchAadhaarDemographics } from '../utils/aadhaar-qr';

export type ProfileUpsertInput = {
  profilePhoto?: string | null;
  fullName: string;
  dob: Date;
  gender: string;
  location?: string | null;
  country: string;
  state: string;
  district: string;
  pinCode: string;
  latitude?: number | null;
  longitude?: number | null;
  languages: string[];
  categories?: string[] | null;
  hourlyRate?: number | null;
  categoryRates?: Record<string, number> | null;
  about?: string | null;
  vibes?: string[] | null;
  professions?: string[] | null;
  qualification?: string | null;
  bloodGroup?: string | null;
  vehicles?: string[] | null;
  canRideBike?: boolean | null;
  willingRequesterBike?: boolean | null;
  canDriveCar?: boolean | null;
  willingRequesterCar?: boolean | null;
  interests?: string[] | null;
  availableDays?: string[] | null;
  availableTimeRange?: string | null;
  bestTime?: string | null;
  comfortPreferredPlaces?: string | null;
  comfortTravelRange?: string | null;
  comfortWith?: string | null;
  comfortNotWith?: string | null;
  gallery?: string[] | null;
  livePhotoUrl?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  website?: string | null;
  instantAvailable?: boolean;
  instantAvailableUntil?: Date | null;
  instantCategories?: string[] | null;
  instantNote?: string | null;
  profileVisibility?: boolean;
  notifyRequests?: boolean;
  notifyChat?: boolean;
  notifyReminders?: boolean;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
};

function normalizeTimeRange(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/(?:\u0393\u00c7\u00f4|\u00e2\u20ac\u201c|\u2013|\u2014)/g, '-')
    .replace(/(?:\u0393\u00c7\u00d6|\u00e2\u20ac\u2122|\u2019|\u2018|\u202f|\u00a0)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
    .replace(/\b(am|pm)\b/g, (marker) => marker.toUpperCase());

  return normalized || null;
}

function normalizeCategoryRates(
  categories: string[],
  rates?: Record<string, number> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!rates) {
    return Prisma.JsonNull;
  }

  const selectedCategories = new Set(categories.map((category) => category.trim()).filter(Boolean));
  if (!selectedCategories.size || selectedCategories.has('Open to any')) {
    return Prisma.JsonNull;
  }

  const entries = Object.entries(rates)
    .map(([category, rate]) => [category.trim(), Number(rate)] as const)
    .filter(
      ([category, rate]) => selectedCategories.has(category) && Number.isFinite(rate) && rate > 0,
    );

  if (!entries.length) {
    return Prisma.JsonNull;
  }

  return Object.fromEntries(entries);
}

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function maskAadhaar(aadhaarNumber: string): string {
  const digits = aadhaarNumber.replace(/\D/g, '');
  return digits.length >= 4 ? `XXXX XXXX ${digits.slice(-4)}` : 'XXXX XXXX XXXX';
}

export class ProfileService {
  /**
   * Upsert a user profile (create if not exists, update if exists)
   */
  public static async upsertProfile(userId: number, data: ProfileUpsertInput): Promise<Profile> {
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenureId: true },
    });
    if (userRecord && !userRecord.tenureId) {
      const generated = await generateUniqueTenureId();
      await prisma.user.update({
        where: { id: userId },
        data: { tenureId: generated },
      });
    }

    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: {
        aadhaarVerified: true,
        aadhaarMasked: true,
        livePhotoUrl: true,
        instantAvailable: true,
        instantAvailableUntil: true,
        instantCategories: true,
        instantNote: true,
        profileVisibility: true,
        notifyRequests: true,
        notifyChat: true,
        notifyReminders: true,
        emergencyName: true,
        emergencyPhone: true,
        emergencyRelation: true,
      },
    });

    const isMinor = ageFromDob(data.dob) < 18;
    const instantAvailable = isMinor
      ? false
      :
      data.instantAvailable !== undefined
        ? data.instantAvailable
        : (existingProfile?.instantAvailable ?? false);
    const instantAvailableUntil =
      data.instantAvailableUntil !== undefined
        ? data.instantAvailableUntil
        : (existingProfile?.instantAvailableUntil ?? null);
    const instantCategories =
      data.instantCategories !== undefined
        ? (data.instantCategories ?? [])
        : (existingProfile?.instantCategories ?? []);
    const instantNote =
      data.instantNote !== undefined
        ? data.instantNote?.trim() || null
        : (existingProfile?.instantNote ?? null);

    const profileVisibility =
      data.profileVisibility !== undefined
        ? data.profileVisibility
        : (existingProfile?.profileVisibility ?? true);
    const notifyRequests =
      data.notifyRequests !== undefined
        ? data.notifyRequests
        : (existingProfile?.notifyRequests ?? true);
    const notifyChat =
      data.notifyChat !== undefined ? data.notifyChat : (existingProfile?.notifyChat ?? true);
    const notifyReminders =
      data.notifyReminders !== undefined
        ? data.notifyReminders
        : (existingProfile?.notifyReminders ?? true);
    const emergencyName =
      data.emergencyName !== undefined
        ? data.emergencyName?.trim() || null
        : (existingProfile?.emergencyName ?? null);
    const emergencyPhone =
      data.emergencyPhone !== undefined
        ? data.emergencyPhone?.trim() || null
        : (existingProfile?.emergencyPhone ?? null);
    const emergencyRelation =
      data.emergencyRelation !== undefined
        ? data.emergencyRelation?.trim() || null
        : (existingProfile?.emergencyRelation ?? null);

    const formattedData = {
      profilePhoto: data.profilePhoto ?? null,
      fullName: data.fullName,
      dob: data.dob,
      isMinor,
      gender: data.gender,
      location: data.location?.trim() || null,
      country: data.country,
      state: data.state,
      district: data.district,
      pinCode: data.pinCode,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      languages: data.languages,
      categories: isMinor ? [] : (data.categories ?? []),
      hourlyRate: isMinor
        ? null
        : data.hourlyRate !== undefined
          ? data.hourlyRate
          : null,
      categoryRates: isMinor
        ? {}
        : normalizeCategoryRates(data.categories ?? [], data.categoryRates),
      about: data.about ?? null,
      vibes: data.vibes ?? [],
      professions: data.professions ?? [],
      qualification: data.qualification?.trim() || null,
      bloodGroup: data.bloodGroup?.trim() || null,
      vehicles: data.vehicles ?? [],
      canRideBike: data.vehicles?.includes('bike') ? (data.canRideBike ?? null) : null,
      willingRequesterBike: data.vehicles?.includes('bike')
        ? (data.willingRequesterBike ?? null)
        : null,
      canDriveCar: data.vehicles?.includes('car') ? (data.canDriveCar ?? null) : null,
      willingRequesterCar: data.vehicles?.includes('car')
        ? (data.willingRequesterCar ?? null)
        : null,
      interests: data.interests ?? [],
      availableDays: data.availableDays ?? [],
      availableTimeRange: normalizeTimeRange(data.availableTimeRange),
      bestTime: data.bestTime ?? null,
      comfortPreferredPlaces: data.comfortPreferredPlaces ?? null,
      comfortTravelRange: data.comfortTravelRange ?? null,
      comfortWith: data.comfortWith ?? null,
      comfortNotWith: data.comfortNotWith ?? null,
      aadhaarVerified: existingProfile?.aadhaarVerified ?? false,
      aadhaarMasked: existingProfile?.aadhaarMasked ?? null,
      gallery: data.gallery ?? [],
      livePhotoUrl:
        data.livePhotoUrl !== undefined
          ? data.livePhotoUrl?.trim() || null
          : (existingProfile?.livePhotoUrl ?? null),
      instagram: data.instagram ?? null,
      facebook: data.facebook ?? null,
      youtube: data.youtube ?? null,
      website: data.website ?? null,
      instantAvailable,
      instantAvailableUntil: instantAvailable ? instantAvailableUntil : null,
      instantCategories: instantAvailable ? instantCategories : [],
      instantNote: instantAvailable ? instantNote : null,
      profileVisibility,
      notifyRequests,
      notifyChat,
      notifyReminders,
      emergencyName,
      emergencyPhone,
      emergencyRelation,
    };

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: formattedData,
      create: {
        userId,
        ...formattedData,
      },
    });

    const instantFieldsTouched =
      data.instantAvailable !== undefined ||
      data.instantAvailableUntil !== undefined ||
      data.instantCategories !== undefined ||
      data.instantNote !== undefined;

    if (instantFieldsTouched) {
      sendGlobalToAll({
        event: 'instants_updated',
        userId,
        instantAvailable: profile.instantAvailable,
      });
    }

    return profile;
  }

  /**
   * Get a user profile by user ID
   */
  public static async getProfile(userId: number): Promise<Profile | null> {
    return prisma.profile.findUnique({
      where: { userId },
    });
  }

  public static async verifyAadhaar(
    userId: number,
    data: { aadhaarNumber: string; fullName: string; dob: string },
  ): Promise<{ profile: Profile | null; matchType: string; message: string }> {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Profile not found for this user.', 404);
    }
    const digits = data.aadhaarNumber.replace(/\D/g, '');
    if (!/^\d{12}$/.test(digits)) {
      throw new AppError('Enter a valid 12-digit Aadhaar number.', 400);
    }
    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data: {
        aadhaarVerified: true,
        aadhaarMasked: maskAadhaar(digits),
      },
    });
    return {
      profile: updatedProfile,
      matchType: 'full_match',
      message: 'Demo verification successful',
    };
  }

  public static async verifyAadhaarQR(
    userId: number,
    qrBuffer: Buffer,
    uidaiPublicKeyPem?: string,
  ): Promise<{
    profile: Profile;
    demographics: AadhaarDemographics;
    isValidSignature: boolean;
    matchType: string;
    message: string;
  }> {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Profile not found for this user.', 404);
    }

    const result = processAadhaarSecureQR(qrBuffer, uidaiPublicKeyPem);
    if (!result.isValid || !result.data) {
      throw new AppError(`Aadhaar QR Verification failed: ${result.error || 'Invalid QR payload'}`, 400);
    }

    const demographics = result.data;

    // Match extracted Aadhaar details against logged in user profile
    const match = matchAadhaarDemographics(demographics, {
      fullName: profile.fullName,
      dob: profile.dob,
      gender: profile.gender,
    });

    if (match.matchType === 'mismatch') {
      throw new AppError(
        `Aadhaar details do not match user profile. Aadhaar Name: "${demographics.name}", Profile Name: "${profile.fullName}".`,
        400,
      );
    }

    const refId = demographics.referenceId || '000000000000';
    const digits = refId.replace(/\D/g, '');
    const maskedAadhaar = maskAadhaar(digits);

    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data: {
        aadhaarVerified: true,
        aadhaarMasked: maskedAadhaar,
      },
    });

    return {
      profile: updatedProfile,
      demographics,
      isValidSignature: true,
      matchType: match.matchType,
      message: match.message,
    };
  }

  /**
   * Update profile photo for a user
   */
  public static async updateProfilePhoto(userId: number, photoUrl: string): Promise<Profile> {
    const existingProfile = await prisma.profile.findUnique({ where: { userId } });
    if (!existingProfile) {
      return prisma.profile.create({
        data: {
          userId,
          fullName: 'User',
          country: '',
          state: '',
          district: '',
          pinCode: '',
          languages: [],
          profilePhoto: photoUrl,
        },
      });
    }

    return prisma.profile.update({
      where: { userId },
      data: { profilePhoto: photoUrl },
    });
  }

  /**
   * Add a photo to the user's gallery
   */
  public static async addGalleryPhoto(userId: number, photoUrl: string): Promise<Profile> {
    const existingProfile = await prisma.profile.findUnique({ where: { userId } });
    if (!existingProfile) {
      return prisma.profile.create({
        data: {
          userId,
          fullName: 'User',
          country: '',
          state: '',
          district: '',
          pinCode: '',
          languages: [],
          gallery: [photoUrl],
        },
      });
    }

    return prisma.profile.update({
      where: { userId },
      data: {
        gallery: {
          push: photoUrl,
        },
      },
    });
  }

  public static async setLivePhoto(userId: number, photoUrl: string): Promise<Profile> {
    const existingProfile = await prisma.profile.findUnique({ where: { userId } });
    if (!existingProfile) {
      return prisma.profile.create({
        data: {
          userId,
          fullName: 'User',
          country: '',
          state: '',
          district: '',
          pinCode: '',
          languages: [],
          livePhotoUrl: photoUrl,
        },
      });
    }
    return prisma.profile.update({
      where: { userId },
      data: { livePhotoUrl: photoUrl },
    });
  }

  /**
   * Update coordinates for a user profile
   */
  public static async updateLocation(
    userId: number,
    location: { latitude: number; longitude: number },
  ): Promise<Profile> {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Profile not found', 404);
    }
    return prisma.profile.update({
      where: { userId },
      data: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
  }
}
