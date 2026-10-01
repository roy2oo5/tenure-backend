ALTER TABLE "messages"
  ADD COLUMN "view_once" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "opened_at" TIMESTAMP(3);

CREATE INDEX "messages_view_once_opened_at_idx"
  ON "messages"("view_once", "opened_at");
