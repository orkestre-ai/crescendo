import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Activity } from 'lucide-react';
import { getVelocityStatus } from '@/lib/fundraising-utils';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';
import type { PageWithLatestSnapshot } from '@/types/api';

interface PageCardProps {
  page: PageWithLatestSnapshot;
}

export function PageCard({ page }: PageCardProps) {
  const fundraising = page.fundraising30d;
  const donations = fundraising ? formatNumber(fundraising.donationCount) : 'N/A';
  const revenue = fundraising
    ? formatCurrency(fundraising.totalAmount, fundraising.currency)
    : 'N/A';

  const { variant: statusVariant, text: statusText } = getVelocityStatus(page.donationVelocity);

  return (
    <Link href={`/pages/${page.id}`}>
      <Card className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg leading-snug">{page.name}</CardTitle>
            <Badge variant={statusVariant} className="flex-shrink-0">
              {statusText}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Activity className="h-4 w-4" />
                <p>Donations</p>
              </div>
              <p className="text-2xl font-bold">{donations}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <p>Revenue</p>
              </div>
              <p className="text-2xl font-bold">{revenue}</p>
            </div>
          </div>
          {page.recommendationCount > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-primary font-medium flex items-center gap-1.5">
                <Activity className="h-4 w-4" />
                {page.recommendationCount} optimization{' '}
                {page.recommendationCount === 1 ? 'recommendation' : 'recommendations'} available
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
