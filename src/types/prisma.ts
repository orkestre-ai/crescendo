// Prisma Type Extensions

import { Prisma } from '@prisma/client';

// Include relations in types
export type FundraisingPageWithSnapshots = Prisma.FundraisingPageGetPayload<{
  include: { snapshots: true };
}>;

export type FundraisingPageWithRecommendations = Prisma.FundraisingPageGetPayload<{
  include: { recommendations: true };
}>;

export type FundraisingPageWithRelations = Prisma.FundraisingPageGetPayload<{
  include: {
    snapshots: true;
    recommendations: true;
  };
}>;

export type PerformanceSnapshotWithRecs = Prisma.PerformanceSnapshotGetPayload<{
  include: { recommendations: true };
}>;

export type OptimizationRecommendationWithPage = Prisma.OptimizationRecommendationGetPayload<{
  include: { page: true };
}>;

// Partial update types
export type PageContentUpdate = Pick<
  Prisma.FundraisingPageUpdateInput,
  'headline' | 'metaDescription' | 'ctaButtons' | 'donationAmounts' | 'lastScrapedAt'
>;

export type PageStatusUpdate = Pick<Prisma.FundraisingPageUpdateInput, 'status'>;

export type RecommendationStatusUpdate = Pick<
  Prisma.OptimizationRecommendationUpdateInput,
  'status' | 'dismissedAt' | 'dismissedBy'
>;

// Query result types
export type PageWithLatestSnapshot = Prisma.FundraisingPageGetPayload<{
  include: {
    snapshots: {
      orderBy: { date: 'desc' };
      take: 1;
    };
  };
}>;

export type PageWithRecentSnapshots = Prisma.FundraisingPageGetPayload<{
  include: {
    snapshots: {
      orderBy: { date: 'desc' };
      take: 30;
    };
  };
}>;
