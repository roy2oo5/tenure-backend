ALTER TABLE "profiles"
ADD COLUMN "ready_now_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "profiles"
SET "ready_now_enabled" = "instant_available";
