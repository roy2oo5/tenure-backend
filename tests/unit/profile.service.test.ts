import { ProfileService } from '@/services/profile.service';
import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { sendGlobalToAll } from '@/services/websocket.service';

vi.mock('@/config/database', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    request: { findFirst: vi.fn() },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/utils/tenure-id', () => ({
  generateUniqueTenureId: vi.fn().mockResolvedValue('AB123'),
}));

vi.mock('@/services/websocket.service', () => ({
  sendGlobalToAll: vi.fn(),
}));

vi.mock('@/services/ready-now-profile-expiration.service', () => ({
  scheduleReadyNowProfileExpiration: vi.fn(),
}));

const extendedProfileDefaults = {
  isMinor: false,
  about: null,
  location: null,
  categoryRates: Prisma.JsonNull,
  vibes: [],
  professions: [],
  qualification: null,
  bloodGroup: null,
  vehicles: [],
  canRideBike: null,
  willingRequesterBike: null,
  canDriveCar: null,
  willingRequesterCar: null,
  interests: [],
  availableDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  availableTimeRange: '00:00 - 23:00',
  weeklyAvailability: {
    MON: { start: '00:00', end: '23:00' },
    TUE: { start: '00:00', end: '23:00' },
    WED: { start: '00:00', end: '23:00' },
    THU: { start: '00:00', end: '23:00' },
    FRI: { start: '00:00', end: '23:00' },
    SAT: { start: '00:00', end: '23:00' },
    SUN: { start: '00:00', end: '23:00' },
  },
  bestTime: null,
  latitude: null,
  longitude: null,
  comfortPreferredPlaces: null,
  comfortTravelRange: null,
  comfortWith: null,
  comfortNotWith: null,
  aadhaarVerified: false,
  aadhaarMasked: null,
  aadhaarName: null,
  gallery: [],
  livePhotoUrl: null,
  instagram: null,
  facebook: null,
  youtube: null,
  website: null,
  instantAvailable: false,
  instantAvailableUntil: null,
  instantCategories: [],
  instantNote: null,
  profileVisibility: true,
  notifyRequests: true,
  notifyChat: true,
  notifyReminders: true,
  emergencyName: null,
  emergencyPhone: null,
  emergencyRelation: null,
  contactEmail: null,
  defaultUpiId: null,
  readyNowEnabled: false,
  upiIds: [],
  whatsappNumber: null,
  whatsappUsername: null,
};

describe('ProfileService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertProfile', () => {
    it('keeps Ready Now active when public profile visibility is turned off', async () => {
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      const data = {
        fullName: 'Ready User',
        dob: new Date('1995-12-15'),
        gender: 'female',
        languages: ['English'],
        categories: ['Shopping support'],
        profileVisibility: false,
      };
      (prisma.user.findUnique as any).mockResolvedValue({ id: 123, tenureId: 'AB123' });
      (prisma.profile.findUnique as any).mockResolvedValue({
        ...extendedProfileDefaults,
        instantAvailable: true,
        readyNowEnabled: true,
        instantAvailableUntil: expiry,
        profileVisibility: true,
      });
      (prisma.profile.upsert as any).mockResolvedValue({
        ...data,
        instantAvailable: true,
        readyNowEnabled: true,
        instantAvailableUntil: expiry,
      });

      await ProfileService.upsertProfile(123, data);

      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            profileVisibility: false,
            instantAvailable: true,
            readyNowEnabled: true,
            instantAvailableUntil: expiry,
          }),
        }),
      );
    });

    it('allows Ready Now to be enabled while public profile visibility is off', async () => {
      (prisma.profile.findUnique as any).mockResolvedValue({
        profileVisibility: false,
        latitude: 12.97,
        longitude: 77.59,
        instantCategories: [],
        instantNote: null,
      });
      (prisma.request.findFirst as any).mockResolvedValue(null);
      (prisma.profile.update as any).mockImplementation(async ({ data }: any) => data);

      await ProfileService.updateReadyNow(123, { instantAvailable: true });

      expect(prisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instantAvailable: true,
            readyNowEnabled: true,
            instantAvailableUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should upsert profile successfully', async () => {
      const mockProfileData = {
        profilePhoto: 'https://example.com/photo.jpg',
        fullName: 'Jane Doe',
        dob: new Date('1995-12-15'),
        gender: 'female',
        country: 'India',
        state: 'Karnataka',
        district: 'Bangalore',
        pinCode: '560001',
        languages: ['English', 'Hindi'],
        categories: ['Travel Mate'],
        hourlyRate: 25.0,
      };

      const mockResponse = {
        id: 2001,
        userId: 123,
        ...mockProfileData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue({ id: 123, tenureId: null });
      (prisma.user.update as any).mockResolvedValue({ id: 123, tenureId: 'AB123' });
      (prisma.profile.findUnique as any).mockResolvedValue(null);
      (prisma.profile.upsert as any).mockResolvedValue(mockResponse);

      const result = await ProfileService.upsertProfile(123, mockProfileData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        select: { tenureId: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: { tenureId: 'AB123' },
      });
      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 123 },
        select: expect.objectContaining({
          aadhaarVerified: true,
          aadhaarMasked: true,
          aadhaarName: true,
          country: true,
          district: true,
          livePhotoUrl: true,
          instantAvailable: true,
          instantAvailableUntil: true,
          instantCategories: true,
          instantNote: true,
          location: true,
          pinCode: true,
          profileVisibility: true,
          notifyRequests: true,
          notifyChat: true,
          notifyReminders: true,
          emergencyName: true,
          emergencyPhone: true,
          emergencyRelation: true,
          state: true,
          weeklyAvailability: true,
        }),
      });
      expect(prisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 123 },
        update: {
          ...mockProfileData,
          categories: ['Travel Mate'],
          hourlyRate: 25.0,
          ...extendedProfileDefaults,
        },
        create: {
          userId: 123,
          ...mockProfileData,
          categories: ['Travel Mate'],
          hourlyRate: 25.0,
          ...extendedProfileDefaults,
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should store category rates only for selected categories', async () => {
      const mockProfileData = {
        profilePhoto: 'https://example.com/photo.jpg',
        fullName: 'Jane Doe',
        dob: new Date('1995-12-15'),
        gender: 'female',
        country: 'India',
        state: 'Karnataka',
        district: 'Bangalore',
        pinCode: '560001',
        languages: ['English'],
        categories: ['Hospital support', 'Shopping support'],
        hourlyRate: 100,
        categoryRates: {
          'Hospital support': 150,
          'Shopping support': 200,
          'Gym support': 999,
          '': 50,
        },
      };

      const expectedCategoryRates = {
        'Hospital support': 150,
        'Shopping support': 200,
      };
      const mockResponse = {
        id: 2001,
        userId: 123,
        ...mockProfileData,
        categoryRates: expectedCategoryRates,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue({ id: 123, tenureId: 'AB123' });
      (prisma.profile.findUnique as any).mockResolvedValue(null);
      (prisma.profile.upsert as any).mockResolvedValue(mockResponse);

      await ProfileService.upsertProfile(123, mockProfileData);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            categories: ['Hospital support', 'Shopping support'],
            categoryRates: expectedCategoryRates,
          }),
          create: expect.objectContaining({
            categories: ['Hospital support', 'Shopping support'],
            categoryRates: expectedCategoryRates,
          }),
        }),
      );
    });

    it('should reject profile creation for a 16 year old', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-06-20T08:00:00.000Z'));

      const mockProfileData = {
        fullName: 'Young User',
        dob: new Date('2011-06-20'),
        gender: 'female',
        country: 'India',
        state: 'Karnataka',
        district: 'Bangalore',
        pinCode: '560001',
        languages: ['English'],
        categories: ['Open to any'],
        hourlyRate: 100,
        instantAvailable: true,
      };

      (prisma.user.findUnique as any).mockResolvedValue({ id: 123, tenureId: 'AB123' });
      (prisma.profile.findUnique as any).mockResolvedValue(null);

      await expect(ProfileService.upsertProfile(123, mockProfileData)).rejects.toThrow(
        'Age limitation is applicable',
      );
      expect(prisma.profile.upsert).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should broadcast instant updates when ready now changes', async () => {
      const mockProfileData = {
        fullName: 'Ready User',
        dob: new Date('1995-12-15'),
        gender: 'female',
        country: 'India',
        state: 'Karnataka',
        district: 'Bangalore',
        pinCode: '560001',
        languages: ['English'],
        categories: ['Open to any'],
        hourlyRate: 0,
        instantAvailable: true,
      };

      const mockResponse = {
        id: 2003,
        userId: 123,
        ...mockProfileData,
        isMinor: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue({ id: 123, tenureId: 'AB123' });
      (prisma.profile.findUnique as any).mockResolvedValue(null);
      (prisma.profile.upsert as any).mockResolvedValue(mockResponse);

      await ProfileService.upsertProfile(123, mockProfileData);

      expect(sendGlobalToAll).toHaveBeenCalledWith({
        event: 'instants_updated',
        userId: 123,
        instantAvailable: true,
      });
    });
  });

  describe('getProfile', () => {
    it('should call prisma.profile.findUnique with correct arguments', async () => {
      const mockResponse = {
        id: 2001,
        userId: 123,
        fullName: 'Jane Doe',
        dob: new Date('1995-12-15'),
        gender: 'female',
        country: 'India',
        state: 'Karnataka',
        district: 'Bangalore',
        pinCode: '560001',
        languages: ['English'],
        categories: ['Food Mate'],
        hourlyRate: 30.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.profile.findUnique as any).mockResolvedValue(mockResponse);

      const result = await ProfileService.getProfile(123);

      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 123 },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('storeAadhaarImageDetails', () => {
    it('stores OCR fields without marking Aadhaar as verified', async () => {
      const existing = {
        id: 2001,
        userId: 123,
        fullName: 'Vikas',
        aadhaarVerified: false,
      };
      (prisma.profile.findUnique as any).mockResolvedValue(existing);
      (prisma.profile.update as any).mockResolvedValue(existing);

      const result = await ProfileService.storeAadhaarImageDetails(123, {
        name: 'Vikas',
        dob: '1999-01-27',
        gender: 'Male',
        maskedAadhaar: 'XXXX XXXX 0391',
      });

      expect(prisma.profile.update).toHaveBeenCalledWith({
        where: { userId: 123 },
        data: {
          aadhaarImageDetails: expect.objectContaining({
            name: 'Vikas',
            dob: '1999-01-27',
            gender: 'Male',
            maskedAadhaar: 'XXXX XXXX 0391',
            source: 'digilocker_image_ocr',
            verified: false,
            scannedAt: expect.any(String),
          }),
        },
      });
      expect(result.details.verified).toBe(false);
    });
  });
});
