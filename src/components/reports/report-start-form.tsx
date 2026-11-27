'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { resolveInputDefaults, type ReportInputField } from '@/lib/reports/definitions/inputs';

interface Definition {
  id: string;
  key: string;
  name: string;
  description: string;
  inputs: ReportInputField[];
  maxMinutes: number;
}

const PREPARED_BY = 'crescendo.reports.preparedBy';

// en-CA writes a date as YYYY-MM-DD.
const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/**
 * Start a report: choose a definition, fill in the form its input fields
 * make, and start. Only one report runs at a time.
 */
export function ReportStartForm() {
  const router = useRouter();
  const wanted = useSearchParams().get('definition');

  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preparedBy, setPreparedBy] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [defsRes, settingsRes] = await Promise.all([
          fetch('/api/reports/definitions?enabled=true'),
          fetch('/api/settings'),
        ]);
        const defs = await defsRes.json();
        if (!defsRes.ok) throw new Error(defs.error || 'Failed to load the reports');
        setDefinitions(defs.definitions);
        if (settingsRes.ok) {
          setOrganizationName((await settingsRes.json()).reporting?.organizationName ?? null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load the reports');
        setDefinitions([]);
      }
    }
    load();
    try {
      setPreparedBy(window.localStorage.getItem(PREPARED_BY) ?? '');
    } catch {
      // No stored name: the field starts empty.
    }
  }, []);

  const definition = useMemo(
    () => definitions?.find((d) => d.key === (selectedKey ?? wanted)) ?? definitions?.[0] ?? null,
    [definitions, selectedKey, wanted]
  );
  const fields = useMemo(
    () => resolveInputDefaults(definition?.inputs ?? [], today()),
    [definition]
  );

  // A new definition is a new form: start from its defaults.
  useEffect(() => {
    setValues(Object.fromEntries(fields.map((field) => [field.key, field.default ?? ''])));
    setFieldErrors({});
  }, [fields]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!definition) return;
    setError(null);
    setFieldErrors({});
    setBusyRunId(null);
    setIsStarting(true);
    try {
      const res = await fetch('/api/reports/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          definitionId: definition.id,
          inputs: values,
          preparedBy: preparedBy.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setBusyRunId(json.runId);
        return;
      }
      if (res.status === 400 && json.errors) {
        setFieldErrors(json.errors);
        setError(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Failed to start the report');
      try {
        window.localStorage.setItem(PREPARED_BY, preparedBy.trim());
      } catch {
        // The name is simply not remembered.
      }
      router.push(`/reports/${json.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the report');
    } finally {
      setIsStarting(false);
    }
  }

  if (definitions === null) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleStart} className="max-w-2xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => router.push('/reports')}
        className="mb-2 -ml-2"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Reports
      </Button>

      <h1 className="text-2xl font-semibold">New report</h1>

      {busyRunId && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Another report is running, and only one runs at a time.{' '}
            <Link href={`/reports/${busyRunId}`} className="font-medium underline">
              See the report in progress
            </Link>
            . Start this one when it has finished, or cancel it there.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {!definition ? (
        <p className="text-sm text-muted-foreground">
          No report is enabled.{' '}
          <Link href="/ai-config?tab=reports" className="underline">
            Enable or add one under AI Config
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="definition">Report</Label>
            <Select value={definition.key} onValueChange={setSelectedKey}>
              <SelectTrigger id="definition" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {definitions.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {definition.description && (
              <p className="text-sm text-muted-foreground">{definition.description}</p>
            )}
          </div>

          {organizationName === null && (
            <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>
                No organisation name is set, so the report will name the website instead.{' '}
                <Link href="/settings" className="font-medium underline">
                  Add it in Settings
                </Link>{' '}
                to have it named properly.
              </p>
            </div>
          )}

          {fields.map((field) => {
            const id = `input-${field.key}`;
            const value = values[field.key] ?? '';
            const set = (next: string) => setValues((prev) => ({ ...prev, [field.key]: next }));
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={id}>
                  {field.label}
                  {!field.required && (
                    <span className="ml-2 font-normal text-muted-foreground">Optional</span>
                  )}
                </Label>
                {field.type === 'textarea' ? (
                  <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} rows={4} />
                ) : field.type === 'select' ? (
                  <Select value={value} onValueChange={set}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={field.type}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    required={field.required}
                    className={field.type === 'date' ? 'w-48' : undefined}
                  />
                )}
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                {fieldErrors[field.key] && (
                  <p className="text-xs text-destructive">{fieldErrors[field.key]}</p>
                )}
              </div>
            );
          })}

          <div className="space-y-2">
            <Label htmlFor="prepared-by">
              Prepared by
              <span className="ml-2 font-normal text-muted-foreground">Optional</span>
            </Label>
            <Input
              id="prepared-by"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Your name, as the report should show it"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Button type="submit" disabled={isStarting}>
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start report
            </Button>
            <p className="text-xs text-muted-foreground">
              The report runs in the background and can take up to {definition.maxMinutes} minutes.
              You can leave this page and come back to it under Reports. It uses your AI provider
              for the whole run.
            </p>
          </div>
        </>
      )}
    </form>
  );
}
