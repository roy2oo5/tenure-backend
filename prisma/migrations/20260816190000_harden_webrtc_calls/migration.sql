ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'BUSY';
ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "calls"
  ADD COLUMN IF NOT EXISTS "end_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "calls_caller_id_created_at_idx"
  ON "calls"("caller_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "calls_receiver_id_created_at_idx"
  ON "calls"("receiver_id", "created_at" DESC);
