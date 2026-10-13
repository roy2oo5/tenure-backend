import { prisma } from '@/config/database';
import { ratingsForProfile, ratingsForProfiles } from '@/services/profile-rating.service';

vi.mock('@/config/database', () => ({
  prisma: {
    session: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
  },
}));

describe('profile rating aggregates', () => {
  afterEach(() => vi.clearAllMocks());

  it('calculates overall and reviewer-gender averages independently', async () => {
    (prisma.session.findMany as any).mockResolvedValue([
      { receiverId: 10, senderId: 1, senderRating: 3 },
      { receiverId: 10, senderId: 1, senderRating: 5 },
      { receiverId: 10, senderId: 2, senderRating: 4 },
      { receiverId: 10, senderId: 3, senderRating: 2 },
      { receiverId: 10, senderId: 4, senderRating: 5 },
    ]);
    (prisma.profile.findMany as any).mockResolvedValue([
      { userId: 1, gender: 'Male' },
      { userId: 2, gender: 'Woman' },
      { userId: 3, gender: 'Other' },
      { userId: 4, gender: null },
    ]);

    const result = await ratingsForProfile(10);

    expect(result).toEqual({
      average: 3.8,
      count: 5,
      byGender: { all: 3.8, male: 4, female: 4, other: 2 },
    });
  });

  it('returns null category averages when no one in that category rated', async () => {
    (prisma.session.findMany as any).mockResolvedValue([
      { receiverId: 10, senderId: 1, senderRating: 5 },
    ]);
    (prisma.profile.findMany as any).mockResolvedValue([
      { userId: 1, gender: 'Male' },
    ]);

    const result = await ratingsForProfiles([10, 11]);

    expect(result.get(10)?.byGender).toEqual({
      all: 5,
      male: 5,
      female: null,
      other: null,
    });
    expect(result.get(11)?.byGender).toEqual({
      all: null,
      male: null,
      female: null,
      other: null,
    });
  });
});
