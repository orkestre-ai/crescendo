// Shared TypeScript Types
import type { PaymentGatewayInfo } from '@/types/gateway';
import type { ENRuntimeData, ENFeeCoverConfig } from '@/types/en-runtime';

export interface PageMetrics {
  pageViews: number;
  bounceRate: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  avgSessionDuration: number;
}

export interface PageWithMetrics {
  id: string;
  name: string;
  url: string;
  enPageId: string;
  status: string;
  latestMetrics: PageMetrics | null;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  recommendationsCount: number;
}

export interface DashboardSummary {
  livePages: number;
  activePages: number;
  totalUniquePages: number;
  totalPageViews: number;
  totalConversions: number;
  totalRevenue: number;
  avgConversionRate: number;
  lastCollectionAt: Date | null;
  pendingRecommendations: number;
}

export interface RecommendationWithCategory {
  id: string;
  category: string;
  text: string;
  confidence: number;
  status: string;
  createdAt: Date;
}

export interface JobProgress {
  id: string;
  status: string;
  progress: number;
  totalPages: number;
  processedPages: number;
  phase: string;
  errors: Array<{ page: string; error: string; timestamp: string }>;
  canRetry: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PageContent {
  url: string;
  h1: string | null;
  metaDescription: string | null;
  cta: string[];
  donationAmounts: number[];
  scrapedAt: Date;
  narrativeText?: string | null;
  rawHtml?: string | null;  // Full HTML captured at scrape time — source of truth for audit checks
  metaTitle?: string | null;
  appealText?: string | null;
  // From pageJson variable in HTML
  pageNumber?: number | null;
  pageCount?: number | null;
  redirectPresent?: boolean | null;
  giftProcess?: boolean | null;
  // Payment gateway detection result
  paymentGateway?: PaymentGatewayInfo | null;
  // Scraping optimization
  usedPlaywright?: boolean;
  // EN runtime data (Playwright-only, from window.EngagingNetworks)
  enRuntimeData?: ENRuntimeData | null;
  monthlyDonationAmounts?: number[];
  hasFeeCover?: boolean;
  feeCoverConfig?: ENFeeCoverConfig | null;
  hasMonthlyGiving?: boolean;
  currency?: string | null;
  minDonationAmount?: number | null;
  enRuntimeConfig?: Record<string, unknown> | null;
  scrapeFailed?: boolean;
}

// Page diagnostics captured during Playwright scraping
export interface PageDiagnostics {
  loadTimeMs: number;
  domContentLoadedMs: number;
  totalRequests: number;
  failedRequests: FailedRequest[];
  totalTransferSizeKb: number;
  consoleErrors: ConsoleEntry[];
  consoleWarnings: ConsoleEntry[];
  jsExceptions: string[];
  capturedAt: string;
}

export interface FailedRequest {
  url: string;
  status: number | null;
  resourceType: string;
}

export interface ConsoleEntry {
  text: string;
  url?: string;
  lineNumber?: number;
}

export interface TrendDataPoint {
  date: string;
  conversionRate: number;
  pageViews: number;
  revenue: number;
  bounceRate: number;
}

export type PerformanceTrend = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
