-- The organisation a report is for. Reports name it in their title area and
-- in the names of the files they download as.
ALTER TABLE "AppSettings" ADD COLUMN "organizationName" TEXT;

-- Set when a person edits a report definition. A built-in definition that
-- nobody has edited is kept in step with the code; an edited one is left alone.
ALTER TABLE "ReportDefinition" ADD COLUMN "editedAt" TIMESTAMP(3);
