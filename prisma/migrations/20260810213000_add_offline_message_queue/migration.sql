CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "messages"
ADD COLUMN "client_message_id" TEXT,
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_at" TIMESTAMP(3);

UPDATE "messages" SET "client_message_id" = gen_random_uuid()::text
WHERE "client_message_id" IS NULL;

ALTER TABLE "messages" ALTER COLUMN "client_message_id" SET NOT NULL;
CREATE UNIQUE INDEX "messages_client_message_id_key" ON "messages"("client_message_id");

CREATE TABLE "undelivered_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "chat_room_id" TEXT NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "undelivered_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "undelivered_messages_message_id_key"
ON "undelivered_messages"("message_id");
CREATE INDEX "undelivered_messages_recipient_id_created_at_idx"
ON "undelivered_messages"("recipient_id", "created_at");
ALTER TABLE "undelivered_messages" ADD CONSTRAINT "undelivered_messages_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "messages"("client_message_id") ON DELETE CASCADE ON UPDATE CASCADE;
