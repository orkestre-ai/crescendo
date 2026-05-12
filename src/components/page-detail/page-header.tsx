import { FundraisingPage } from '@/types/api';
import { PageStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { getScrapableUrl } from '@/lib/url-utils';

interface PageHeaderProps {
  page: FundraisingPage;
}

export function PageHeader({ page }: PageHeaderProps) {
  const getStatusVariant = (status: PageStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'PAUSED':
        return 'secondary';
      case 'ARCHIVED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{page.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={getStatusVariant(page.status)}>{page.status}</Badge>
            <Badge variant="outline">{page.pageType}</Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <a
          href={getScrapableUrl(page)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-info hover:underline"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          View Live Page
        </a>
        <span>•</span>
        <span>EN Page ID: {page.enPageId}</span>
        {page.lastScrapedAt && (
          <>
            <span>•</span>
            <span>Last Scraped: {new Date(page.lastScrapedAt).toLocaleString()}</span>
          </>
        )}
      </div>
    </div>
  );
}
