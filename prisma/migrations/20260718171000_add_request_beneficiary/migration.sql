ALTER TABLE "requests" ADD COLUMN "booking_for" TEXT NOT NULL DEFAULT 'self';
ALTER TABLE "requests" ADD COLUMN "beneficiary_name" TEXT;
ALTER TABLE "requests" ADD COLUMN "beneficiary_phone" TEXT;
ALTER TABLE "requests" ADD COLUMN "beneficiary_relation" TEXT;
ALTER TABLE "requests" ADD COLUMN "beneficiary_note" TEXT;
