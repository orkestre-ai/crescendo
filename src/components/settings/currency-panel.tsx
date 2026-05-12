'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, DollarSign } from 'lucide-react';
import type { SettingsResponse, ReportingCurrency } from '@/types/settings';

interface CurrencyPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

const CURRENCY_OPTIONS: {
  value: ReportingCurrency;
  label: string;
  symbol: string;
}[] = [
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'CAD', label: 'Canadian Dollar', symbol: 'CA$' },
  { value: 'GBP', label: 'British Pound', symbol: '\u00A3' },
  { value: 'EUR', label: 'Euro', symbol: '\u20AC' },
  { value: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
];

export function CurrencyPanel({ settings, onSettingsUpdate }: CurrencyPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<ReportingCurrency>(
    settings.reporting.currency
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  const currentCurrency = settings.reporting.currency;
  const hasChanges = selectedCurrency !== currentCurrency;

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportingCurrency: selectedCurrency }),
      });

      if (!response.ok) {
        throw new Error('Failed to update currency');
      }

      setSaveSuccess(true);
      onSettingsUpdate();

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      clog.error('currency-panel', 'update-currency-failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          <div>
            <CardTitle>Reporting Currency</CardTitle>
            <CardDescription>
              Set the currency used to display monetary values across all pages
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Display Currency</label>
            <Select
              value={selectedCurrency}
              onValueChange={(value) => setSelectedCurrency(value as ReportingCurrency)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{option.symbol}</span>
                      <span>{option.label}</span>
                      <span className="text-muted-foreground">({option.value})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          All monetary values in page detail views, dashboards, and reports will be displayed in{' '}
          {selectedCurrency}. The Engaging Networks API provides amounts converted to your selected
          currency.
        </p>
      </CardContent>
    </Card>
  );
}
