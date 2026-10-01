-- Align stored profile/request labels with the canonical category list.
UPDATE "profiles"
SET "categories" = ARRAY(
  SELECT DISTINCT CASE lower(value)
    WHEN 'newcomer & consultant support' THEN 'Consultant Support'
    WHEN 'newcomer/orientation support' THEN 'Consultant Support'
    WHEN 'holiday & travel support' THEN 'Travel Support'
    WHEN 'holiday/travel support' THEN 'Travel Support'
    WHEN 'home clean-up support' THEN 'Clean-up Support'
    ELSE value
  END
  FROM unnest("profiles"."categories") AS value
  WHERE lower(value) NOT IN ('vlogging support', 'vlog mate', 'vlogging')
);

UPDATE "profiles"
SET "instant_categories" = ARRAY(
  SELECT DISTINCT CASE lower(value)
    WHEN 'newcomer & consultant support' THEN 'Consultant Support'
    WHEN 'newcomer/orientation support' THEN 'Consultant Support'
    WHEN 'holiday & travel support' THEN 'Travel Support'
    WHEN 'holiday/travel support' THEN 'Travel Support'
    WHEN 'home clean-up support' THEN 'Clean-up Support'
    ELSE value
  END
  FROM unnest("profiles"."instant_categories") AS value
  WHERE lower(value) NOT IN ('vlogging support', 'vlog mate', 'vlogging')
);

UPDATE "profiles"
SET "category_rates" = COALESCE((
  SELECT jsonb_object_agg(
    CASE lower(key)
      WHEN 'newcomer & consultant support' THEN 'Consultant Support'
      WHEN 'newcomer/orientation support' THEN 'Consultant Support'
      WHEN 'holiday & travel support' THEN 'Travel Support'
      WHEN 'holiday/travel support' THEN 'Travel Support'
      WHEN 'home clean-up support' THEN 'Clean-up Support'
      ELSE key
    END,
    value
  )
  FROM jsonb_each("profiles"."category_rates"::jsonb)
  WHERE lower(key) NOT IN ('vlogging support', 'vlog mate', 'vlogging')
), '{}'::jsonb)
WHERE "category_rates" IS NOT NULL
  AND jsonb_typeof("category_rates"::jsonb) = 'object';

UPDATE "requests"
SET "category_label" = CASE lower("category_label")
  WHEN 'newcomer & consultant support' THEN 'Consultant Support'
  WHEN 'newcomer/orientation support' THEN 'Consultant Support'
  WHEN 'holiday & travel support' THEN 'Travel Support'
  WHEN 'holiday/travel support' THEN 'Travel Support'
  WHEN 'home clean-up support' THEN 'Clean-up Support'
  ELSE "category_label"
END;

INSERT INTO "categories" ("name", "description", "created_at", "updated_at") VALUES
  ('Support Based on Request', 'Providing customised assistance for any specific need or activity requested by the user.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Hospital Support', 'Helping someone visit a doctor or hospital, wait with them, understand medical information, or communicate with healthcare staff.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Shopping Support', 'Accompanying someone while shopping, helping them select items, carry bags, or providing company.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Day Activity Support', 'Joining someone for activities such as walking, visiting museums, having coffee, or watching a movie.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Gym, Yoga & Jogging Support', 'Joining someone for workouts, yoga, or jogging and providing motivation or exercise assistance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Pub, Party & Event Support', 'Accompanying someone to parties, pubs, celebrations, or social events so they feel comfortable and safe.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Friendly & Emotional Support', 'Listening, talking, offering encouragement, or spending time together as a supportive friend.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Consultant Support', 'Providing practical information, advice, and guidance based on the user''s needs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Tech & Education Support', 'Helping someone with technology, learning, or educational needs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Driving Support', 'Providing transportation, assisting with directions, or acting as a sober driver.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Sports Support', 'Playing sports together, practising, or accompanying someone to watch a sporting event.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Travel Support', 'Helping someone plan a trip, make bookings, organise an itinerary, or travel as a companion.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Clean-up Support', 'Helping someone clean, tidy, organise, or maintain their home.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description", "updated_at" = CURRENT_TIMESTAMP;

DELETE FROM "categories"
WHERE "name" NOT IN (
  'Support Based on Request',
  'Hospital Support',
  'Shopping Support',
  'Day Activity Support',
  'Gym, Yoga & Jogging Support',
  'Pub, Party & Event Support',
  'Friendly & Emotional Support',
  'Consultant Support',
  'Tech & Education Support',
  'Driving Support',
  'Sports Support',
  'Travel Support',
  'Clean-up Support'
);
