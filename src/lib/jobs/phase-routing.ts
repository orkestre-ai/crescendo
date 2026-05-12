import type { JobPhase, JobType } from '@prisma/client';
import { getSyncBehavior, getScrapingSettings } from '../settings';

export const SYNC_PHASE_ORDER: JobPhase[] = [
  'SYNCING',
  'SCRAPING',
  'COLLECTING',
  'FILLING_MISSING',
  'FINALIZING',
];

export function getPhaseOrder(jobType: JobType): JobPhase[] {
  switch (jobType) {
    case 'SYNC':
      return SYNC_PHASE_ORDER;
    case 'MANUAL_SCRAPE':
      return ['SCRAPING' as JobPhase];
    case 'MANUAL_RECS':
      return ['GENERATING_RECS' as JobPhase];
    case 'BACKFILL':
      return ['COLLECTING' as JobPhase];
  }
}

export async function shouldSkipPhase(
  phase: JobPhase,
  jobType: JobType
): Promise<boolean> {
  // Manual jobs never skip their single phase
  if (jobType !== 'SYNC') return false;

  const syncBehavior = await getSyncBehavior();
  const scrapingSettings = await getScrapingSettings();

  switch (phase) {
    case 'SYNCING':
    case 'FINALIZING':
      return false; // Never skippable
    case 'SCRAPING':
      return !syncBehavior.contentScrape || !scrapingSettings.enabled;
    case 'COLLECTING':
      return !syncBehavior.fundraisingData;
    case 'FILLING_MISSING':
      return !syncBehavior.fillGaps;
    default:
      return true;
  }
}

export async function getFirstEnabledPhase(jobType: JobType): Promise<JobPhase> {
  const phaseOrder = getPhaseOrder(jobType);
  for (const phase of phaseOrder) {
    if (!(await shouldSkipPhase(phase, jobType))) {
      return phase;
    }
  }
  return phaseOrder[0];
}

export async function getNextEnabledPhase(
  currentPhase: JobPhase,
  jobType: JobType
): Promise<JobPhase | null> {
  const phaseOrder = getPhaseOrder(jobType);
  const currentIndex = phaseOrder.indexOf(currentPhase);
  for (let i = currentIndex + 1; i < phaseOrder.length; i++) {
    if (!(await shouldSkipPhase(phaseOrder[i], jobType))) {
      return phaseOrder[i];
    }
  }
  return null;
}

export function getPhaseStartProgress(phase: JobPhase): number {
  switch (phase) {
    case 'SYNCING':
      return 0;
    case 'SCRAPING':
      return 10;
    case 'COLLECTING':
      return 30;
    case 'FILLING_MISSING':
      return 60;
    case 'GENERATING_RECS':
      return 70;
    case 'FINALIZING':
      return 90;
    default:
      return 0;
  }
}
