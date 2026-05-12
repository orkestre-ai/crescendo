import type { DonationVelocity } from '@/types/api';
import {
  VELOCITY_TRENDING_UP_THRESHOLD,
  VELOCITY_TRENDING_DOWN_THRESHOLD,
} from '@/config/constants';

type StatusVariant = 'success' | 'warning' | 'destructive' | 'secondary';

export interface VelocityStatus {
  variant: StatusVariant;
  text: string;
}

/**
 * Derives a status badge from donation velocity (7-day week-over-week comparison).
 * Used by both the page list table and page card components.
 */
export function getVelocityStatus(velocity: DonationVelocity | null): VelocityStatus {
  if (!velocity) {
    return { variant: 'secondary', text: 'No Data' };
  }

  // No previous period to compare against (prev7Days was 0)
  if (velocity.changePercent === null) {
    if (velocity.last7Days > 0) {
      return { variant: 'success', text: 'New Activity' };
    }
    return { variant: 'secondary', text: 'No Data' };
  }

  if (velocity.changePercent > VELOCITY_TRENDING_UP_THRESHOLD) {
    return { variant: 'success', text: 'Trending Up' };
  } else if (velocity.changePercent < VELOCITY_TRENDING_DOWN_THRESHOLD) {
    return { variant: 'destructive', text: 'Trending Down' };
  } else {
    return { variant: 'warning', text: 'Steady' };
  }
}
