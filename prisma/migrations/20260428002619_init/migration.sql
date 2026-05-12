-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "RecommendationCategory" AS ENUM ('CONTENT', 'DESIGN', 'PRICING', 'CTA', 'TECHNICAL', 'SOCIAL_PROOF');

-- CreateEnum
CREATE TYPE "RecStatus" AS ENUM ('ACTIVE', 'IMPLEMENTED', 'DISMISSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobPhase" AS ENUM ('SYNCING', 'SCRAPING', 'COLLECTING', 'FILLING_MISSING', 'GENERATING_RECS', 'FINALIZING');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SYNC', 'MANUAL_SCRAPE', 'MANUAL_RECS', 'BACKFILL');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('UNKNOWN', 'CONNECTED', 'DISCONNECTED', 'TESTING');

-- CreateEnum
CREATE TYPE "RefreshSchedule" AS ENUM ('ON_DEMAND', 'HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('LAST_7_DAYS', 'PREV_7_DAYS', 'LAST_30_DAYS', 'LIFETIME');

-- CreateTable
CREATE TABLE "FundraisingPage" (
    "id" TEXT NOT NULL,
    "enPageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enPageType" TEXT NOT NULL DEFAULT 'nd',
    "pageType" TEXT NOT NULL DEFAULT 'donation',
    "status" "PageStatus" NOT NULL DEFAULT 'ACTIVE',
    "campaignId" INTEGER,
    "title" TEXT,
    "subType" TEXT,
    "clientId" INTEGER,
    "campaignBaseUrl" TEXT,
    "campaignStatus" TEXT,
    "defaultLocale" TEXT,
    "template" TEXT,
    "trackingParameters" TEXT[],
    "enCreatedAt" TIMESTAMP(3),
    "enModifiedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "headline" TEXT,
    "metaDescription" TEXT,
    "ctaButtons" TEXT[],
    "donationAmounts" DOUBLE PRECISION[],
    "monthlyDonationAmounts" DOUBLE PRECISION[],
    "hasFeeCover" BOOLEAN NOT NULL DEFAULT false,
    "feeCoverConfig" JSONB,
    "hasMonthlyGiving" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT,
    "minDonationAmount" DOUBLE PRECISION,
    "enRuntimeConfig" JSONB,
    "lastScrapedAt" TIMESTAMP(3),
    "narrativeText" TEXT,
    "metaTitle" TEXT,
    "appealText" TEXT,
    "pageNumber" INTEGER,
    "pageCount" INTEGER,
    "redirectPresent" BOOLEAN,
    "giftProcess" BOOLEAN,
    "requiresPlaywright" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT,
    "paymentGateway" JSONB,
    "fundraisingTotalDonated" DOUBLE PRECISION,
    "fundraisingHighestDonation" DOUBLE PRECISION,
    "fundraisingAverageDonation" DOUBLE PRECISION,
    "fundraisingRegistrations" INTEGER,
    "fundraisingSupporters" INTEGER,
    "fundraisingPageHits" INTEGER,
    "fundraisingLastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiProfileId" TEXT,

    CONSTRAINT "FundraisingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gaCollectedAt" TIMESTAMP(3),
    "enCollectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationRecommendation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "category" "RecommendationCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "modelUsed" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "tokenCount" INTEGER,
    "status" "RecStatus" NOT NULL DEFAULT 'ACTIVE',
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageInsight" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "queryKey" TEXT,
    "explorationId" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "toolCalls" JSONB,
    "usage" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL DEFAULT 'SYNC',
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "processedPages" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "phase" "JobPhase" NOT NULL DEFAULT 'COLLECTING',
    "scrapeMode" TEXT,
    "targetPageId" TEXT,
    "processingVersion" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enApiKeyEncrypted" TEXT,
    "enBaseUrl" TEXT NOT NULL DEFAULT 'https://ca.engagingnetworks.app/ens/service',
    "enConnectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "enLastTestedAt" TIMESTAMP(3),
    "enLastTestError" TEXT,
    "enPageCount" INTEGER,
    "localPageCount" INTEGER NOT NULL DEFAULT 0,
    "refreshSchedule" "RefreshSchedule" NOT NULL DEFAULT 'ON_DEMAND',
    "lastRefreshAt" TIMESTAMP(3),
    "lastRefreshJobId" TEXT,
    "syncContentScrape" BOOLEAN NOT NULL DEFAULT true,
    "syncCreateSnapshots" BOOLEAN NOT NULL DEFAULT true,
    "syncFundraisingData" BOOLEAN NOT NULL DEFAULT true,
    "syncFillGaps" BOOLEAN NOT NULL DEFAULT true,
    "syncIncludeNonLive" BOOLEAN NOT NULL DEFAULT false,
    "depthPageContent" BOOLEAN NOT NULL DEFAULT true,
    "depthScreenshots" BOOLEAN NOT NULL DEFAULT true,
    "depthConsoleErrors" BOOLEAN NOT NULL DEFAULT true,
    "depthDonationAmounts" BOOLEAN NOT NULL DEFAULT true,
    "scrapingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "stalenessThresholdDays" INTEGER NOT NULL DEFAULT 14,
    "scrapingTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "aiSystemPrompt" TEXT,
    "aiExplorationSystemPrompt" TEXT,
    "aiUserPromptTemplate" TEXT,
    "aiContextProfiles" JSONB,
    "aiChatModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "aiChatMaxContext" INTEGER NOT NULL DEFAULT 50000,
    "aiChatMaxTokens" INTEGER NOT NULL DEFAULT 4096,
    "enPublicTokenEncrypted" TEXT,
    "enRegion" TEXT NOT NULL DEFAULT 'ca',
    "enPublicConnectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "enPublicLastTestedAt" TIMESTAMP(3),
    "enPublicLastTestError" TEXT,
    "ga4PropertyIdEncrypted" TEXT,
    "ga4ServiceAccountKeyEncrypted" TEXT,
    "anthropicApiKeyEncrypted" TEXT,
    "aiOpenaiKeyEncrypted" TEXT,
    "aiGoogleKeyEncrypted" TEXT,
    "aiOllamaBaseUrl" TEXT,
    "aiChatProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "aiChatModelId" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "aiExploreProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "aiExploreModelId" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "aiRecsProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "aiRecsModelId" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "aiModelLists" JSONB,
    "aiChatSystemPrompt" TEXT,
    "aiOrgSearchDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ga4ConnectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "ga4LastTestedAt" TIMESTAMP(3),
    "ga4LastTestError" TEXT,
    "reportingCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingSnapshot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "donationCount" INTEGER NOT NULL DEFAULT 0,
    "singleCount" INTEGER NOT NULL DEFAULT 0,
    "singleAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurringCount" INTEGER NOT NULL DEFAULT 0,
    "recurringAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "highestDonation" DOUBLE PRECISION,
    "averageDonation" DOUBLE PRECISION,
    "supporters" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSnapshot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "contentHash" TEXT,
    "metaTitle" TEXT,
    "appealText" TEXT,
    "narrativeText" TEXT,
    "rawHtml" TEXT,
    "screenshotUrl" TEXT,
    "mobileScreenshotUrl" TEXT,
    "diagnostics" JSONB,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "enModifiedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exploration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'BarChart3',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabledTools" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exploration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundraisingPage_enPageId_key" ON "FundraisingPage"("enPageId");

-- CreateIndex
CREATE INDEX "FundraisingPage_status_idx" ON "FundraisingPage"("status");

-- CreateIndex
CREATE INDEX "FundraisingPage_enPageId_idx" ON "FundraisingPage"("enPageId");

-- CreateIndex
CREATE INDEX "FundraisingPage_lastScrapedAt_idx" ON "FundraisingPage"("lastScrapedAt");

-- CreateIndex
CREATE INDEX "FundraisingPage_enModifiedAt_idx" ON "FundraisingPage"("enModifiedAt");

-- CreateIndex
CREATE INDEX "FundraisingPage_campaignStatus_idx" ON "FundraisingPage"("campaignStatus");

-- CreateIndex
CREATE INDEX "FundraisingPage_status_campaignStatus_idx" ON "FundraisingPage"("status", "campaignStatus");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_date_idx" ON "PerformanceSnapshot"("date");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_pageId_date_idx" ON "PerformanceSnapshot"("pageId", "date");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_conversionRate_idx" ON "PerformanceSnapshot"("conversionRate");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceSnapshot_pageId_date_key" ON "PerformanceSnapshot"("pageId", "date");

-- CreateIndex
CREATE INDEX "OptimizationRecommendation_pageId_status_idx" ON "OptimizationRecommendation"("pageId", "status");

-- CreateIndex
CREATE INDEX "OptimizationRecommendation_category_idx" ON "OptimizationRecommendation"("category");

-- CreateIndex
CREATE INDEX "OptimizationRecommendation_createdAt_idx" ON "OptimizationRecommendation"("createdAt");

-- CreateIndex
CREATE INDEX "PageInsight_pageId_mode_idx" ON "PageInsight"("pageId", "mode");

-- CreateIndex
CREATE INDEX "PageInsight_createdAt_idx" ON "PageInsight"("createdAt");

-- CreateIndex
CREATE INDEX "PageInsight_pageId_explorationId_idx" ON "PageInsight"("pageId", "explorationId");

-- CreateIndex
CREATE INDEX "CollectionJob_status_idx" ON "CollectionJob"("status");

-- CreateIndex
CREATE INDEX "CollectionJob_startedAt_idx" ON "CollectionJob"("startedAt");

-- CreateIndex
CREATE INDEX "CollectionJob_targetPageId_idx" ON "CollectionJob"("targetPageId");

-- CreateIndex
CREATE INDEX "AppSettings_refreshSchedule_idx" ON "AppSettings"("refreshSchedule");

-- CreateIndex
CREATE INDEX "FundraisingSnapshot_pageId_periodType_idx" ON "FundraisingSnapshot"("pageId", "periodType");

-- CreateIndex
CREATE INDEX "FundraisingSnapshot_fetchedAt_idx" ON "FundraisingSnapshot"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundraisingSnapshot_pageId_periodType_periodStart_periodEnd_key" ON "FundraisingSnapshot"("pageId", "periodType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ContentSnapshot_pageId_idx" ON "ContentSnapshot"("pageId");

-- CreateIndex
CREATE INDEX "ContentSnapshot_capturedAt_idx" ON "ContentSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "ContentSnapshot_pageId_validFrom_idx" ON "ContentSnapshot"("pageId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSnapshot_pageId_contentHash_key" ON "ContentSnapshot"("pageId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Exploration_name_key" ON "Exploration"("name");

-- CreateIndex
CREATE INDEX "Exploration_enabled_sortOrder_idx" ON "Exploration"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "Conversation_pageId_updatedAt_idx" ON "Conversation"("pageId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PerformanceSnapshot" ADD CONSTRAINT "PerformanceSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRecommendation" ADD CONSTRAINT "OptimizationRecommendation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRecommendation" ADD CONSTRAINT "OptimizationRecommendation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PerformanceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageInsight" ADD CONSTRAINT "PageInsight_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionJob" ADD CONSTRAINT "CollectionJob_targetPageId_fkey" FOREIGN KEY ("targetPageId") REFERENCES "FundraisingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingSnapshot" ADD CONSTRAINT "FundraisingSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSnapshot" ADD CONSTRAINT "ContentSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FundraisingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

