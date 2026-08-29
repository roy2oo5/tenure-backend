ALTER TABLE "reports"
ADD COLUMN "admin_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "resolved_at" TIMESTAMP(3);

CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_sessions_username_expires_at_idx"
ON "admin_sessions"("username", "expires_at");

CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT NOT NULL DEFAULT 'The app is currently under maintenance. Please try again later.',
    "min_ios_version" TEXT NOT NULL DEFAULT '2.4.1',
    "min_android_version" TEXT NOT NULL DEFAULT '2.4.0',
    "app_store_url" TEXT NOT NULL DEFAULT '',
    "play_store_url" TEXT NOT NULL DEFAULT '',
    "force_update" BOOLEAN NOT NULL DEFAULT false,
    "require_aadhaar" BOOLEAN NOT NULL DEFAULT true,
    "require_live_photo" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP);
