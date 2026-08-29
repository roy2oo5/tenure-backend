ALTER TABLE "sessions"
  ADD COLUMN "sender_rating" INTEGER,
  ADD COLUMN "sender_review" TEXT,
  ADD COLUMN "sender_rated_at" TIMESTAMP(3),
  ADD COLUMN "receiver_rating" INTEGER,
  ADD COLUMN "receiver_review" TEXT,
  ADD COLUMN "receiver_rated_at" TIMESTAMP(3),
  ADD COLUMN "payment_completed_by" INTEGER,
  ADD COLUMN "payment_upi_id" TEXT,
  ADD COLUMN "payment_completed_at" TIMESTAMP(3);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_sender_rating_check"
  CHECK ("sender_rating" IS NULL OR "sender_rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "sessions_receiver_rating_check"
  CHECK ("receiver_rating" IS NULL OR "receiver_rating" BETWEEN 1 AND 5);
