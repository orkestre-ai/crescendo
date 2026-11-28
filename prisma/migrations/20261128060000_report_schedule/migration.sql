-- A report definition can run itself once a day after a time in
-- America/Toronto, and a run records whether a person or the schedule
-- started it. Additive only.
ALTER TABLE "ReportDefinition" ADD COLUMN "scheduleDailyAt" TEXT;

ALTER TABLE "ReportRun" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'manual';
