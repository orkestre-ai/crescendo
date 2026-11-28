-- The organisation's time zone: when "yesterday" ends, and when daily schedules run.
-- Existing installs keep the time zone that was hard-coded before.
ALTER TABLE "AppSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Toronto';
