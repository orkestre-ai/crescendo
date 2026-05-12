// API Request and Response Types
// This file extends the contracts/types.ts with additional runtime types

import type {
  FundraisingPage,
  PerformanceSnapshot,
  OptimizationRecommendation,
  CollectionJob,
} from '@prisma/client';
import type { ReportingCurrency } from '@/types/fundraising';

// Re-export Prisma types
export type { FundraisingPage, PerformanceSnapshot, OptimizationRecommendation, CollectionJob };

// Serialized types (for API responses with dates as strings)
export interface SerializedPerformanceSnapshot extends Omit<
  PerformanceSnapshot,
  'date' | 'createdAt' | 'updatedAt' | 'gaCollectedAt' | 'enCollectedAt'
> {
  date: string;
  createdAt: string;
  updatedAt: string;
  gaCollectedAt: string | null;
  enCollectedAt: string | null;
}

export interface SerializedFundraisingPage extends Omit<
  FundraisingPage,
  | 'createdAt'
  | 'updatedAt'
  | 'lastScrapedAt'
  | 'enCreatedAt'
  | 'enModifiedAt'
  | 'lastSyncedAt'
  | 'fundraisingLastFetchedAt'
> {
  enPageType: string;
  createdAt: string;
  updatedAt: string;
  lastScrapedAt: string | null;
  enCreatedAt: string | null;
  enModifiedAt: string | null;
  lastSyncedAt: string | null;
  fundraisingLastFetchedAt: string | null;
}

// Fundraising metrics for dashboard display (from EN FundraisingSnapshot)
export interface FundraisingMetrics30d {
  totalAmount: number;
  donationCount: number;
  currency: ReportingCurrency;
}

export interface DonationVelocity {
  last7Days: number;
  prev7Days: number;
  changePercent: number | null; // null when prev7Days is 0
}

// Extended types with relations.
// Dashboard-list view omits heavy text/JSON columns that the list UI never reads —
// those are fetched by the page detail findUnique. See F-03 in db-perf-results.md.
export interface PageWithLatestSnapshot
  extends Omit<
    SerializedFundraisingPage,
    | 'metaDescription'
    | 'metaTitle'
    | 'narrativeText'
    | 'appealText'
    | 'redirectPresent'
    | 'contentHash'
    | 'paymentGateway'
    | 'enRuntimeConfig'
    | 'feeCoverConfig'
  > {
  latestSnapshot: SerializedPerformanceSnapshot | null;
  recommendationCount: number;
  fundraising30d: FundraisingMetrics30d | null;
  donationVelocity: DonationVelocity | null;
}

// GET /api/pages
export interface GetPagesQuery {
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  sort?: 'name' | 'donations' | 'revenue';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface GetPagesResponse {
  pages: Array<{
    id: string;
    name: string;
    url: string;
    status: string;
    donationCount: number;
    revenue: number;
    trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
    lastUpdated: string;
  }>;
  total: number;
}

// GET /api/pages/[id]
export interface GetPageDetailResponse {
  id: string;
  name: string;
  url: string;
  enPageId: string;
  status: string;
  content: {
    headline: string | null;
    metaDescription: string | null;
    ctaButtons: string[];
    donationAmounts: number[];
    monthlyDonationAmounts: number[];
    hasFeeCover: boolean;
    feeCoverConfig: { type: string; percent: string; maxAmount: string } | null;
    hasMonthlyGiving: boolean;
    currency: string | null;
    minDonationAmount: number | null;
    lastScrapedAt: string | null;
  };
  latestSnapshot: {
    date: string;
    pageViews: number;
    bounceRate: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    avgSessionDuration: number;
  } | null;
  trends: Array<{
    date: string;
    conversionRate: number;
    pageViews: number;
    revenue: number;
  }>;
  recommendations: Array<{
    id: string;
    category: string;
    text: string;
    confidence: number;
    status: string;
    createdAt: string;
  }>;
}

// PATCH /api/pages/[id]
export interface UpdatePageRequest {
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

// POST /api/jobs
export interface CreateJobRequest {
  triggeredBy: 'user' | 'cron' | 'api';
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  message: string;
}

// GET /api/jobs/[id]
export interface GetJobResponse {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';
  jobType: 'SYNC' | 'MANUAL_SCRAPE' | 'MANUAL_RECS';
  progress: number;
  totalPages: number;
  processedPages: number;
  phase:
    | 'SYNCING'
    | 'SCRAPING'
    | 'COLLECTING'
    | 'FILLING_MISSING'
    | 'GENERATING_RECS'
    | 'FINALIZING';
  errors: Array<{
    page: string;
    error: string;
    timestamp: string;
  }>;
  canRetry: boolean;
  startedAt: string;
  completedAt: string | null;
}

// GET /api/recommendations
export interface GetRecommendationsQuery {
  pageId?: string;
  category?: 'CONTENT' | 'DESIGN' | 'PRICING' | 'CTA' | 'TECHNICAL' | 'SOCIAL_PROOF';
  status?: 'ACTIVE' | 'IMPLEMENTED' | 'DISMISSED' | 'SUPERSEDED';
  minConfidence?: number;
}

export interface GetRecommendationsResponse {
  recommendations: Array<{
    id: string;
    pageId: string;
    pageName: string;
    category: string;
    text: string;
    confidence: number;
    status: string;
    createdAt: string;
  }>;
}

// POST /api/recommendations/[id]/dismiss
export interface DismissRecommendationRequest {
  reason?: string;
}

// POST /api/recommendations/[id]/implement
export interface ImplementRecommendationRequest {
  notes?: string;
}

// GET /api/dashboard/summary
export interface DashboardSummaryResponse {
  summary: {
    livePages: number;
    activePages: number;
    totalUniquePages: number;
    totalDonations: number;
    totalRevenue: number;
    lastCollectionAt: string | null;
  };
  topPerformers: Array<{
    id: string;
    name: string;
    revenue: number;
  }>;
  worstPerformers: Array<{
    id: string;
    name: string;
    revenue: number;
  }>;
  recentRecommendations: Array<{
    id: string;
    pageId: string;
    category: string;
    text: string;
    confidence: number;
    status: string;
    createdAt: string;
    page: { id: string; name: string; url: string };
  }>;
}
