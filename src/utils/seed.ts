import { prisma } from '../config/database';
import { logger } from './logger';

export const seedCategories = async () => {
  const categoriesToSeed = [
    {
      name: 'Support Based on Request',
      description:
        'Providing customised assistance for any specific need or activity requested by the user.',
    },
    {
      name: 'Hospital Support',
      description:
        'Helping someone visit a doctor or hospital, wait with them, understand medical information, or communicate with healthcare staff.',
    },
    {
      name: 'Shopping Support',
      description:
        'Accompanying someone while shopping, helping them select items, carry bags, or providing company.',
    },
    {
      name: 'Gym, Yoga & Jogging Support',
      description:
        'Joining someone for workouts, yoga, or jogging and providing motivation or exercise assistance.',
    },
    {
      name: 'Home Clean-up Support',
      description: 'Helping someone clean, tidy, organise, or maintain their home.',
    },
    {
      name: 'Driving Support',
      description:
        'Providing transportation, assisting with directions, or acting as a sober driver.',
    },
    {
      name: 'Sports Support',
      description:
        'Playing sports together, practising, or accompanying someone to watch a sporting event.',
    },
    {
      name: 'Pub, Party & Event Support',
      description:
        'Accompanying someone to parties, pubs, celebrations, or social events so they feel comfortable and safe.',
    },
    {
      name: 'Holiday & Travel Support',
      description:
        'Helping someone plan a trip, make bookings, organise an itinerary, or travel as a companion.',
    },
    {
      name: 'Day Activity Support',
      description:
        'Joining someone for activities such as walking, visiting museums, having coffee, or watching a movie.',
    },
    {
      name: 'Friendly & Emotional Support',
      description:
        'Listening, talking, offering encouragement, or spending time together as a supportive friend.',
    },
    {
      name: 'Newcomer & Consultant Support',
      description:
        'Helping newcomers settle into a city and providing practical information, advice, and guidance based on their needs.',
    },
    {
      name: 'Vlogging Support',
      description:
        'Helping someone plan, record, present, or manage content for travel, lifestyle, or activity vlogs.',
    },
  ];

  try {
    await prisma.category.deleteMany({
      where: { name: { notIn: categoriesToSeed.map((category) => category.name) } },
    });
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
