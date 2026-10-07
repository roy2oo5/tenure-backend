ALTER TABLE "categories"
ADD COLUMN "instructions" TEXT;

UPDATE "categories"
SET "instructions" = CASE "name"
  WHEN 'Hospital Support' THEN $instructions$Helping someone with hospital or doctor-related needs based on their request, such as visiting a clinic or hospital, waiting with them, helping them understand general medical information, communicating with healthcare staff, or providing companionship during the visit.

Note: Support will be provided based on the user's specific request. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Shopping Support' THEN $instructions$Helping someone with shopping based on their request, such as visiting malls, supermarkets, markets, clothing stores, or other shops, helping carry items, compare products, or complete purchases.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Day Activity Support' THEN $instructions$Accompanying someone for day-to-day activities based on their request, such as visiting a park, café, movie, local place, appointment, personal work, or other daytime activities.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Gym, Yoga & Jogging Support' THEN $instructions$Accompanying someone for fitness activities based on their request, such as going to the gym, attending yoga sessions, jogging, walking, stretching, or other general fitness activities.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Pub, Party & Event Support' THEN $instructions$Accompanying someone to a pub, party, celebration, function, concert, gathering, or other event based on their request, and staying with them for companionship and general support.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Friendly & Emotional Support' THEN $instructions$Providing friendly companionship and emotional support based on the user's request, such as spending time together, listening, talking, accompanying them somewhere, or being present when they do not want to be alone.

Note: This is companionship and general emotional support, not professional counselling, therapy, or medical care. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Tourist Guide Support' THEN $instructions$Helping someone explore a city or area based on their request, such as visiting tourist attractions, local landmarks, markets, restaurants, cultural places, or other places of interest.

Note: The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Tech & Education Support' THEN $instructions$Helping someone with technology or educational activities based on their request, such as basic device assistance, using apps or websites, filling online forms, learning digital tools, studying, practising skills, or understanding general educational topics.

Note: Support is limited to general assistance and guidance. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Driving Support' THEN $instructions$Helping someone with driving-related needs based on their request, such as accompanying them while travelling, helping with local routes, providing general driving assistance, or supporting them during a journey where permitted.

Note: Any driving must follow applicable licence, vehicle, insurance, and local legal requirements. Pickup and drop locations can be based on the user's request.$instructions$
  WHEN 'Sports Support' THEN $instructions$Accompanying or participating with someone in sports and recreational activities based on their request, such as badminton, cricket, football, cycling, swimming, indoor games, or other suitable activities.

Note: The activity depends on the user's request and mutual agreement. The meeting place should normally be the drop place. If the user requests and agrees to another drop location, they can be dropped there.$instructions$
  WHEN 'Travel Support' THEN $instructions$Accompanying someone during local or long-distance travel based on their request, such as travelling by bus, train, flight, taxi, or other transport, helping with luggage, navigation, check-in, or general travel assistance.

Note: Pickup, destination, and drop location should be agreed upon in advance and can be based on the user's travel request.$instructions$
  WHEN 'Clean-up Support' THEN $instructions$Helping someone with basic clean-up activities based on their request, such as organizing a room, arranging items, cleaning after an activity or event, or assisting with simple household or workspace clean-up.

Note: The exact work should be agreed upon before starting. Hazardous, unsafe, specialist, or professional cleaning work is not included.$instructions$
  ELSE "instructions"
END
WHERE "name" IN (
  'Hospital Support',
  'Shopping Support',
  'Day Activity Support',
  'Gym, Yoga & Jogging Support',
  'Pub, Party & Event Support',
  'Friendly & Emotional Support',
  'Tourist Guide Support',
  'Tech & Education Support',
  'Driving Support',
  'Sports Support',
  'Travel Support',
  'Clean-up Support'
);
