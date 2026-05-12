'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AVAILABLE_TOOLS,
  EXPLORATION_ICONS,
  EXPLORATION_TEMPLATE_VARIABLES,
} from '@/config/exploration-constants';
import {
  Loader2, ArrowLeft,
  BarChart3, TrendingUp, Globe, Smartphone, MousePointerClick,
  FileDiff, Search, Users, DollarSign, Target, Lightbulb,
  Zap, LineChart, PieChart, Activity,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  BarChart3, TrendingUp, Globe, Smartphone, MousePointerClick,
  FileDiff, Search, Users, DollarSign, Target, Lightbulb,
  Zap, LineChart, PieChart, Activity,
};
import { useRouter } from 'next/navigation';

interface ExplorationFormData {
  name: string;
  description: string;
  prompt: string;
  icon: string;
  enabled: boolean;
  enabledTools: string[];
}

interface ExplorationFormProps {
  initialData?: ExplorationFormData;
  explorationId?: string; // If set, this is edit mode
  onSubmit: (data: ExplorationFormData) => Promise<void>;
}

export function ExplorationForm({
  initialData,
  explorationId,
  onSubmit,
}: ExplorationFormProps) {
  const router = useRouter();
  const isEdit = !!explorationId;

  const [formData, setFormData] = useState<ExplorationFormData>(
    initialData ?? {
      name: '',
      description: '',
      prompt: '',
      icon: 'BarChart3',
      enabled: true,
      enabledTools: AVAILABLE_TOOLS.filter((t) => !t.hidden).map((t) => t.key), // All visible tools selected by default for new
    }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleToolToggle(toolKey: string, checked: boolean) {
    setFormData((prev) => ({
      ...prev,
      enabledTools: checked
        ? [...prev.enabledTools, toolKey]
        : prev.enabledTools.filter((k) => k !== toolKey),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation (per D-04: at least one tool)
    if (formData.enabledTools.length === 0) {
      setError('At least one tool must be selected');
      return;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(formData);
      router.push('/ai-config?tab=explorations');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save exploration'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Back link */}
      <Button
        type="button"
        variant="ghost"
        onClick={() => router.push('/ai-config?tab=explorations')}
        className="mb-2 -ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Explorations
      </Button>

      <h2 className="text-xl font-semibold">
        {isEdit ? 'Edit Exploration' : 'New Exploration'}
      </h2>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="e.g., Compare to site average"
          maxLength={100}
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Short description shown on the explore tab"
          maxLength={500}
        />
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          value={formData.prompt}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, prompt: e.target.value }))
          }
          placeholder="The instruction sent to the AI model when this exploration runs..."
          rows={6}
          required
        />
        <p className="text-xs text-muted-foreground">
          This is the prompt sent to the AI. Reference tools by their function
          (e.g., &quot;Use the sitewide-compare tool&quot;).
        </p>
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs font-medium mb-1.5">Available template variables:</p>
          <div className="flex flex-wrap gap-1.5">
            {EXPLORATION_TEMPLATE_VARIABLES.map((v) => (
              <code key={v} className="text-xs bg-background px-1.5 py-0.5 rounded border">
                {v}
              </code>
            ))}
          </div>
        </div>
      </div>

      {/* Icon */}
      <div className="space-y-2">
        <Label htmlFor="icon">Icon</Label>
        <Select
          value={formData.icon}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, icon: value }))
          }
        >
          <SelectTrigger id="icon" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPLORATION_ICONS.map((icon) => {
              const Icon = ICON_MAP[icon.value];
              return (
                <SelectItem key={icon.value} value={icon.value}>
                  <span className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 shrink-0" />}
                    {icon.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, enabled: checked }))
          }
        />
        <Label htmlFor="enabled">Enabled (appears on Explore tab)</Label>
      </div>

      {/* Tools checkboxes (per D-04: at least one required) */}
      <div className="space-y-3">
        <Label>Enabled AI Tools</Label>
        <p className="text-xs text-muted-foreground">
          Select which tools the AI can use when running this exploration. At
          least one is required.
        </p>
        <div className="space-y-2">
          {AVAILABLE_TOOLS.filter((tool) => !tool.hidden).map((tool) => (
            <div key={tool.key} className="flex items-start gap-3">
              <Checkbox
                className="mt-[5px]"
                id={`tool-${tool.key}`}
                checked={formData.enabledTools.includes(tool.key)}
                onCheckedChange={(checked) =>
                  handleToolToggle(tool.key, !!checked)
                }
              />
              <div>
                <Label
                  htmlFor={`tool-${tool.key}`}
                  className="font-normal cursor-pointer"
                >
                  {tool.label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Exploration'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/ai-config?tab=explorations')}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
