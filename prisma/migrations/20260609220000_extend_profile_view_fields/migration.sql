-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "about" TEXT;
ALTER TABLE "profiles" ADD COLUMN "vibes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN "professions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN "vehicles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN "available_days" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN "available_time_range" TEXT;
ALTER TABLE "profiles" ADD COLUMN "best_time" TEXT;
ALTER TABLE "profiles" ADD COLUMN "comfort_preferred_places" TEXT;
ALTER TABLE "profiles" ADD COLUMN "comfort_travel_range" TEXT;
ALTER TABLE "profiles" ADD COLUMN "comfort_with" TEXT;
ALTER TABLE "profiles" ADD COLUMN "comfort_not_with" TEXT;
ALTER TABLE "profiles" ADD COLUMN "aadhaar_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "aadhaar_masked" TEXT;
