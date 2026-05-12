import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';
import { AlertCircle, DollarSign, Users, TrendingUp, Clock, Award } from 'lucide-react';

interface FundraisingSectionProps {
  data: {
    fundraisingTotalDonated: number | null;
    fundraisingHighestDonation: number | null;
    fundraisingAverageDonation: number | null;
    fundraisingRegistrations: number | null;
    fundraisingSupporters: number | null;
    fundraisingPageHits: number | null;
    fundraisingLastFetchedAt: Date | null;
    campaignId: number | null;
  };
}

/**
 * Check if data is stale (older than 24 hours)
 */
function isStaleData(lastFetchedAt: Date | null): boolean {
  if (!lastFetchedAt) return false;
  const now = new Date();
  const fetchedDate = new Date(lastFetchedAt);
  const hoursDiff = (now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff > 24;
}

/**
 * Format relative time for last fetched
 */
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';

  const now = new Date();
  const fetchedDate = new Date(date);
  const diffMs = now.getTime() - fetchedDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function FundraisingSection({ data }: FundraisingSectionProps) {
  const hasData = data.fundraisingLastFetchedAt !== null;
  const isStale = isStaleData(data.fundraisingLastFetchedAt);
  const hasCampaignId = data.campaignId !== null;

  // No campaign ID configured
  if (!hasCampaignId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fundraising Totals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">
              No campaign ID configured. Sync this page from Engaging Networks to enable fundraising
              metrics.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Campaign ID exists but no data fetched yet
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fundraising Totals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">
              No fundraising data available yet. Use Debug Tools below to fetch data from Engaging
              Networks.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    {
      label: 'Total Donated',
      value: formatCurrency(data.fundraisingTotalDonated),
      icon: <DollarSign className="h-5 w-5" />,
    },
    {
      label: 'Highest Donation',
      value: formatCurrency(data.fundraisingHighestDonation),
      icon: <Award className="h-5 w-5" />,
    },
    {
      label: 'Average Donation',
      value: formatCurrency(data.fundraisingAverageDonation),
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      label: 'Registrations',
      value: formatNumber(data.fundraisingRegistrations),
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: 'Supporters',
      value: formatNumber(data.fundraisingSupporters),
      icon: <Users className="h-5 w-5" />,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fundraising Totals
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Updated {formatRelativeTime(data.fundraisingLastFetchedAt)}</span>
            {isStale && (
              <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Stale
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((metric, index) => (
            <div key={index} className="flex items-center gap-3 rounded-lg border p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                {metric.icon}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="text-xl font-bold">{metric.value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
