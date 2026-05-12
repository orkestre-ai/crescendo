'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, Wrench, AlertTriangle, Loader2 } from 'lucide-react';

interface AIToolCardProps {
  name: string;
  params?: Record<string, unknown>;
  result?: { summary: string; data: unknown; error?: string };
  isLoading?: boolean;
}

export function AIToolCard({ name, params, result, isLoading }: AIToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="my-3 border-dashed">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : result?.error ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Wrench className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{name.replace(/_/g, ' ')}</span>
            {result?.error && (
              <Badge variant="destructive" className="text-xs">
                Error
              </Badge>
            )}
            {isLoading && (
              <Badge variant="secondary" className="text-xs">
                Running...
              </Badge>
            )}
          </div>
          {(params || result) && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </Button>
          )}
        </div>

        {result && !isLoading && (
          <p className="text-xs text-muted-foreground mt-1">{result.summary}</p>
        )}

        {expanded && (
          <div className="mt-2 space-y-2">
            {params && Object.keys(params).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Parameters</p>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(params, null, 2)}
                </pre>
              </div>
            )}
            {result?.data != null && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
