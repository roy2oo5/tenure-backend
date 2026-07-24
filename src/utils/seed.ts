import { prisma } from '../config/database';
import { logger } from './logger';

export const seedCategories = async () => {
  const categoriesToSeed = [
    {
      name: 'Hospital support',
      description: 'Helping someone go to the doctor, wait with them, or translate medical info.',
    },
    {
      name: 'Shopping support',
      description: 'Going along to help carry bags, choose items, or just keep company.',
    },
    {
      name: 'Gym support',
      description: 'Working out together, spotting weights, or motivating each other.',
    },
    {
      name: 'Home clean-up support',
      description: 'Helping with cleaning, tidying, or organising the house.',
    },
    {
      name: 'Driving support',
      description: 'Giving someone a lift, helping with directions, or being a sober driver.',
    },
    {
      name: 'Sports support',
      description: 'Playing a sport together or going to watch games as a buddy.',
    },
    {
      name: 'Pub/party/event support',
      description: "Accompanying someone to social gatherings so they don't feel alone.",
    },
    {
      name: 'Holiday/travel support',
      description: 'Helping plan trips, booking, or going along as a companion.',
    },
    {
      name: 'Day activity support',
      description: 'Joining someone for daytime activities like walks, museums, or coffee, movie .',
    },
    {
      name: 'Friendly/emotional support',
      description: 'Being a friend to talk to, offering encouragement, or just hanging out.',
    },
    {
      name: 'Newcomer/orientation support',
      description: 'Helping someone who just moved to the city find their way around, learn the transport system, find shops, etc.',
    },
  ];

  try {
    for (const cat of categoriesToSeed) {
      await prisma.category.upsert({
        where: { name: cat.name },
        update: { description: cat.description },
        create: cat,
      });
    }
    logger.info('🌱 Categories seeded successfully');
  } catch (error: any) {
    logger.error(`❌ Categories seeding failed: ${error.message}`);
  }
};
