ALTER TABLE "requests"
ADD COLUMN "sender_current_latitude" DOUBLE PRECISION,
ADD COLUMN "sender_current_longitude" DOUBLE PRECISION,
ADD COLUMN "sender_location_updated_at" TIMESTAMP(3),
ADD COLUMN "receiver_current_latitude" DOUBLE PRECISION,
ADD COLUMN "receiver_current_longitude" DOUBLE PRECISION,
ADD COLUMN "receiver_location_updated_at" TIMESTAMP(3);
