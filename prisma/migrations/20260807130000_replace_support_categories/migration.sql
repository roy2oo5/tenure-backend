-- Translate category labels already stored on user profiles.
UPDATE "profiles"
SET "categories" = ARRAY(
  SELECT DISTINCT CASE value
    WHEN 'Open to any' THEN 'Support Based on Request'
    WHEN 'Hospital support' THEN 'Hospital Support'
    WHEN 'Shopping support' THEN 'Shopping Support'
    WHEN 'Gym support' THEN 'Gym, Yoga & Jogging Support'
    WHEN 'Home clean-up support' THEN 'Home Clean-up Support'
    WHEN 'Driving support' THEN 'Driving Support'
    WHEN 'Sports support' THEN 'Sports Support'
    WHEN 'Pub/party/event support' THEN 'Pub, Party & Event Support'
    WHEN 'Holiday/travel support' THEN 'Holiday & Travel Support'
    WHEN 'Day activity support' THEN 'Day Activity Support'
    WHEN 'Friendly/emotional support' THEN 'Friendly & Emotional Support'
    WHEN 'Newcomer/orientation support' THEN 'Newcomer & Consultant Support'
    ELSE value
  END
  FROM unnest("profiles"."categories") AS value
);

UPDATE "profiles"
SET "instant_categories" = ARRAY(
  SELECT DISTINCT CASE value
    WHEN 'Open to any' THEN 'Support Based on Request'
    WHEN 'Hospital support' THEN 'Hospital Support'
    WHEN 'Shopping support' THEN 'Shopping Support'
    WHEN 'Gym support' THEN 'Gym, Yoga & Jogging Support'
    WHEN 'Home clean-up support' THEN 'Home Clean-up Support'
    WHEN 'Driving support' THEN 'Driving Support'
    WHEN 'Sports support' THEN 'Sports Support'
    WHEN 'Pub/party/event support' THEN 'Pub, Party & Event Support'
    WHEN 'Holiday/travel support' THEN 'Holiday & Travel Support'
    WHEN 'Day activity support' THEN 'Day Activity Support'
    WHEN 'Friendly/emotional support' THEN 'Friendly & Emotional Support'
    WHEN 'Newcomer/orientation support' THEN 'Newcomer & Consultant Support'
    ELSE value
  END
  FROM unnest("profiles"."instant_categories") AS value
);

UPDATE "profiles"
SET "category_rates" = (
  SELECT jsonb_object_agg(
    CASE key
      WHEN 'Hospital support' THEN 'Hospital Support'
      WHEN 'Shopping support' THEN 'Shopping Support'
      WHEN 'Gym support' THEN 'Gym, Yoga & Jogging Support'
      WHEN 'Home clean-up support' THEN 'Home Clean-up Support'
      WHEN 'Driving support' THEN 'Driving Support'
      WHEN 'Sports support' THEN 'Sports Support'
      WHEN 'Pub/party/event support' THEN 'Pub, Party & Event Support'
      WHEN 'Holiday/travel support' THEN 'Holiday & Travel Support'
      WHEN 'Day activity support' THEN 'Day Activity Support'
      WHEN 'Friendly/emotional support' THEN 'Friendly & Emotional Support'
      WHEN 'Newcomer/orientation support' THEN 'Newcomer & Consultant Support'
      ELSE key
    END,
    value
  )
  FROM jsonb_each("profiles"."category_rates"::jsonb)
)
WHERE "category_rates" IS NOT NULL
  AND jsonb_typeof("category_rates"::jsonb) = 'object';

INSERT INTO "categories" ("name", "description", "created_at", "updated_at") VALUES
  ('Support Based on Request', 'Providing customised assistance for any specific need or activity requested by the user.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Hospital Support', 'Helping someone visit a doctor or hospital, wait with them, understand medical information, or communicate with healthcare staff.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Shopping Support', 'Accompanying someone while shopping, helping them select items, carry bags, or providing company.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Gym, Yoga & Jogging Support', 'Joining someone for workouts, yoga, or jogging and providing motivation or exercise assistance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Home Clean-up Support', 'Helping someone clean, tidy, organise, or maintain their home.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Driving Support', 'Providing transportation, assisting with directions, or acting as a sober driver.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Sports Support', 'Playing sports together, practising, or accompanying someone to watch a sporting event.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Pub, Party & Event Support', 'Accompanying someone to parties, pubs, celebrations, or social events so they feel comfortable and safe.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Holiday & Travel Support', 'Helping someone plan a trip, make bookings, organise an itinerary, or travel as a companion.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Day Activity Support', 'Joining someone for activities such as walking, visiting museums, having coffee, or watching a movie.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Friendly & Emotional Support', 'Listening, talking, offering encouragement, or spending time together as a supportive friend.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Newcomer & Consultant Support', 'Helping newcomers settle into a city and providing practical information, advice, and guidance based on their needs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Vlogging Support', 'Helping someone plan, record, present, or manage content for travel, lifestyle, or activity vlogs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description", "updated_at" = CURRENT_TIMESTAMP;

DELETE FROM "categories"
WHERE "name" NOT IN (
  'Support Based on Request',
  'Hospital Support',
  'Shopping Support',
  'Gym, Yoga & Jogging Support',
  'Home Clean-up Support',
  'Driving Support',
  'Sports Support',
  'Pub, Party & Event Support',
  'Holiday & Travel Support',
  'Day Activity Support',
  'Friendly & Emotional Support',
  'Newcomer & Consultant Support',
  'Vlogging Support'
);
