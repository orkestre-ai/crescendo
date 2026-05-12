import { PerformanceSnapshot } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TrendAnalysisProps {
  snapshots: PerformanceSnapshot[];
}

export function TrendAnalysis({ snapshots }: TrendAnalysisProps) {
  if (snapshots.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough data for trend analysis. At least 2 days of data required.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Get latest and previous period for comparison
  const latest = snapshots[0];
  const previous = snapshots[Math.min(7, snapshots.length - 1)]; // Compare to 7 days ago or earliest

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const changes = {
    conversionRate: calculateChange(latest.conversionRate, previous.conversionRate),
    revenue: calculateChange(latest.revenue, previous.revenue),
    pageViews: calculateChange(latest.pageViews, previous.pageViews),
    bounceRate: calculateChange(latest.bounceRate, previous.bounceRate),
  };

  const getTrendIcon = (change: number) => {
    if (Math.abs(change) < 5) {
      return (
        <svg
          className="h-5 w-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
        </svg>
      );
    }
    if (change > 0) {
      return (
        <svg className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
      );
    }
    return (
      <svg
        className="h-5 w-5 text-destructive"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"
        />
      </svg>
    );
  };

  const getTrendBadge = (change: number, inverse = false) => {
    const absChange = Math.abs(change);
    const isPositive = inverse ? change < 0 : change > 0;

    if (absChange < 5) {
      return <Badge variant="secondary">Stable</Badge>;
    }
    if (isPositive) {
      return <Badge variant="default">Improving</Badge>;
    }
    return <Badge variant="destructive">Declining</Badge>;
  };

  const insights = [];

  // Conversion rate insights
  if (Math.abs(changes.conversionRate) >= 10) {
    insights.push({
      type: changes.conversionRate > 0 ? 'positive' : 'negative',
      message: `Conversion rate ${changes.conversionRate > 0 ? 'increased' : 'decreased'} by ${Math.abs(changes.conversionRate).toFixed(1)}% over the past week`,
    });
  }

  // Revenue insights
  if (Math.abs(changes.revenue) >= 15) {
    insights.push({
      type: changes.revenue > 0 ? 'positive' : 'negative',
      message: `Revenue ${changes.revenue > 0 ? 'grew' : 'declined'} by ${Math.abs(changes.revenue).toFixed(1)}% compared to a week ago`,
    });
  }

  // Page views insights
  if (changes.pageViews > 20) {
    insights.push({
      type: 'positive',
      message: `Traffic increased significantly by ${changes.pageViews.toFixed(1)}%`,
    });
  } else if (changes.pageViews < -20) {
    insights.push({
      type: 'negative',
      message: `Traffic dropped by ${Math.abs(changes.pageViews).toFixed(1)}% - consider reviewing marketing efforts`,
    });
  }

  // Bounce rate insights
  if (changes.bounceRate > 10) {
    insights.push({
      type: 'negative',
      message: `Bounce rate increased by ${changes.bounceRate.toFixed(1)}% - page may need optimization`,
    });
  } else if (changes.bounceRate < -10) {
    insights.push({
      type: 'positive',
      message: `Bounce rate improved by ${Math.abs(changes.bounceRate).toFixed(1)}%`,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">
          Comparing latest data to {snapshots.length >= 8 ? '7 days ago' : 'earliest data'}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metric Changes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              {getTrendIcon(changes.conversionRate)}
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-lg font-semibold">
                  {changes.conversionRate > 0 ? '+' : ''}
                  {changes.conversionRate.toFixed(1)}%
                </p>
              </div>
            </div>
            {getTrendBadge(changes.conversionRate)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              {getTrendIcon(changes.revenue)}
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-lg font-semibold">
                  {changes.revenue > 0 ? '+' : ''}
                  {changes.revenue.toFixed(1)}%
                </p>
              </div>
            </div>
            {getTrendBadge(changes.revenue)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              {getTrendIcon(changes.pageViews)}
              <div>
                <p className="text-sm text-muted-foreground">Page Views</p>
                <p className="text-lg font-semibold">
                  {changes.pageViews > 0 ? '+' : ''}
                  {changes.pageViews.toFixed(1)}%
                </p>
              </div>
            </div>
            {getTrendBadge(changes.pageViews)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              {getTrendIcon(-changes.bounceRate)} {/* Inverse - lower is better */}
              <div>
                <p className="text-sm text-muted-foreground">Bounce Rate</p>
                <p className="text-lg font-semibold">
                  {changes.bounceRate > 0 ? '+' : ''}
                  {changes.bounceRate.toFixed(1)}%
                </p>
              </div>
            </div>
            {getTrendBadge(changes.bounceRate, true)} {/* Inverse badge */}
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Key Insights</h3>
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 p-3 rounded-lg border ${
                  insight.type === 'positive'
                    ? 'bg-success/10 border-success/20'
                    : 'bg-destructive/10 border-destructive/20'
                }`}
              >
                {insight.type === 'positive' ? (
                  <svg
                    className="h-5 w-5 text-success flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                <p
                  className={`text-sm ${
                    insight.type === 'positive' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {insight.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
