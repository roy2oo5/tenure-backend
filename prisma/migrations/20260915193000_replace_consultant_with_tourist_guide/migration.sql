-- Rename the retired display category while preserving profiles, rates, and history.
UPDATE "profiles"
SET "categories" = ARRAY(
  SELECT CASE
    WHEN lower(value) IN ('consultant support', 'newcomer & consultant support', 'newcomer/orientation support')
      THEN 'Tourist Guide Support'
    ELSE value
  END
  FROM unnest("profiles"."categories") AS value
);

UPDATE "profiles"
SET "instant_categories" = ARRAY(
  SELECT CASE
    WHEN lower(value) IN ('consultant support', 'newcomer & consultant support', 'newcomer/orientation support')
      THEN 'Tourist Guide Support'
    ELSE value
  END
  FROM unnest("profiles"."instant_categories") AS value
);

UPDATE "profiles"
SET "category_rates" = COALESCE((
  SELECT jsonb_object_agg(
    CASE
      WHEN lower(key) IN ('consultant support', 'newcomer & consultant support', 'newcomer/orientation support')
        THEN 'Tourist Guide Support'
      ELSE key
    END,
    value
  )
  FROM jsonb_each("profiles"."category_rates"::jsonb)
), '{}'::jsonb)
WHERE "category_rates" IS NOT NULL
  AND jsonb_typeof("category_rates"::jsonb) = 'object';

UPDATE "requests"
SET "category_label" = 'Tourist Guide Support'
WHERE lower("category_label") IN (
  'consultant support', 'newcomer & consultant support', 'newcomer/orientation support'
);

INSERT INTO "categories" ("name", "description", "created_at", "updated_at") VALUES
  ('Tourist Guide Support', 'Providing local guidance, sightseeing help, and travel assistance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description", "updated_at" = CURRENT_TIMESTAMP;

DELETE FROM "categories"
WHERE lower("name") IN ('consultant support', 'newcomer & consultant support', 'newcomer/orientation support');
