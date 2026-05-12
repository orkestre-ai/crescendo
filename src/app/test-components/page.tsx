'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FileQuestion } from 'lucide-react';

export default function TestComponentsPage() {
  return (
    <div className="container mx-auto py-8 space-y-12">
      <h1 className="text-3xl font-bold">Component Testing Page</h1>

      {/* T015: Button Variants */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Button Variants (T015)</h2>
        <p className="text-sm text-muted-foreground">
          Test keyboard navigation: Tab through buttons, press Enter/Space to activate
        </p>
        <div className="flex flex-wrap gap-4">
          <Button variant="default" onClick={() => alert('Default clicked')}>
            Default
          </Button>
          <Button variant="destructive" onClick={() => alert('Destructive clicked')}>
            Destructive
          </Button>
          <Button variant="outline" onClick={() => alert('Outline clicked')}>
            Outline
          </Button>
          <Button variant="secondary" onClick={() => alert('Secondary clicked')}>
            Secondary
          </Button>
          <Button variant="ghost" onClick={() => alert('Ghost clicked')}>
            Ghost
          </Button>
          <Button variant="link" onClick={() => alert('Link clicked')}>
            Link
          </Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button size="sm">Small</Button>
          <Button size="default">Default Size</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button disabled>Disabled</Button>
          <Button variant="destructive" disabled>
            Disabled Destructive
          </Button>
        </div>
      </section>

      {/* T016: Badge Variants */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Badge Variants (T016)</h2>
        <p className="text-sm text-muted-foreground">
          Verify color contrast meets WCAG AA standards
        </p>
        <div className="flex flex-wrap gap-4 items-center">
          <Badge variant="default">Default</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <Badge size="sm">Small</Badge>
          <Badge size="default">Default</Badge>
          <Badge size="lg">Large</Badge>
        </div>
      </section>

      {/* T017: Card Component */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Card Component (T017)</h2>
        <p className="text-sm text-muted-foreground">
          Test hover states and shadow transitions at different breakpoints
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Standard Card</CardTitle>
              <CardDescription>No interactive state</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">This card has no hover effect.</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200"
            onClick={() => alert('Card clicked')}
          >
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>Clickable with hover state</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">This card has hover effects and is clickable.</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200">
            <CardHeader>
              <CardTitle>Another Interactive</CardTitle>
              <CardDescription>Hover to see shadow</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Watch the shadow and border change on hover.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* T018: Skeleton Component */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Skeleton Component (T018)</h2>
        <p className="text-sm text-muted-foreground">Test with various content shapes</p>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2 mt-2" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </CardContent>
          </Card>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      </section>

      {/* T019: EmptyState Component */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">EmptyState Component (T019)</h2>
        <p className="text-sm text-muted-foreground">
          Test with different icons and action buttons
        </p>
        <div className="space-y-8">
          <Card>
            <CardContent>
              <EmptyState
                icon={FileQuestion}
                title="No Data Available"
                description="There are no items to display at this time."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <EmptyState
                icon={FileQuestion}
                title="No Results Found"
                description="Try adjusting your search or filters."
                action={{
                  label: 'Clear Filters',
                  onClick: () => alert('Filters cleared'),
                }}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
