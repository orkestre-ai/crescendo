'use client';

import { use, useEffect, useState } from 'react';
import { DefinitionForm, type DefinitionFormData } from '@/components/reports/definition-form';
import { Skeleton } from '@/components/ui/skeleton';

type Loaded = DefinitionFormData & { isDefault: boolean };

export default function EditReportDefinitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [definition, setDefinition] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reports/definitions/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load the report');
        setDefinition(json.definition);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load the report');
      }
    }
    load();
  }, [id]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">{error}</div>
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <DefinitionForm
        definitionId={id}
        isBuiltin={definition.isDefault}
        initial={{
          name: definition.name,
          description: definition.description,
          prompt: definition.prompt,
          inputs: definition.inputs,
          enabledTools: definition.enabledTools,
          maxSteps: definition.maxSteps,
          maxMinutes: definition.maxMinutes,
          enabled: definition.enabled,
        }}
      />
    </div>
  );
}
