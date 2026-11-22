CREATE TABLE "app_usage_days" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "synced_at" DATETIME NOT NULL,
    CONSTRAINT "app_usage_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "app_usage_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "day_id" INTEGER NOT NULL,
    "package_name" TEXT NOT NULL,
    "app_name" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "ended_at" DATETIME NOT NULL,
    CONSTRAINT "app_usage_sessions_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "app_usage_days" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "app_usage_days_user_id_device_id_date_key" ON "app_usage_days"("user_id", "device_id", "date");
CREATE INDEX "app_usage_days_user_id_date_idx" ON "app_usage_days"("user_id", "date");
CREATE INDEX "app_usage_sessions_day_id_started_at_idx" ON "app_usage_sessions"("day_id", "started_at");
