-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('RUNNING', 'PAUSE_REQUESTED', 'PAUSED', 'RESUME_REQUESTED', 'ENDED');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "total_elapsed_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_timer_start" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_request_id_key" ON "sessions"("request_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
