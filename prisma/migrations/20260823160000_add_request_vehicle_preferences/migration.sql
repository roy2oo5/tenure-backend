ALTER TABLE "requests"
ADD COLUMN "needs_mate_vehicle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "offers_requester_vehicle" BOOLEAN NOT NULL DEFAULT false;
