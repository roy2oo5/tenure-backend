CREATE TABLE "mutes" (
    "id" SERIAL NOT NULL,
    "muter_id" INTEGER NOT NULL,
    "muted_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mutes_muter_id_muted_user_id_key"
ON "mutes"("muter_id", "muted_user_id");

CREATE INDEX "mutes_muted_user_id_idx" ON "mutes"("muted_user_id");

ALTER TABLE "mutes"
ADD CONSTRAINT "mutes_muter_id_fkey"
FOREIGN KEY ("muter_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mutes"
ADD CONSTRAINT "mutes_muted_user_id_fkey"
FOREIGN KEY ("muted_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
