ALTER TABLE "requests"
ADD COLUMN "needed_mate_vehicle_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "offered_requester_vehicle_type" TEXT;

ALTER TABLE "requests"
ADD CONSTRAINT "requests_offered_requester_vehicle_type_check"
CHECK (
  "offered_requester_vehicle_type" IS NULL OR
  "offered_requester_vehicle_type" IN ('two_wheeler', 'four_wheeler')
);
