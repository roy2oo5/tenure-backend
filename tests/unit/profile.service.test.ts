import { ProfileService } from '@/services/profile.service';
import { prisma } from '@/config/database';

vi.mock('@/config/database', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/utils/tenure-id', () => ({
  generateUniqueTenureId: vi.fn().mockResolvedValue('AB123'),
}));

const extendedProfileDefaults = {
  about: null,
  vibes: [],
  professions: [],
  vehicles: [],
  interests: [],
  availableDays: [],
  availableTimeRange: null,
  bestTime: null,
  comfortPreferredPlaces: null,
  comfortTravelRange: null,
  comfortWith: null,
  comfortNotWith: null,
  aadhaarVerified: false,
  aadhaarMasked: null,
  gallery: [],
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
};

describe('ProfileService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertProfile', () => {
    it('should generate a new tenureId if profile does not exist', async () => {
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
        id: 'profile-id-123',
        userId: 'user-id-123',
        tenureId: 'AB123',
        ...mockProfileData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.profile.findUnique as any).mockResolvedValue(null);
      (prisma.profile.upsert as any).mockResolvedValue(mockResponse);

      const result = await ProfileService.upsertProfile('user-id-123', mockProfileData);

      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
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
      expect(prisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
        update: {
          ...mockProfileData,
          categories: ['Travel Mate'],
          hourlyRate: 25.0,
          ...extendedProfileDefaults,
        },
        create: {
          userId: 'user-id-123',
          tenureId: 'AB123',
          ...mockProfileData,
          categories: ['Travel Mate'],
          hourlyRate: 25.0,
          ...extendedProfileDefaults,
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should reuse the existing tenureId if profile already exists', async () => {
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
        categories: null,
        hourlyRate: null,
      };

      const expectedFormattedData = {
        ...mockProfileData,
        categories: [],
        hourlyRate: null,
        ...extendedProfileDefaults,
      };

      const mockResponse = {
        id: 'profile-id-123',
        userId: 'user-id-123',
        tenureId: 'XY789',
        ...expectedFormattedData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.profile.findUnique as any).mockResolvedValue({ tenureId: 'XY789' });
      (prisma.profile.upsert as any).mockResolvedValue(mockResponse);

      const result = await ProfileService.upsertProfile('user-id-123', mockProfileData);

      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
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
      expect(prisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
        update: expectedFormattedData,
        create: {
          userId: 'user-id-123',
          tenureId: 'XY789',
          ...expectedFormattedData,
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProfile', () => {
    it('should call prisma.profile.findUnique with correct arguments', async () => {
      const mockResponse = {
        id: 'profile-id-123',
        userId: 'user-id-123',
        tenureId: 'XY789',
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

      const result = await ProfileService.getProfile('user-id-123');

      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
