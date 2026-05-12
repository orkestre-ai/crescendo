'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { OptimizationRecommendation } from '@/types/api';
import { RecommendationCategory } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RecommendationsSectionProps {
  recommendations: OptimizationRecommendation[];
}

export function RecommendationsSection({ recommendations }: RecommendationsSectionProps) {
  const [localRecommendations, setLocalRecommendations] = useState(recommendations);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const getCategoryColor = (category: RecommendationCategory) => {
    switch (category) {
      case 'CONTENT':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DESIGN':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'PRICING':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'CTA':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'TECHNICAL':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'SOCIAL_PROOF':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCategoryLabel = (category: RecommendationCategory) => {
    return category.replace('_', ' ');
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const handleDismiss = async (id: string) => {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/recommendations/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to dismiss recommendation');

      setLocalRecommendations((prev) => prev.filter((rec) => rec.id !== id));
    } catch (error) {
      clog.error('recommendations', 'dismiss-failed', { id, error: error instanceof Error ? error.message : String(error) });
      alert('Failed to dismiss recommendation. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleImplement = async (id: string) => {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/recommendations/${id}/implement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to mark recommendation as implemented');

      setLocalRecommendations((prev) => prev.filter((rec) => rec.id !== id));
    } catch (error) {
      clog.error('recommendations', 'implement-failed', { id, error: error instanceof Error ? error.message : String(error) });
      alert('Failed to update recommendation. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  if (localRecommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active recommendations available. Trigger a data collection to generate new
            recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group recommendations by category
  const groupedRecommendations = localRecommendations.reduce(
    (acc, rec) => {
      if (!acc[rec.category]) {
        acc[rec.category] = [];
      }
      acc[rec.category].push(rec);
      return acc;
    },
    {} as Record<RecommendationCategory, OptimizationRecommendation[]>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Recommendations</CardTitle>
        <p className="text-sm text-muted-foreground">
          {localRecommendations.length} active recommendation
          {localRecommendations.length !== 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedRecommendations).map(([category, recs]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {getCategoryLabel(category as RecommendationCategory)}
            </h3>
            <div className="space-y-3">
              {recs.map((rec) => (
                <div key={rec.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getCategoryColor(rec.category)}>
                          {getCategoryLabel(rec.category)}
                        </Badge>
                        <Badge variant="outline">
                          {getConfidenceLabel(rec.confidence)} Confidence
                        </Badge>
                      </div>
                      <p className="text-sm leading-relaxed">{rec.text}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Model: {rec.modelUsed}</span>
                        {rec.tokenCount && (
                          <>
                            <span>•</span>
                            <span>Tokens: {rec.tokenCount}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImplement(rec.id)}
                      disabled={loadingId === rec.id}
                    >
                      {loadingId === rec.id ? 'Processing...' : 'Mark as Implemented'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(rec.id)}
                      disabled={loadingId === rec.id}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
