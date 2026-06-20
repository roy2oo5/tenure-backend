import { prisma } from '../config/database';
import { Profile } from '@prisma/client';
import { generateUniqueTenureId } from '../utils/tenure-id';

export type ProfileUpsertInput = {
  profilePhoto?: string | null;
  fullName: string;
  dob: Date;
  gender: string;
  country: string;
  state: string;
  district: string;
  pinCode: string;
  languages: string[];
  categories?: string[] | null;
  hourlyRate?: number | null;
  about?: string | null;
  vibes?: string[] | null;
  professions?: string[] | null;
  vehicles?: string[] | null;
  interests?: string[] | null;
  availableDays?: string[] | null;
  availableTimeRange?: string | null;
  bestTime?: string | null;
  comfortPreferredPlaces?: string | null;
  comfortTravelRange?: string | null;
  comfortWith?: string | null;
  comfortNotWith?: string | null;
  aadhaarVerified?: boolean;
  aadhaarMasked?: string | null;
  gallery?: string[] | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  website?: string | null;
};

export class ProfileService {
  /**
   * Upsert a user profile (create if not exists, update if exists)
   */
  public static async upsertProfile(
    userId: string,
    data: ProfileUpsertInput
  ): Promise<Profile> {
    const formattedData = {
      profilePhoto: data.profilePhoto ?? null,
      fullName: data.fullName,
      dob: data.dob,
      gender: data.gender,
      country: data.country,
      state: data.state,
      district: data.district,
      pinCode: data.pinCode,
      languages: data.languages,
      categories: data.categories ?? [],
      hourlyRate: data.hourlyRate !== undefined ? data.hourlyRate : null,
      about: data.about ?? null,
      vibes: data.vibes ?? [],
      professions: data.professions ?? [],
      vehicles: data.vehicles ?? [],
      interests: data.interests ?? [],
      availableDays: data.availableDays ?? [],
      availableTimeRange: data.availableTimeRange ?? null,
      bestTime: data.bestTime ?? null,
      comfortPreferredPlaces: data.comfortPreferredPlaces ?? null,
      comfortTravelRange: data.comfortTravelRange ?? null,
      comfortWith: data.comfortWith ?? null,
      comfortNotWith: data.comfortNotWith ?? null,
      aadhaarVerified: data.aadhaarVerified ?? false,
      aadhaarMasked: data.aadhaarMasked ?? null,
      gallery: data.gallery ?? [],
      instagram: data.instagram ?? null,
      facebook: data.facebook ?? null,
      youtube: data.youtube ?? null,
      website: data.website ?? null,
    };

    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: { tenureId: true },
    });

    const tenureId = existingProfile?.tenureId || (await generateUniqueTenureId());

    return prisma.profile.upsert({
      where: { userId },
      update: formattedData,
      create: {
        userId,
        tenureId,
        ...formattedData,
      },
    });
  }

  /**
   * Get a user profile by user ID
   */
  public static async getProfile(userId: string): Promise<Profile | null> {
    return prisma.profile.findUnique({
      where: { userId },
    });
  }
}
