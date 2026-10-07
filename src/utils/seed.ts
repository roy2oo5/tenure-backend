import { prisma } from '../config/database';
import { logger } from './logger';

export const seedCategories = async () => {
  const categoriesToSeed = [
    {
      name: 'Support Based on Request',
      description:
        'Providing customised assistance for any specific need or activity requested by the user.',
      instructions:
        'Describe the specific support you need, including the activity, location, timing, and any important requirements. Choose a supporter whose skills and availability match your request.',
    },
    {
      name: 'Hospital Support',
      description:
        'Helping someone visit a doctor or hospital, wait with them, understand medical information, or communicate with healthcare staff.',
      instructions: `Helping someone with hospital or doctor-related needs based on their request, such as visiting a clinic or hospital, waiting with them, helping them understand general medical information, communicating with healthcare staff, or providing companionship during the visit.

Note: Support will be provided based on the user's specific request. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Shopping Support',
      description:
        'Accompanying someone while shopping, helping them select items, carry bags, or providing company.',
      instructions: `Helping someone with shopping based on their request, such as visiting malls, supermarkets, markets, clothing stores, or other shops, helping carry items, compare products, or complete purchases.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Day Activity Support',
      description:
        'Joining someone for activities such as walking, visiting museums, having coffee, or watching a movie.',
      instructions: `Accompanying someone for day-to-day activities based on their request, such as visiting a park, café, movie, local place, appointment, personal work, or other daytime activities.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Gym, Yoga & Jogging Support',
      description:
        'Joining someone for workouts, yoga, or jogging and providing motivation or exercise assistance.',
      instructions: `Accompanying someone for fitness activities based on their request, such as going to the gym, attending yoga sessions, jogging, walking, stretching, or other general fitness activities.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Pub, Party & Event Support',
      description:
        'Accompanying someone to parties, pubs, celebrations, or social events so they feel comfortable and safe.',
      instructions: `Accompanying someone to a pub, party, celebration, function, concert, gathering, or other event based on their request, and staying with them for companionship and general support.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Friendly & Emotional Support',
      description:
        'Listening, talking, offering encouragement, or spending time together as a supportive friend.',
      instructions: `Providing friendly companionship and emotional support based on the user's request, such as spending time together, listening, talking, accompanying them somewhere, or being present when they do not want to be alone.

Note: This is companionship and general emotional support, not professional counselling, therapy, or medical care. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Tourist Guide Support',
      description:
        'Providing practical information, advice, and guidance based on the user’s needs.',
      instructions: `Helping someone explore a city or area based on their request, such as visiting tourist attractions, local landmarks, markets, restaurants, cultural places, or other places of interest.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Tech & Education Support',
      description:
        'Helping someone with technology, learning, or educational needs, such as understanding software, setting up devices, learning new skills, completing assignments, or getting guidance with studies and projects.',
      instructions: `Helping someone with technology or educational activities based on their request, such as basic device assistance, using apps or websites, filling online forms, learning digital tools, studying, practising skills, or understanding general educational topics.

Note: Support is limited to general assistance and guidance. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Driving Support',
      description:
        'Providing transportation, assisting with directions, or acting as a sober driver.',
      instructions: `Helping someone with driving-related needs based on their request, such as accompanying them while travelling, helping with local routes, providing general driving assistance, or supporting them during a journey where permitted.

Note: Any driving must follow applicable licence, vehicle, insurance, and local legal requirements. Pickup and drop locations can be based on the user's request.`,
    },
    {
      name: 'Sports Support',
      description:
        'Playing sports together, practising, or accompanying someone to watch a sporting event.',
      instructions: `Accompanying or participating with someone in sports and recreational activities based on their request, such as badminton, cricket, football, cycling, swimming, indoor games, or other suitable activities.

Note: The activity depends on the user's request and mutual agreement. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.`,
    },
    {
      name: 'Travel Support',
      description:
        'Helping someone plan a trip, make bookings, organise an itinerary, or travel as a companion.',
      instructions: `Accompanying someone during local or long-distance travel based on their request, such as travelling by bus, train, flight, taxi, or other transport, helping with luggage, navigation, check-in, or general travel assistance.

Note: Pickup, destination, and drop location should be agreed upon in advance and can be based on the user's travel request.`,
    },
    {
      name: 'Clean-up Support',
      description: 'Helping someone clean, tidy, organise, or maintain their home.',
      instructions: `Helping someone with basic clean-up activities based on their request, such as organizing a room, arranging items, cleaning after an activity or event, or assisting with simple household or workspace clean-up.

Note: The exact work should be agreed upon before starting. Hazardous, unsafe, specialist, or professional cleaning work is not included.`,
    },
  ];

  try {
    await prisma.category.deleteMany({
      where: { name: { notIn: categoriesToSeed.map((category) => category.name) } },
    });
    for (const cat of categoriesToSeed) {
      await prisma.category.upsert({
        where: { name: cat.name },
        update: {
          description: cat.description,
          instructions: cat.instructions,
        },
        create: cat,
      });
    }
    logger.info('🌱 Categories seeded successfully');
  } catch (error: any) {
    logger.error(`❌ Categories seeding failed: ${error.message}`);
  }
  const languagesToSeed = [
    'English',
    'Hindi',
    'Kannada',
    'Tamil',
    'Telugu',
    'Malayalam',
    'Marathi',
    'Bengali',
    'Gujarati',
    'Punjabi',
    'Urdu',
  ];

  try {
    for (const name of languagesToSeed) {
      await prisma.language.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }
    logger.info('Profile languages seeded successfully');
  } catch (error: any) {
    logger.error(`Profile languages seeding failed: ${error.message}`);
  }
};
