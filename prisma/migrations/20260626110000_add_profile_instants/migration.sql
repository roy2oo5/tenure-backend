ALTER TABLE "profiles"
ADD COLUMN "instant_available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "instant_available_until" TIMESTAMP(3),
ADD COLUMN "instant_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "instant_note" TEXT;

CREATE INDEX "profiles_instant_available_instant_available_until_idx"
ON "profiles"("instant_available", "instant_available_until");
