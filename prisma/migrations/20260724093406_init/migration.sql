-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED_BY_RECEIVER', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('RUNNING', 'PAUSE_REQUESTED', 'PAUSED', 'RESUME_REQUESTED', 'ENDED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "tenure_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "profile_photo" TEXT,
    "full_name" TEXT NOT NULL,
    "dob" DATE,
    "gender" TEXT,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "pin_code" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "languages" TEXT[],
    "categories" TEXT[],
    "hourly_rate" DOUBLE PRECISION,
    "category_rates" JSONB,
    "about" TEXT,
    "vibes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "professions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualification" TEXT,
    "blood_group" TEXT,
    "vehicles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "available_days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "available_time_range" TEXT,
    "best_time" TEXT,
    "comfort_preferred_places" TEXT,
    "comfort_travel_range" TEXT,
    "comfort_with" TEXT,
    "comfort_not_with" TEXT,
    "aadhaar_verified" BOOLEAN NOT NULL DEFAULT false,
    "aadhaar_masked" TEXT,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instagram" TEXT,
    "facebook" TEXT,
    "youtube" TEXT,
    "website" TEXT,
    "instant_available" BOOLEAN NOT NULL DEFAULT false,
    "instant_available_until" TIMESTAMP(3),
    "instant_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instant_note" TEXT,
    "profile_visibility" BOOLEAN NOT NULL DEFAULT true,
    "notify_requests" BOOLEAN NOT NULL DEFAULT true,
    "notify_chat" BOOLEAN NOT NULL DEFAULT true,
    "notify_reminders" BOOLEAN NOT NULL DEFAULT true,
    "emergency_name" TEXT,
    "emergency_phone" TEXT,
    "emergency_relation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "meet_location" TEXT NOT NULL,
    "meet_location_latitude" DOUBLE PRECISION,
    "meet_location_longitude" DOUBLE PRECISION,
    "from_date_time" TIMESTAMP(3) NOT NULL,
    "to_date_time" TIMESTAMP(3),
    "instant_booking" BOOLEAN NOT NULL DEFAULT false,
    "response_deadline_at" TIMESTAMP(3),
    "message" TEXT DEFAULT '',
    "booking_for" TEXT NOT NULL DEFAULT 'self',
    "beneficiary_name" TEXT,
    "beneficiary_phone" TEXT,
    "beneficiary_relation" TEXT,
    "beneficiary_note" TEXT,
    "ready_to_pay_travel_charges" BOOLEAN NOT NULL DEFAULT false,
    "ready_to_pay_tip" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "otp" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" INTEGER,
    "cancellation_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancellation_fee_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "media_url" TEXT,
    "voice_duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "total_elapsed_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_timer_start" TIMESTAMP(3),
    "last_action_by" INTEGER,
    "end_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_mates" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "mate_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_mates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" SERIAL NOT NULL,
    "blocker_id" INTEGER NOT NULL,
    "blocked_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "target_id" INTEGER,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenure_id_key" ON "users"("tenure_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_district_idx" ON "profiles"("district");

-- CreateIndex
CREATE INDEX "profiles_instant_available_instant_available_until_idx" ON "profiles"("instant_available", "instant_available_until");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_request_id_key" ON "sessions"("request_id");

-- CreateIndex
CREATE INDEX "saved_mates_mate_user_id_idx" ON "saved_mates"("mate_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_mates_user_id_mate_user_id_key" ON "saved_mates"("user_id", "mate_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_mates" ADD CONSTRAINT "saved_mates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_mates" ADD CONSTRAINT "saved_mates_mate_user_id_fkey" FOREIGN KEY ("mate_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
