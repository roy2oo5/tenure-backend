ALTER TABLE "profiles"
ADD COLUMN "is_minor" BOOLEAN NOT NULL DEFAULT false;

UPDATE "profiles"
SET "is_minor" = "dob" > (CURRENT_DATE - INTERVAL '18 years')
WHERE "dob" IS NOT NULL;
