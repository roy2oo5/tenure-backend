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
  qualification?: string | null;
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
    .replace(
      /(?:\u0393\u00c7\u00f4|\u00e2\u20ac\u201c|\u2013|\u2014)/g,
      '-'
    )
    .replace(
      /(?:\u0393\u00c7\u00d6|\u00e2\u20ac\u2122|\u2019|\u2018|\u202f|\u00a0)/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
    .replace(/\b(am|pm)\b/g, marker => marker.toUpperCase());

  return normalized || null;
}

export class ProfileService {
  /**
   * Upsert a user profile (create if not exists, update if exists)
   */
  public static async upsertProfile(
    userId: string,
    data: ProfileUpsertInput
  ): Promise<Profile> {
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: {
        tenureId: true,
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

    const instantAvailable =
      data.instantAvailable !== undefined
        ? data.instantAvailable
        : existingProfile?.instantAvailable ?? false;
    const instantAvailableUntil =
      data.instantAvailableUntil !== undefined
        ? data.instantAvailableUntil
        : existingProfile?.instantAvailableUntil ?? null;
    const instantCategories =
      data.instantCategories !== undefined
        ? data.instantCategories ?? []
        : existingProfile?.instantCategories ?? [];
    const instantNote =
      data.instantNote !== undefined
        ? data.instantNote?.trim() || null
        : existingProfile?.instantNote ?? null;

    const profileVisibility =
      data.profileVisibility !== undefined
        ? data.profileVisibility
        : existingProfile?.profileVisibility ?? true;
    const notifyRequests =
      data.notifyRequests !== undefined
        ? data.notifyRequests
        : existingProfile?.notifyRequests ?? true;
    const notifyChat =
      data.notifyChat !== undefined
        ? data.notifyChat
        : existingProfile?.notifyChat ?? true;
    const notifyReminders =
      data.notifyReminders !== undefined
        ? data.notifyReminders
        : existingProfile?.notifyReminders ?? true;
    const emergencyName =
      data.emergencyName !== undefined
        ? data.emergencyName?.trim() || null
        : existingProfile?.emergencyName ?? null;
    const emergencyPhone =
      data.emergencyPhone !== undefined
        ? data.emergencyPhone?.trim() || null
        : existingProfile?.emergencyPhone ?? null;
    const emergencyRelation =
      data.emergencyRelation !== undefined
        ? data.emergencyRelation?.trim() || null
        : existingProfile?.emergencyRelation ?? null;

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
      qualification: data.qualification?.trim() || null,
      vehicles: data.vehicles ?? [],
      interests: data.interests ?? [],
      availableDays: data.availableDays ?? [],
      availableTimeRange: normalizeTimeRange(data.availableTimeRange),
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
