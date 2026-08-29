ALTER TABLE "profiles"
ADD COLUMN "upi_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "default_upi_id" TEXT;
