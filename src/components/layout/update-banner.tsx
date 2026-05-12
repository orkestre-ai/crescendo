'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DISMISSED_VERSION_KEY } from '@/lib/version';
import { GITHUB_RELEASES_URL } from '@/config/constants';

interface UpdateInfo {
  latestVersion: string;
  releaseUrl?: string;
}

export function UpdateBanner({ isCollapsed }: { isCollapsed: boolean }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(true); // Start dismissed to prevent flash

  useEffect(() => {
    fetch('/api/version')
      .then((res) => res.json())
      .then((data) => {
        if (data.updateAvailable && data.latestVersion) {
          const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
          if (dismissedVersion !== data.latestVersion) {
            setUpdateInfo({
              latestVersion: data.latestVersion,
              releaseUrl: data.releaseUrl,
            });
            setDismissed(false);
          }
        }
      })
      .catch(() => {
        // Graceful degradation: no banner on error
      });
  }, []);

  if (dismissed || !updateInfo || isCollapsed) return null;

  return (
    <div className="px-3 pb-2">
      <Card className="gap-0 border-primary/20 bg-primary/5 py-0">
        <CardHeader className="px-3 pt-3 pb-1 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium">Update Available</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground -mr-1"
            onClick={() => {
              localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.latestVersion);
              setDismissed(true);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            v{updateInfo.latestVersion} is available.
            You have v{process.env.NEXT_PUBLIC_APP_VERSION}.
          </p>
          <a
            href={updateInfo.releaseUrl || GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full text-xs h-7 gap-1.5"
            >
              <ExternalLink className="h-3 w-3" />
              View
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
