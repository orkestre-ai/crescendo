'use client';

import { useState, useEffect, use } from 'react';
import { ExplorationForm } from '@/components/settings/exploration-form';
import { Skeleton } from '@/components/ui/skeleton';

interface ExplorationData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  enabled: boolean;
  enabledTools: string[];
}

export default function EditExplorationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [exploration, setExploration] = useState<ExplorationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/explorations/${id}`);
        const json = await res.json();
        if (json.success) {
          setExploration(json.data);
        } else {
          setError(json.error || 'Failed to load exploration');
        }
      } catch {
        setError('Failed to load exploration');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleUpdate(data: {
    name: string;
    description: string;
    prompt: string;
    icon: string;
    enabled: boolean;
    enabledTools: string[];
  }) {
    const res = await fetch(`/api/explorations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update exploration');
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !exploration) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
          {error || 'Exploration not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ExplorationForm
        explorationId={id}
        initialData={{
          name: exploration.name,
          description: exploration.description,
          prompt: exploration.prompt,
          icon: exploration.icon,
          enabled: exploration.enabled,
          enabledTools: exploration.enabledTools,
        }}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
