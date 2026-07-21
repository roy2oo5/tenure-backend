CREATE TABLE "saved_mates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mate_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_mates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_mates_user_id_mate_user_id_key" ON "saved_mates"("user_id", "mate_user_id");
CREATE INDEX "saved_mates_mate_user_id_idx" ON "saved_mates"("mate_user_id");

ALTER TABLE "saved_mates" ADD CONSTRAINT "saved_mates_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_mates" ADD CONSTRAINT "saved_mates_mate_user_id_fkey"
FOREIGN KEY ("mate_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
