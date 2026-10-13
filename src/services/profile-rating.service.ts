import { prisma } from '../config/database';

export type ProfileRatingAggregate = {
  average: number;
  count: number;
  byGender: {
    all: number | null;
    male: number | null;
    female: number | null;
    other: number | null;
  };
};

type RatingBucket = { total: number; count: number };

const emptyAggregate = (): ProfileRatingAggregate => ({
  average: 0,
  count: 0,
  byGender: { all: null, male: null, female: null, other: null },
});

function reviewerGender(value: string | null): 'male' | 'female' | 'other' | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['m', 'male', 'man'].includes(normalized)) return 'male';
  if (['f', 'female', 'woman'].includes(normalized)) return 'female';
  if (['o', 'other', 'non-binary', 'nonbinary'].includes(normalized)) return 'other';
  return null;
}

function average(bucket: RatingBucket): number | null {
  return bucket.count === 0 ? null : bucket.total / bucket.count;
}

export async function ratingsForProfiles(
  profileUserIds: number[],
): Promise<Map<number, ProfileRatingAggregate>> {
  const uniqueIds = [...new Set(profileUserIds)];
  if (!uniqueIds.length || typeof prisma.session.findMany !== 'function') {
    return new Map();
  }

  const ratings = await prisma.session.findMany({
    where: {
      receiverId: { in: uniqueIds },
      senderRating: { not: null },
    },
    select: { receiverId: true, senderId: true, senderRating: true },
  });
  const submittedRatings = ratings.filter(
    (rating): rating is (typeof ratings)[number] & { senderRating: number } =>
      rating.senderRating != null,
  );
  if (!submittedRatings.length) return new Map();

  const reviewerIds = [...new Set(submittedRatings.map((rating) => rating.senderId))];
  const reviewers = await prisma.profile.findMany({
    where: { userId: { in: reviewerIds } },
    select: { userId: true, gender: true },
  });
  const genderByUserId = new Map(
    reviewers.map((profile) => [profile.userId, reviewerGender(profile.gender)]),
  );

  const buckets = new Map<
    number,
    Record<'all' | 'male' | 'female' | 'other', RatingBucket>
  >();
  for (const rating of submittedRatings) {
    const target = buckets.get(rating.receiverId) ?? {
      all: { total: 0, count: 0 },
      male: { total: 0, count: 0 },
      female: { total: 0, count: 0 },
      other: { total: 0, count: 0 },
    };
    target.all.total += rating.senderRating;
    target.all.count += 1;
    const gender = genderByUserId.get(rating.senderId);
    if (gender) {
      target[gender].total += rating.senderRating;
      target[gender].count += 1;
    }
    buckets.set(rating.receiverId, target);
  }

  return new Map(
    uniqueIds.map((userId) => {
      const bucket = buckets.get(userId);
      if (!bucket) return [userId, emptyAggregate()];
      const all = average(bucket.all);
      return [
        userId,
        {
          average: all ?? 0,
          count: bucket.all.count,
          byGender: {
            all,
            male: average(bucket.male),
            female: average(bucket.female),
            other: average(bucket.other),
          },
        },
      ];
    }),
  );
}

export async function ratingsForProfile(
  profileUserId: number,
): Promise<ProfileRatingAggregate> {
  return (await ratingsForProfiles([profileUserId])).get(profileUserId) ?? emptyAggregate();
}
