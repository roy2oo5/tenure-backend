-- Add dedicated phone column for mobile login identity
ALTER TABLE "users" ADD COLUMN "phone" TEXT;

-- Backfill from existing phone_*@tenure.app emails
UPDATE "users"
SET "phone" = SUBSTRING("email" FROM 7 FOR 10)
WHERE "email" LIKE 'phone\_%@tenure.app' ESCAPE '\'
  AND LENGTH(SUBSTRING("email" FROM 7 FOR 10)) = 10;

-- Unique index (multiple NULLs allowed for non-phone accounts)
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
