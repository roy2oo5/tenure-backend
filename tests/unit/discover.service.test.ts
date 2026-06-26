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
});
