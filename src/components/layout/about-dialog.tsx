'use client';

import { ExternalLink, Heart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { GITHUB_REPO_URL } from '@/config/constants';
import { KEY_DEPENDENCIES } from '@/config/dependencies';
import type { DependencyInfo } from '@/config/dependencies';

interface AboutDialogProps {
  children: React.ReactNode;
}

function DependencyRow({ dep }: { dep: DependencyInfo }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={dep.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm hover:underline"
          >
            {dep.name}
          </a>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {dep.license}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {dep.description}
        </p>
      </div>
      {dep.sponsorUrl && (
        <a
          href={dep.sponsorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-pink-500 transition-colors"
          title={`Sponsor ${dep.name}`}
        >
          <Heart className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function AboutDialog({ children }: AboutDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>About Crescendo</DialogTitle>
          <DialogDescription>
            Version and project information
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="about">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="developer">Developer</TabsTrigger>
            <TabsTrigger value="acknowledgements">Credits</TabsTrigger>
          </TabsList>

          {/* About Tab */}
          <TabsContent value="about" className="space-y-4 pt-2">
            <div className="text-center">
              <h3 className="font-[family-name:var(--font-brand)] text-2xl font-black italic">
                Crescendo
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Fundraising page optimizer for Engaging Networks. Syncs donation
              pages, collects analytics, scrapes content, and generates AI
              optimization recommendations.
            </p>
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-xs text-muted-foreground">
                Licensed under the GNU Affero General Public License v3.0
              </p>
            </div>
            <div className="flex justify-center">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View on GitHub
                </Button>
              </a>
            </div>
          </TabsContent>

          {/* Developer Tab */}
          <TabsContent value="developer" className="space-y-4 pt-2">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Made by Orkestre AI</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Building tools for nonprofit fundraising teams.
              </p>
            </div>
            <div className="flex justify-center">
              <a
                href="https://orkestre.ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  orkestre.ai
                </Button>
              </a>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-center">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Heart className="h-3.5 w-3.5" />
                Support this project
              </a>
            </div>
          </TabsContent>

          {/* Acknowledgements Tab */}
          <TabsContent value="acknowledgements" className="space-y-3 pt-2">
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-3">
                {KEY_DEPENDENCIES.map((dep) => (
                  <DependencyRow key={dep.name} dep={dep} />
                ))}
              </div>
            </ScrollArea>
            <p className="text-center text-xs text-muted-foreground">
              ...and many more open-source packages that make Crescendo
              possible.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
