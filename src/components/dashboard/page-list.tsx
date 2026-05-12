'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isLiveCampaign } from '@/lib/url-utils';
import { getVelocityStatus } from '@/lib/fundraising-utils';
import { formatCurrency, formatNumber } from '@/lib/currency-utils';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PageWithLatestSnapshot } from '@/types/api';

interface PageListProps {
  pages: PageWithLatestSnapshot[];
  initialLiveOnly?: boolean;
}

// Helper function to get campaign status indicator
// Green: live/new/tested + ACTIVE sync status + SUCCESS last sync
// Grey: close/block/delete OR PAUSED sync status
// Red: FAILED last sync AND live page
const getCampaignStatusIndicator = (page: PageWithLatestSnapshot) => {
  const isLive = isLiveCampaign(page.campaignStatus);
  const syncStatus = page.status; // ACTIVE or PAUSED
  const lastSyncStatus = page.lastSyncStatus; // SUCCESS, FAILED, or PENDING

  // Grey: Not live (close/block/delete) OR sync is paused
  if (!isLive || syncStatus === 'PAUSED') {
    return {
      color: 'bg-gray-400',
      title: !isLive
        ? `Page is ${page.campaignStatus || 'unknown'} - not reachable`
        : 'Sync is paused',
    };
  }

  // Red: Live but last sync failed
  if (lastSyncStatus === 'FAILED') {
    return {
      color: 'bg-destructive',
      title: 'Last sync failed',
    };
  }

  // Green: Live, active, and sync succeeded (or pending for new pages)
  return {
    color: 'bg-success',
    title: 'Live and syncing',
  };
};

// Helper function to format date with smart relative/absolute formatting
const formatModifiedDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // < 1 hour: "X minutes ago"
  if (diffMinutes < 60) {
    if (diffMinutes < 1) return 'Just now';
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  // < 24 hours: "X hours ago"
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  // < 3 days: "X days ago"
  if (diffDays < 3) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // >= 3 days: "MMM DD, YYYY" format
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Column definitions
const columns: ColumnDef<PageWithLatestSnapshot>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Page Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row, table }) => {
      const indicator = getCampaignStatusIndicator(row.original);
      const liveOnly = (table.options.meta as { showLiveOnly?: boolean })?.showLiveOnly ?? true;
      const href = liveOnly ? `/pages/${row.original.id}` : `/pages/${row.original.id}?live=0`;
      return (
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${indicator.color} flex-shrink-0`}
            title={indicator.title}
          />
          <Link
            href={href}
            className="hover:underline text-foreground font-medium"
          >
            {row.getValue('name')}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: 'enModifiedAt',
    accessorFn: (row) => (row.enModifiedAt ? new Date(row.enModifiedAt).getTime() : 0),
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Modified
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return (
        <div className="text-muted-foreground text-sm">
          {formatModifiedDate(row.original.enModifiedAt)}
        </div>
      );
    },
  },
  {
    accessorKey: 'donations',
    accessorFn: (row) => row.fundraising30d?.donationCount ?? 0,
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Donations
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const fundraising = row.original.fundraising30d;
      return <div className="font-semibold">{fundraising ? formatNumber(fundraising.donationCount) : 'N/A'}</div>;
    },
  },
  {
    accessorKey: 'revenue',
    accessorFn: (row) => row.fundraising30d?.totalAmount ?? 0,
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Revenue
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const fundraising = row.original.fundraising30d;
      return (
        <div className="font-semibold">
          {fundraising ? formatCurrency(fundraising.totalAmount, fundraising.currency) : 'N/A'}
        </div>
      );
    },
  },
  {
    id: 'status',
    accessorFn: (row) => row.donationVelocity?.changePercent ?? 0,
    header: 'Status',
    cell: ({ row }) => {
      const { variant, text } = getVelocityStatus(row.original.donationVelocity);
      return (
        <Badge variant={variant} size="sm">
          {text}
        </Badge>
      );
    },
  },
  // Recommendations column - commented out per plan
  // {
  //   id: 'recommendations',
  //   accessorKey: 'recommendationCount',
  //   header: 'Recommendations',
  //   cell: ({ row }) => {
  //     const count = row.original.recommendationCount;
  //     if (count > 0) {
  //       return (
  //         <div className="flex items-center gap-1.5">
  //           <Activity className="h-4 w-4 text-primary" />
  //           <span className="text-sm text-primary font-semibold">{count}</span>
  //         </div>
  //       );
  //     }
  //     return <span className="text-sm text-muted-foreground">—</span>;
  //   },
  // },
];

export function PageList({ pages, initialLiveOnly = true }: PageListProps) {
  const [showLiveOnly, setShowLiveOnly] = React.useState(initialLiveOnly);

  // Filter pages based on live toggle — must match summary card criteria:
  // ACTIVE sync status + live campaign status (published and receiving traffic)
  const filteredPages = React.useMemo(() => {
    if (!showLiveOnly) return pages;
    return pages.filter((page) => page.status === 'ACTIVE' && isLiveCampaign(page.campaignStatus));
  }, [pages, showLiveOnly]);

  // Default sort by revenue descending (highest first)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'revenue', desc: true }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data: filteredPages,
    columns,
    meta: { showLiveOnly },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/20 gap-4">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Filter by page name..."
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(event) => table.getColumn('name')?.setFilterValue(event.target.value)}
            className="max-w-sm h-9"
          />
          <Button
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => setShowLiveOnly(!showLiveOnly)}
          >
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-colors duration-200',
                showLiveOnly ? 'bg-success' : 'bg-muted'
              )}
            />
            Show Live Only
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(
                    !isLiveCampaign(row.original.campaignStatus) && 'opacity-50'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No pages found. Add pages in Engaging Networks to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between space-x-2 px-4 py-4 border-t bg-muted/20">
        <div className="flex-1 text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} page(s) total
          {showLiveOnly && ` (filtered from ${pages.length})`}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
