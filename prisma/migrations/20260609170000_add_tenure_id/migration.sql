-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "tenure_id" TEXT;

-- Backfill is unnecessary while profiles table is empty.
-- New profiles receive tenure_id from the API on create.

ALTER TABLE "profiles" ALTER COLUMN "tenure_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_tenure_id_key" ON "profiles"("tenure_id");
