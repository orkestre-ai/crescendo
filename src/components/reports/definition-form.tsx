'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AUTO_VARIABLE_NAMES,
  INPUT_TYPES,
  promptVariables,
  type ReportInputField,
} from '@/lib/reports/definitions/inputs';
import {
  DEFAULT_MAX_MINUTES,
  DEFAULT_MAX_STEPS,
  MAX_MINUTES_LIMIT,
  MAX_STEPS_LIMIT,
  REPORT_TOOL_CHOICES,
} from '@/lib/reports/definitions/schema';

export interface DefinitionFormData {
  name: string;
  description: string;
  prompt: string;
  inputs: ReportInputField[];
  enabledTools: string[];
  maxSteps: number;
  maxMinutes: number;
  enabled: boolean;
  /** "HH:MM" in the Settings time zone, or null when it is not scheduled. */
  scheduleDailyAt: string | null;
}

const TYPE_LABELS: Record<ReportInputField['type'], string> = {
  text: 'One line of text',
  textarea: 'Several lines of text',
  date: 'Date',
  number: 'Number',
  select: 'Choice from a list',
};

const BACK = '/ai-config?tab=reports';

// A field in the editor. Its choices are typed as one comma-separated line.
type FieldDraft = Omit<ReportInputField, 'options'> & { options: string; id: number };

const toDraft = (field: ReportInputField, id: number): FieldDraft => ({
  ...field,
  options: (field.options ?? []).join(', '),
  id,
});

function fromDraft(draft: FieldDraft): ReportInputField {
  const options = draft.options
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);
  return {
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
    required: draft.required,
    ...(draft.default?.trim() && { default: draft.default.trim() }),
    ...(draft.type === 'select' && { options }),
    ...(draft.help?.trim() && { help: draft.help.trim() }),
  };
}

/** What the API said was wrong, as lines a person can act on. */
function apiErrors(body: { error?: string; details?: { message: string }[] }): string {
  const details = (body.details ?? []).map((issue) => issue.message);
  return details.length > 0 ? details.join(' ') : (body.error ?? 'Failed to save the report');
}

/**
 * The form for a report definition: what it is called, its prompt, the
 * fields a person fills in to start it, its data tools and its two guards.
 */
export function DefinitionForm({
  definitionId,
  isBuiltin = false,
  initial,
}: {
  /** Set when editing; left out for a new definition. */
  definitionId?: string;
  isBuiltin?: boolean;
  initial?: DefinitionFormData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Omit<DefinitionFormData, 'inputs'>>(
    initial ?? {
      name: '',
      description: '',
      prompt: '',
      enabledTools: REPORT_TOOL_CHOICES.map((tool) => tool.key),
      maxSteps: DEFAULT_MAX_STEPS,
      maxMinutes: DEFAULT_MAX_MINUTES,
      enabled: true,
      scheduleDailyAt: null,
    }
  );
  const [fields, setFields] = useState<FieldDraft[]>(() => (initial?.inputs ?? []).map(toDraft));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setField = (id: number, patch: Partial<FieldDraft>) =>
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  const moveField = (index: number, by: -1 | 1) =>
    setFields((prev) => {
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  // Variables in the prompt that nothing will fill in.
  const known = new Set<string>([...AUTO_VARIABLE_NAMES, ...fields.map((field) => field.key)]);
  const unknown = promptVariables(form.prompt).filter((name) => !known.has(name));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Name is required');
    if (!form.prompt.trim()) return setError('Prompt is required');
    if (form.enabledTools.length === 0) return setError('Choose at least one data tool');

    setIsSaving(true);
    try {
      const res = await fetch(
        definitionId ? `/api/reports/definitions/${definitionId}` : '/api/reports/definitions',
        {
          method: definitionId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, inputs: fields.map(fromDraft) }),
        }
      );
      if (!res.ok) throw new Error(apiErrors(await res.json()));
      router.push(BACK);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the report');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => router.push(BACK)}
        className="mb-2 -ml-2"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Reports
      </Button>

      <h2 className="text-xl font-semibold">{definitionId ? 'Edit report' : 'New report'}</h2>

      {isBuiltin && (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          This report comes with Crescendo and is kept up to date with it. Once you save a change to
          it, it stays as you wrote it. To get the built-in version back, delete the report: it
          returns in its original form.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g., Spring appeal review"
          maxLength={100}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Shown where a person chooses a report to start"
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          value={form.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          placeholder="What to analyse, what to doubt, and which blocks make up the document..."
          rows={18}
          className="font-mono text-xs"
          required
        />
        <p className="text-xs text-muted-foreground">
          Say what to analyse and what the document holds. How the ledger, the blocks and the
          recheck work is added by Crescendo. A run already made keeps the prompt it started with.
        </p>
        <div className="rounded-md bg-muted p-3">
          <p className="mb-1.5 text-xs font-medium">Filled in by Crescendo:</p>
          <div className="flex flex-wrap gap-1.5">
            {AUTO_VARIABLE_NAMES.map((name) => (
              <code key={name} className="rounded border bg-background px-1.5 py-0.5 text-xs">
                {`{{${name}}}`}
              </code>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Each input field below is filled in as its key in double braces. The organisation name
            is set in Settings.
          </p>
        </div>
        {unknown.length > 0 && (
          <p className="text-xs text-warning">
            Nothing fills in {unknown.map((name) => `{{${name}}}`).join(', ')}. Add an input field
            with that key, or it is left blank.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <Label>Input fields</Label>
          <p className="text-xs text-muted-foreground">
            The form a person fills in to start this report, in this order.
          </p>
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor={`field-label-${field.id}`} className="text-xs">
                  Label
                </Label>
                <Input
                  id={`field-label-${field.id}`}
                  value={field.label}
                  onChange={(e) => setField(field.id, { label: e.target.value })}
                  placeholder="Campaign start date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`field-key-${field.id}`} className="text-xs">
                  Key (one word)
                </Label>
                <Input
                  id={`field-key-${field.id}`}
                  value={field.key}
                  onChange={(e) => setField(field.id, { key: e.target.value })}
                  placeholder="campaignStart"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                  aria-label={`Move ${field.label || 'field'} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === fields.length - 1}
                  onClick={() => moveField(index, 1)}
                  aria-label={`Move ${field.label || 'field'} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFields((prev) => prev.filter((f) => f.id !== field.id))}
                  aria-label={`Remove ${field.label || 'field'}`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor={`field-type-${field.id}`} className="text-xs">
                  Type
                </Label>
                <Select
                  value={field.type}
                  onValueChange={(value) =>
                    setField(field.id, { type: value as ReportInputField['type'] })
                  }
                >
                  <SelectTrigger id={`field-type-${field.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`field-default-${field.id}`} className="text-xs">
                  Default
                </Label>
                <Input
                  id={`field-default-${field.id}`}
                  value={field.default ?? ''}
                  onChange={(e) => setField(field.id, { default: e.target.value })}
                  placeholder="May use {{today}} or {{year}}"
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox
                  id={`field-required-${field.id}`}
                  checked={field.required}
                  onCheckedChange={(checked) => setField(field.id, { required: !!checked })}
                />
                <Label htmlFor={`field-required-${field.id}`} className="font-normal">
                  Required
                </Label>
              </div>
            </div>
            {field.type === 'select' && (
              <div className="space-y-1">
                <Label htmlFor={`field-options-${field.id}`} className="text-xs">
                  Choices, separated by commas
                </Label>
                <Input
                  id={`field-options-${field.id}`}
                  value={field.options}
                  onChange={(e) => setField(field.id, { options: e.target.value })}
                  placeholder="Last 30 days, Last 90 days"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor={`field-help-${field.id}`} className="text-xs">
                Help text
              </Label>
              <Input
                id={`field-help-${field.id}`}
                value={field.help ?? ''}
                onChange={(e) => setField(field.id, { help: e.target.value })}
                placeholder="Shown under the field"
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setFields((prev) => [
              ...prev,
              toDraft(
                { key: '', label: '', type: 'text', required: false },
                Math.max(-1, ...prev.map((field) => field.id)) + 1
              ),
            ])
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Data tools</Label>
          <p className="text-xs text-muted-foreground">
            Where this report may read data from. At least one is required. The tools that keep the
            ledger and build the document are always on.
          </p>
        </div>
        <div className="space-y-2">
          {REPORT_TOOL_CHOICES.map((tool) => (
            <div key={tool.key} className="flex items-start gap-3">
              <Checkbox
                className="mt-[5px]"
                id={`tool-${tool.key}`}
                checked={form.enabledTools.includes(tool.key)}
                onCheckedChange={(checked) =>
                  set(
                    'enabledTools',
                    checked
                      ? [...form.enabledTools, tool.key]
                      : form.enabledTools.filter((key) => key !== tool.key)
                  )
                }
              />
              <div>
                <Label htmlFor={`tool-${tool.key}`} className="cursor-pointer font-normal">
                  {tool.label}
                </Label>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Guards</Label>
        <p className="text-xs text-muted-foreground">
          A run that reaches either limit is stopped, and keeps its queries, ledger and notes.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="max-steps" className="text-xs">
              Steps
            </Label>
            <Input
              id="max-steps"
              type="number"
              min={1}
              max={MAX_STEPS_LIMIT}
              value={form.maxSteps}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) set('maxSteps', value);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-minutes" className="text-xs">
              Minutes
            </Label>
            <Input
              id="max-minutes"
              type="number"
              min={1}
              max={MAX_MINUTES_LIMIT}
              value={form.maxMinutes}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) set('maxMinutes', value);
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="enabled"
          checked={form.enabled}
          onCheckedChange={(checked) => set('enabled', checked)}
        />
        <Label htmlFor="enabled">Enabled (can be started from Reports)</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule-daily-at">Run every day at</Label>
        <Input
          id="schedule-daily-at"
          type="time"
          value={form.scheduleDailyAt ?? ''}
          onChange={(e) => set('scheduleDailyAt', e.target.value || null)}
          className="w-36"
        />
        <p className="text-xs text-muted-foreground">
          In the time zone set in Settings. Crescendo starts the report once a day after this time, with each field at
          its default, so every required field needs one. If another report is running it waits.
          Leave it empty to start the report only by hand.
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {definitionId ? 'Save changes' : 'Create report'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(BACK)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
