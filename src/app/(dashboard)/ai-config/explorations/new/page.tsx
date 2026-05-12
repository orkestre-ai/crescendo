'use client';

import { ExplorationForm } from '@/components/settings/exploration-form';

export default function NewExplorationPage() {
  async function handleCreate(data: {
    name: string;
    description: string;
    prompt: string;
    icon: string;
    enabled: boolean;
    enabledTools: string[];
  }) {
    const res = await fetch('/api/explorations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create exploration');
    }
  }

  return (
    <div className="p-6">
      <ExplorationForm onSubmit={handleCreate} />
    </div>
  );
}
