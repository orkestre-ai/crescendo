'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { ClearDataResult } from '@/types/settings';

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function ClearDataDialog({ open, onOpenChange, onComplete }: ClearDataDialogProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<ClearDataResult | null>(null);

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const handleClear = async () => {
    if (selectedCategories.length === 0) return;

    setIsClearing(true);
    setResult(null);

    try {
      const response = await fetch('/api/settings/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: selectedCategories,
          confirmed: true,
        }),
      });

      const data: ClearDataResult = await response.json();

      if (response.ok) {
        setResult(data);
        // Auto-close after showing result
        setTimeout(() => {
          onComplete();
          setSelectedCategories([]);
          setResult(null);
        }, 2000);
      } else {
        clog.error('clear-data-dialog', 'clear-failed', { data });
      }
    } catch (error) {
      clog.error('clear-data-dialog', 'clear-data-error', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsClearing(false);
    }
  };

  const handleClose = () => {
    if (!isClearing) {
      onOpenChange(false);
      setSelectedCategories([]);
      setResult(null);
    }
  };

  const categories = [
    {
      id: 'pages',
      label: 'Pages & Snapshots',
      description: 'All donation pages and their performance history',
    },
    {
      id: 'recommendations',
      label: 'Recommendations',
      description: 'All AI-generated optimization recommendations',
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Reset all settings to defaults (including API keys)',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Clear Data
          </DialogTitle>
          <DialogDescription>
            Select the data you want to clear. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-4">
            <div className="bg-success/10 text-success p-4 rounded-lg">
              <div className="font-medium mb-2">Data cleared successfully!</div>
              <ul className="text-sm space-y-1">
                {result.cleared.pages !== undefined && (
                  <li>{result.cleared.pages} pages deleted</li>
                )}
                {result.cleared.snapshots !== undefined && (
                  <li>{result.cleared.snapshots} snapshots deleted</li>
                )}
                {result.cleared.recommendations !== undefined && (
                  <li>{result.cleared.recommendations} recommendations deleted</li>
                )}
                {result.cleared.settingsReset && <li>Settings reset to defaults</li>}
              </ul>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {categories.map((category) => (
              <div key={category.id} className="flex items-start space-x-3">
                <Checkbox
                  id={category.id}
                  checked={selectedCategories.includes(category.id)}
                  onCheckedChange={() => handleCategoryToggle(category.id)}
                  disabled={isClearing}
                />
                <div className="space-y-1">
                  <Label htmlFor={category.id} className="font-medium cursor-pointer">
                    {category.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {!result && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isClearing}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClear}
                disabled={selectedCategories.length === 0 || isClearing}
              >
                {isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear Selected'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
