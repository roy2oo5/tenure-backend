ALTER TABLE "messages"
ADD COLUMN "expires_at" TIMESTAMP(3);

-- Calendar-month retention: Aug 11 15:19 expires Sep 11 15:19. PostgreSQL
-- also clamps end-of-month dates naturally (for example, Jan 31 to Feb 28/29).
UPDATE "messages"
SET "expires_at" = "created_at" + INTERVAL '1 month';

ALTER TABLE "messages"
ALTER COLUMN "expires_at" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month'),
ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "messages_expires_at_idx" ON "messages"("expires_at");
