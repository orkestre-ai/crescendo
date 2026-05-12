'use client';

import { DollarSign, Users, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';
import type { ReportingCurrency } from '@/types/fundraising';
import type { AllTimeData } from './types';

interface AllTimeCardsProps {
  data: AllTimeData;
  currency: ReportingCurrency;
}

function StatCard({
  icon,
  label,
  value,
  secondaryLabel,
  secondaryValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondaryLabel: string;
  secondaryValue: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground">{secondaryLabel}</p>
          <p className="text-lg font-semibold">{secondaryValue}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * All Time view cards for zone 1.
 * Shows lifetime revenue, supporters, and highest gift with secondary stats.
 */
export function AllTimeCards({ data, currency }: AllTimeCardsProps) {
  const formatSinceDate = (date: Date) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        icon={<DollarSign className="h-5 w-5" />}
        label="Total Revenue"
        value={formatCurrency(data.totalRevenue, currency)}
        secondaryLabel="Average Donation"
        secondaryValue={formatCurrency(data.averageDonation, currency)}
      />
      <StatCard
        icon={<Users className="h-5 w-5" />}
        label="Supporters"
        value={formatNumber(data.supporters)}
        secondaryLabel="Registrations"
        secondaryValue={formatNumber(data.registrations)}
      />
      <StatCard
        icon={<Trophy className="h-5 w-5" />}
        label="Highest Gift"
        value={formatCurrency(data.highestDonation, currency)}
        secondaryLabel="Campaign Started"
        secondaryValue={formatSinceDate(data.sinceDate)}
      />
    </div>
  );
}
