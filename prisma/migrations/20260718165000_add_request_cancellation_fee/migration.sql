ALTER TABLE "requests" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "requests" ADD COLUMN "cancelled_by_id" TEXT;
ALTER TABLE "requests" ADD COLUMN "cancellation_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "requests" ADD COLUMN "cancellation_fee_reason" TEXT;
