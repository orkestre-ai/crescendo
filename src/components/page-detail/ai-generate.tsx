'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { RecommendationsSection } from './recommendations';
import type { OptimizationRecommendation } from '@/types/api';
import type { ContextProfile } from '@/config/ai-profiles';

interface AIGenerateProps {
  recommendations: OptimizationRecommendation[];
  pageId: string;
  profiles: ContextProfile[];
  currentProfileId: string | null;
}

export function AIGenerate({
  recommendations,
  pageId,
  profiles,
  currentProfileId,
}: AIGenerateProps) {
  const [selectedProfile, setSelectedProfile] = useState(currentProfileId || 'general-donation');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setJobStatus('Starting...');

    try {
      const response = await fetch(`/api/pages/${pageId}/recommend`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.jobId) {
        throw new Error('No job ID returned');
      }

      // Poll for job completion
      intervalRef.current = setInterval(async () => {
        try {
          const jobRes = await fetch(`/api/jobs/${data.jobId}`);
          if (!jobRes.ok) {
            stopPolling();
            setError('Failed to check job status');
            setIsGenerating(false);
            return;
          }

          const jobData = await jobRes.json();
          const status = jobData.job?.status;
          const progress = jobData.job?.progress ?? 0;

          setJobStatus(`Generating recommendations... ${progress}%`);

          if (status === 'COMPLETED' || status === 'COMPLETED_WITH_ERRORS') {
            stopPolling();
            setJobStatus('Complete! Refreshing...');
            setTimeout(() => window.location.reload(), 1000);
          } else if (status === 'FAILED') {
            stopPolling();
            setError('Recommendation generation failed. Check logs for details.');
            setIsGenerating(false);
          }
        } catch {
          stopPolling();
          setError('Lost connection while checking job status');
          setIsGenerating(false);
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setIsGenerating(false);
      setJobStatus(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedProfile} onValueChange={setSelectedProfile}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select profile" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleGenerate} disabled={isGenerating} variant="outline">
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isGenerating ? 'Generating...' : 'Generate Recommendations'}
        </Button>
      </div>

      {jobStatus && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isGenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          )}
          {jobStatus}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <RecommendationsSection recommendations={recommendations} />
    </div>
  );
}
