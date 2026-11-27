'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { clog } from '@/lib/client-logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { SettingsResponse } from '@/types/settings';

interface OrganizationPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function OrganizationPanel({ settings, onSettingsUpdate }: OrganizationPanelProps) {
  const saved = settings.reporting.organizationName ?? '';
  const [name, setName] = useState(saved);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const hasChanges = name.trim() !== saved;

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: name.trim() || null }),
      });

      if (!response.ok) {
        throw new Error('Failed to update the organisation name');
      }

      setSaveSuccess(true);
      onSettingsUpdate();

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      clog.error('organization-panel', 'update-organization-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <div>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>The organisation this Crescendo is set up for</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label htmlFor="organization-name" className="text-sm font-medium mb-2 block">
              Organisation name
            </label>
            <Input
              id="organization-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Example Organisation"
              maxLength={200}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="mt-6">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saveSuccess && <CheckCircle2 className="h-4 w-4 mr-2" />}
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Reports name the organisation in their title area and in the names of the files they
          download as.
        </p>
      </CardContent>
    </Card>
  );
}
