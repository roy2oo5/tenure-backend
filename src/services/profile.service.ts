import { prisma } from '../config/database';
import { Profile } from '@prisma/client';
import { generateUniqueTenureId } from '../utils/tenure-id';

export class ProfileService {
  /**
   * Upsert a user profile (create if not exists, update if exists)
   */
  public static async upsertProfile(
    userId: string,
    data: {
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
    }
  ): Promise<Profile> {
    const formattedData = {
      ...data,
      categories: data.categories || [],
      hourlyRate: data.hourlyRate !== undefined ? data.hourlyRate : null,
    };

    // Check if profile exists to determine if we need to generate a new tenureId
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: { tenureId: true }
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
