ALTER TABLE "requests"
ADD COLUMN "instant_booking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "response_deadline_at" TIMESTAMP(3);
