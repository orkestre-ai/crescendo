-- A block a report is built from: the shape of data it accepts, a Liquid
-- template and its styles. An edit adds a version and keeps the old row, so
-- a report already sent still draws as it did.
CREATE TABLE "ReportBlockDef" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataSchema" JSONB NOT NULL,
    "template" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "sampleData" JSONB NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'builtin',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "review" JSONB,
    "createdByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportBlockDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportBlockDef_key_version_key" ON "ReportBlockDef"("key", "version");
CREATE INDEX "ReportBlockDef_isCurrent_status_idx" ON "ReportBlockDef"("isCurrent", "status");
