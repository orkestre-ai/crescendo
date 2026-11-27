-- Reports get their own model, effort and input cap, beside chat, explore
-- and recommendations.
ALTER TABLE "AppSettings" ADD COLUMN "aiReportsProvider" TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE "AppSettings" ADD COLUMN "aiReportsModelId" TEXT NOT NULL DEFAULT 'claude-sonnet-5-5';
ALTER TABLE "AppSettings" ADD COLUMN "aiReportsEffort" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "AppSettings" ADD COLUMN "aiReportsMaxContext" INTEGER NOT NULL DEFAULT 150000;

CREATE TYPE "ReportRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'RECHECKING', 'COMPLETED', 'NEEDS_ATTENTION', 'STOPPED', 'CANCELLED', 'FAILED');

-- A report a person can start: a prompt, its inputs, its tools and its guards.
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '[]',
    "enabledTools" TEXT[],
    "maxSteps" INTEGER NOT NULL DEFAULT 500,
    "maxMinutes" INTEGER NOT NULL DEFAULT 120,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- One run of a report. The snapshot copies the prompt, tools and guards at
-- start, so editing a definition never changes a past run.
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT,
    "definitionSnapshot" JSONB NOT NULL,
    "status" "ReportRunStatus" NOT NULL DEFAULT 'QUEUED',
    "statusReason" TEXT,
    "title" TEXT NOT NULL,
    "preparedBy" TEXT,
    "inputs" JSONB NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "usage" JSONB,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "redactedEmailCount" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT,
    "currencyCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- Every data tool call of a run, with its full result and how the second
-- run of it compared.
CREATE TABLE "ReportQuery" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sampled" BOOLEAN NOT NULL DEFAULT false,
    "samplingNote" TEXT,
    "recheck" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportQuery_pkey" PRIMARY KEY ("id")
);

-- The ledger: tables and figures computed by Crescendo from saved queries.
CREATE TABLE "ReportDataset" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportFigure" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "text" TEXT,
    "display" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "queryKeys" TEXT[],
    "recheckStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "previousValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportFigure_pkey" PRIMARY KEY ("id")
);

-- The activity log of a run: tool calls, notes, warnings and status changes.
CREATE TABLE "ReportEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportDefinition_key_key" ON "ReportDefinition"("key");
CREATE INDEX "ReportDefinition_enabled_sortOrder_idx" ON "ReportDefinition"("enabled", "sortOrder");
CREATE INDEX "ReportRun_status_idx" ON "ReportRun"("status");
CREATE INDEX "ReportRun_createdAt_idx" ON "ReportRun"("createdAt");
CREATE UNIQUE INDEX "ReportQuery_runId_key_key" ON "ReportQuery"("runId", "key");
CREATE UNIQUE INDEX "ReportDataset_runId_key_key" ON "ReportDataset"("runId", "key");
CREATE UNIQUE INDEX "ReportFigure_runId_key_key" ON "ReportFigure"("runId", "key");
CREATE UNIQUE INDEX "ReportEvent_runId_seq_key" ON "ReportEvent"("runId", "seq");

-- Deleting a definition keeps its runs. Deleting a run takes its queries,
-- datasets, figures and events with it; nothing else deletes a run.
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportQuery" ADD CONSTRAINT "ReportQuery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportDataset" ADD CONSTRAINT "ReportDataset_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportFigure" ADD CONSTRAINT "ReportFigure_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
