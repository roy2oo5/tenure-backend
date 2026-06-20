-- Store birth date without timezone shifting (date-only).
ALTER TABLE "profiles"
ALTER COLUMN "dob" TYPE DATE
USING CASE
  WHEN "dob" IS NULL THEN NULL
  ELSE "dob"::date
END;

-- Discover filters: district equality + category array overlap.
CREATE INDEX "profiles_district_idx" ON "profiles"("district");
CREATE INDEX "profiles_categories_gin_idx" ON "profiles" USING GIN ("categories");

-- Normalize legacy category labels to canonical ids used by search/onboarding.
UPDATE "profiles"
SET "categories" = (
  SELECT COALESCE(array_agg(DISTINCT mapped), '{}')
  FROM (
    SELECT CASE lower(trim(category))
      WHEN 'shopping mate' THEN 'shopping'
      WHEN 'movie mate' THEN 'movie'
      WHEN 'time pass mate' THEN 'timepass'
      WHEN 'hospital mate' THEN 'hospital'
      WHEN 'talking mate' THEN 'talking'
      WHEN 'travel mate' THEN 'travel'
      WHEN 'travel buddy' THEN 'travel'
      WHEN 'home mate' THEN 'home'
      WHEN 'children care mate' THEN 'children'
      WHEN 'food mate' THEN 'food'
      WHEN 'food buddy' THEN 'food'
      WHEN 'food partner' THEN 'food'
      WHEN 'pub mate' THEN 'pub'
      WHEN 'vlog mate' THEN 'vlog'
      WHEN 'language mate' THEN 'language'
      WHEN 'language partner' THEN 'language'
      WHEN 'day mate' THEN 'day'
      WHEN 'city walk' THEN 'day'
      WHEN 'events' THEN 'day'
      WHEN 'coffee mate' THEN 'talking'
      WHEN 'local guide' THEN 'language'
      WHEN 'study partner' THEN 'other'
      WHEN 'workout mate' THEN 'other'
      WHEN 'project partner' THEN 'other'
      WHEN 'photography buddy' THEN 'vlog'
      WHEN 'pet care buddy' THEN 'children'
      WHEN 'gaming buddy' THEN 'other'
      WHEN 'other' THEN 'other'
      ELSE trim(category)
    END AS mapped
    FROM unnest("categories") AS category
  ) normalized
)
WHERE cardinality("categories") > 0;
