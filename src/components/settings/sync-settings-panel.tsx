'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Clock, Calendar } from 'lucide-react';
import type { SettingsResponse, RefreshSchedule } from '@/types/settings';

interface SyncSettingsPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

type SyncBehaviorKey = 'contentScrape' | 'createSnapshots' | 'fundraisingData' | 'fillGaps' | 'includeNonLive';
type ContentDepthKey = 'screenshots' | 'consoleErrors' | 'donationAmounts';

export function SyncSettingsPanel({ settings, onSettingsUpdate }: SyncSettingsPanelProps) {
  const [savingField, setSavingField] = useState<string | null>(null);
  const [localThreshold, setLocalThreshold] = useState(settings.sync.scraping.stalenessThresholdDays);

  const saveSetting = async (body: Record<string, unknown>, fieldKey: string) => {
    setSavingField(fieldKey);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to save setting');
      }

      onSettingsUpdate();
    } catch (error) {
      clog.error('sync-settings-panel', 'save-setting-failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingField(null);
    }
  };

  const handleSyncBehaviorToggle = (key: SyncBehaviorKey, checked: boolean) => {
    saveSetting({ syncBehavior: { [key]: checked } }, `behavior.${key}`);
  };

  const handleContentDepthToggle = (key: ContentDepthKey, checked: boolean) => {
    saveSetting({ contentDepth: { [key]: checked } }, `depth.${key}`);
  };

  const handleScheduleChange = (value: RefreshSchedule) => {
    saveSetting({ refreshSchedule: value }, 'schedule');
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const { sync } = settings;

  return (
    <div className="space-y-6">
      {/* Sync Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Behavior</CardTitle>
          <CardDescription>Control what happens when a sync job runs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SyncToggle
            id="contentScrape"
            label="Scrape new/modified pages"
            description="Fetch page content for new or recently changed pages"
            checked={sync.behavior.contentScrape}
            saving={savingField === 'behavior.contentScrape'}
            onCheckedChange={(checked) => handleSyncBehaviorToggle('contentScrape', checked)}
          />
          <SyncToggle
            id="createSnapshots"
            label="Create content snapshots"
            description="Save a timestamped copy of page content for change tracking"
            checked={sync.behavior.createSnapshots}
            saving={savingField === 'behavior.createSnapshots'}
            onCheckedChange={(checked) => handleSyncBehaviorToggle('createSnapshots', checked)}
          />
          <SyncToggle
            id="fundraisingData"
            label="Update fundraising data"
            description="Pull latest donation totals and campaign metrics"
            checked={sync.behavior.fundraisingData}
            saving={savingField === 'behavior.fundraisingData'}
            onCheckedChange={(checked) => handleSyncBehaviorToggle('fundraisingData', checked)}
          />
          <SyncToggle
            id="fillGaps"
            label="Fill missing data gaps"
            description="Backfill data for pages that were skipped or had errors"
            checked={sync.behavior.fillGaps}
            saving={savingField === 'behavior.fillGaps'}
            onCheckedChange={(checked) => handleSyncBehaviorToggle('fillGaps', checked)}
          />
          <SyncToggle
            id="includeNonLive"
            label="Include non-live pages"
            description="Sync and track pages with 'new' or 'tested' status (off = only live pages)"
            checked={sync.behavior.includeNonLive}
            saving={savingField === 'behavior.includeNonLive'}
            onCheckedChange={(checked) => handleSyncBehaviorToggle('includeNonLive', checked)}
          />
        </CardContent>
      </Card>

      {/* Scraping Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Scraping</CardTitle>
          <CardDescription>Control automatic page content scraping</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SyncToggle
            id="scrapingEnabled"
            label="Automatic scraping"
            description="Scrape page content during scheduled sync jobs"
            checked={sync.scraping.enabled}
            saving={savingField === 'scrapingEnabled'}
            onCheckedChange={(checked) => saveSetting({ scrapingEnabled: checked }, 'scrapingEnabled')}
          />
          <div className="space-y-2">
            <Label htmlFor="stalenessThreshold" className="text-sm font-medium">
              Re-scrape interval
            </Label>
            <p className="text-xs text-muted-foreground">
              Pages are re-scraped when content hasn&apos;t been checked for this many days
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="stalenessThreshold"
                type="number"
                min={1}
                max={365}
                value={localThreshold}
                onChange={(e) => setLocalThreshold(Number(e.target.value))}
                onBlur={() => {
                  const val = Math.max(1, Math.min(365, localThreshold));
                  if (val !== sync.scraping.stalenessThresholdDays) {
                    saveSetting({ stalenessThresholdDays: val }, 'stalenessThreshold');
                  }
                }}
                className="w-20"
                disabled={!sync.scraping.enabled}
              />
              <span className="text-sm text-muted-foreground">days</span>
              {savingField === 'stalenessThreshold' && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Depth */}
      <Card>
        <CardHeader>
          <CardTitle>Content Depth</CardTitle>
          <CardDescription>Choose what to capture during page scraping</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DepthCheckbox
            id="pageContent"
            label="Page text content"
            description="Extract the main text and HTML from each page"
            checked={true}
            disabled={true}
            saving={false}
            onCheckedChange={() => {}}
          />
          <DepthCheckbox
            id="screenshots"
            label="Desktop + mobile screenshots"
            description="Capture visual screenshots at desktop and mobile breakpoints"
            checked={sync.scraping.depth.screenshots}
            saving={savingField === 'depth.screenshots'}
            onCheckedChange={(checked) => handleContentDepthToggle('screenshots', checked)}
          />
          <DepthCheckbox
            id="consoleErrors"
            label="Console errors & diagnostics"
            description="Record browser console errors and warnings found on pages"
            checked={sync.scraping.depth.consoleErrors}
            saving={savingField === 'depth.consoleErrors'}
            onCheckedChange={(checked) => handleContentDepthToggle('consoleErrors', checked)}
          />
          <DepthCheckbox
            id="donationAmounts"
            label="Donation amount extraction"
            description="Extract available donation amounts and default selections"
            checked={sync.scraping.depth.donationAmounts}
            saving={savingField === 'depth.donationAmounts'}
            onCheckedChange={(checked) => handleContentDepthToggle('donationAmounts', checked)}
          />
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>How often automatic syncs should run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={sync.schedule}
            onValueChange={(value) => handleScheduleChange(value as RefreshSchedule)}
            className="space-y-3"
          >
            <ScheduleOption
              value="ON_DEMAND"
              label="On demand"
              description="Manual only — sync when you click refresh"
            />
            <ScheduleOption
              value="HOURLY"
              label="Hourly"
              description="Sync automatically every hour"
            />
            <ScheduleOption
              value="DAILY"
              label="Daily"
              description="Sync automatically once per day"
            />
            <ScheduleOption
              value="WEEKLY"
              label="Weekly"
              description="Sync automatically once per week"
            />
          </RadioGroup>

          {savingField === 'schedule' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving schedule...
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last refresh:</span>
              <span className="font-medium">{formatTimestamp(sync.lastRefreshAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Next refresh:</span>
              <span className="font-medium">
                {sync.schedule === 'ON_DEMAND' ? 'Manual' : formatTimestamp(sync.nextRefreshAt)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncToggle({
  id,
  label,
  description,
  checked,
  saving,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={saving} />
      </div>
    </div>
  );
}

function DepthCheckbox({
  id,
  label,
  description,
  checked,
  disabled,
  saving,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  saving: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 pt-0.5">
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          disabled={disabled || saving}
        />
      </div>
      <div className="space-y-0.5">
        <Label
          htmlFor={id}
          className={`text-sm font-medium cursor-pointer ${disabled ? 'text-muted-foreground' : ''}`}
        >
          {label}
          {disabled && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(always on)</span>
          )}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ScheduleOption({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <RadioGroupItem value={value} id={`schedule-${value}`} />
      <div className="space-y-0.5">
        <Label htmlFor={`schedule-${value}`} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
