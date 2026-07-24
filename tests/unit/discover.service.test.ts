import { DiscoverService } from '@/services/discover.service';
import { prisma } from '@/config/database';

vi.mock('@/config/database', () => ({
  prisma: {
    profile: {
      findMany: vi.fn(),
    },
    block: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    savedMate: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('DiscoverService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('excludes the current user and applies text search', async () => {
    const profiles = [
      {
        userId: 'other-user',
        tenureId: 'AB123',
        fullName: 'Jane Doe',
        profilePhoto: 'https://example.com/a.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        gender: 'Woman',
        dob: new Date('1998-01-01'),
        categories: ['Travel Mate'],
        hourlyRate: 80,
        languages: ['English'],
        about: 'Hello',
        aadhaarVerified: true,
      },
      {
        userId: 'current-user',
        tenureId: 'CD456',
        fullName: 'Me',
        profilePhoto: 'https://example.com/b.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        gender: 'Man',
        dob: new Date('1995-01-01'),
        categories: ['Food Mate'],
        hourlyRate: 50,
        languages: ['English'],
        about: null,
        aadhaarVerified: false,
      },
    ];

    (prisma.profile.findMany as any).mockResolvedValue(profiles);

    const results = await DiscoverService.searchMates('current-user', {
      q: 'jane',
    });

    expect(prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { notIn: ['current-user'] },
        }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].fullName).toBe('Jane Doe');
  });

  it('filters mates by category id or label', async () => {
    const profiles = [
      {
        userId: 'travel-user',
        tenureId: 'AB123',
        fullName: 'Travel User',
        profilePhoto: 'https://example.com/a.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        gender: 'Woman',
        dob: new Date('1998-01-01'),
        categories: ['travel'],
        hourlyRate: 80,
        languages: ['English'],
        about: 'Hello',
        aadhaarVerified: true,
      },
      {
        userId: 'food-user',
        tenureId: 'CD456',
        fullName: 'Food User',
        profilePhoto: 'https://example.com/b.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        gender: 'Man',
        dob: new Date('1995-01-01'),
        categories: ['Food Mate'],
        hourlyRate: 50,
        languages: ['English'],
        about: null,
        aadhaarVerified: false,
      },
    ];

    (prisma.profile.findMany as any).mockResolvedValue(profiles);

    const byId = await DiscoverService.searchMates('current-user', {
      category: 'travel',
    });
    expect(byId).toHaveLength(1);
    expect(byId[0].fullName).toBe('Travel User');

    const byLabel = await DiscoverService.searchMates('current-user', {
      category: 'Food Mate',
    });
    expect(byLabel).toHaveLength(1);
    expect(byLabel[0].fullName).toBe('Food User');
  });

  it('lists instant mates while ready now is enabled without requiring an expiry time', async () => {
    const profiles = [
      {
        userId: 'ready-user',
        tenureId: 'IN123',
        fullName: 'Ready User',
        profilePhoto: 'https://example.com/ready.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        gender: 'Woman',
        dob: new Date('1998-01-01'),
        categories: ['Shopping support'],
        hourlyRate: 120,
        categoryRates: {},
        languages: ['English'],
        about: 'Ready now',
        availableDays: [],
        availableTimeRange: null,
        bestTime: null,
        aadhaarVerified: true,
        gallery: [],
        instagram: null,
        facebook: null,
        youtube: null,
        website: null,
        instantAvailable: true,
        instantAvailableUntil: null,
        instantCategories: [],
        instantNote: null,
      },
    ];

    (prisma.profile.findMany as any).mockResolvedValue(profiles);

    const results = await DiscoverService.getInstantMates('current-user', {});

    expect(prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          instantAvailableUntil: expect.anything(),
        }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].fullName).toBe('Ready User');
    expect(results[0].instantAvailable).toBe(true);
  });

  it('returns distance from the searching user when coordinates are provided', async () => {
    const profiles = [
      {
        userId: 'near-user',
        tenureId: 'NE123',
        fullName: 'Near User',
        profilePhoto: 'https://example.com/near.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        gender: 'Man',
        dob: new Date('1997-01-01'),
        categories: ['Shopping support'],
        hourlyRate: 100,
        categoryRates: {},
        languages: ['English'],
        about: null,
        availableDays: [],
        availableTimeRange: null,
        bestTime: null,
        aadhaarVerified: true,
        gallery: [],
        instagram: null,
        facebook: null,
        youtube: null,
        website: null,
        instantAvailable: false,
        instantAvailableUntil: null,
        instantCategories: [],
        instantNote: null,
      },
    ];

    (prisma.profile.findMany as any).mockResolvedValue(profiles);

    const results = await DiscoverService.searchMates('current-user', {
      latitude: 12.9716,
      longitude: 77.5946,
    });

    expect(results).toHaveLength(1);
    expect(results[0].distanceKm).toBe(0);
  });

  it('keeps live mates discoverable and marks them busy today', async () => {
    const profiles = [
      {
        userId: 'live-user',
        tenureId: 'LV123',
        fullName: 'Live User',
        profilePhoto: 'https://example.com/live.jpg',
        district: 'Bangalore',
        state: 'Karnataka',
        gender: 'Woman',
        dob: new Date('1998-01-01'),
        categories: ['Shopping support'],
        hourlyRate: 120,
        categoryRates: {},
        languages: ['English'],
        about: null,
        professions: [],
        availableDays: [],
        availableTimeRange: null,
        bestTime: null,
        aadhaarVerified: true,
        gallery: [],
        instagram: null,
        facebook: null,
        youtube: null,
        website: null,
        instantAvailable: true,
        instantAvailableUntil: null,
        instantCategories: [],
        instantNote: null,
      },
    ];

    (prisma.profile.findMany as any).mockResolvedValue(profiles);
    (prisma.session.findMany as any).mockResolvedValue([
      {
        senderId: 'someone-else',
        receiverId: 'live-user',
        status: 'RUNNING',
      },
    ]);

    const results = await DiscoverService.searchMates('current-user', {
      q: 'live',
    });

    expect(results).toHaveLength(1);
    expect(results[0].fullName).toBe('Live User');
    expect(results[0].busyToday).toBe(true);
    expect(results[0].activeSessionStatus).toBe('RUNNING');
  });
});
