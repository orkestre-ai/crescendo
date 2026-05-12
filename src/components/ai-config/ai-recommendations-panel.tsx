'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, RotateCcw, Pencil, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/config/ai-defaults';
import { DEFAULT_CONTEXT_PROFILES } from '@/config/ai-profiles';
import type { ContextProfile } from '@/config/ai-profiles';
import type { SettingsResponse } from '@/types/settings';

const TEMPLATE_VARIABLES = [
  '{{pageUrl}}',
  '{{headline}}',
  '{{metaDescription}}',
  '{{ctaButtons}}',
  '{{donationAmounts}}',
  '{{appealText}}',
  '{{pageViews}}',
  '{{conversionRate}}',
  '{{bounceRate}}',
  '{{revenue}}',
  '{{historicalContext}}',
];

interface AiRecommendationsPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function AiRecommendationsPanel({
  settings,
  onSettingsUpdate,
}: AiRecommendationsPanelProps) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(settings.ai.systemPrompt);
  const [userPromptTemplate, setUserPromptTemplate] = useState<string | null>(
    settings.ai.userPromptTemplate
  );
  const [contextProfiles, setContextProfiles] = useState<ContextProfile[]>(
    settings.ai.contextProfiles
  );
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [userPromptOpen, setUserPromptOpen] = useState(false);

  const displaySystemPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const displayUserPromptTemplate = userPromptTemplate ?? DEFAULT_USER_PROMPT_TEMPLATE;

  // Check if any changes have been made
  const hasChanges =
    systemPrompt !== settings.ai.systemPrompt ||
    userPromptTemplate !== settings.ai.userPromptTemplate ||
    JSON.stringify(contextProfiles) !== JSON.stringify(settings.ai.contextProfiles);

  // Save recommendation settings
  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiSystemPrompt: systemPrompt,
          aiUserPromptTemplate: userPromptTemplate,
          aiContextProfiles: contextProfiles,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save recommendation settings');
      }

      setSaveResult({ success: true, message: 'Recommendation settings saved successfully.' });
      setTimeout(() => setSaveResult(null), 3000);
      onSettingsUpdate();
    } catch (error) {
      clog.error('ai-recommendations-panel', 'save-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setSaveResult({
        success: false,
        message: 'Failed to save recommendation settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Prompt helpers
  const handleSystemPromptChange = (value: string) => {
    setSystemPrompt(value === DEFAULT_SYSTEM_PROMPT ? null : value);
  };

  const handleResetSystemPrompt = () => {
    setSystemPrompt(null);
  };

  const handleUserPromptTemplateChange = (value: string) => {
    setUserPromptTemplate(value === DEFAULT_USER_PROMPT_TEMPLATE ? null : value);
  };

  const handleResetUserPromptTemplate = () => {
    setUserPromptTemplate(null);
  };

  // Profile helpers
  const handleProfileContextChange = (profileId: string, newContext: string) => {
    setContextProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, context: newContext } : p))
    );
  };

  const handleAddProfile = () => {
    const newProfile: ContextProfile = {
      id: `custom-${Date.now()}`,
      name: 'New Profile',
      description: 'Custom context profile',
      context: 'Add your CRO guidelines here...',
      isDefault: false,
    };
    setContextProfiles((prev) => [...prev, newProfile]);
    setEditingProfileId(newProfile.id);
  };

  const handleDeleteProfile = (profileId: string) => {
    setContextProfiles((prev) => prev.filter((p) => p.id !== profileId));
    if (editingProfileId === profileId) setEditingProfileId(null);
  };

  const handleProfileFieldChange = (
    profileId: string,
    field: 'name' | 'description',
    value: string
  ) => {
    setContextProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, [field]: value } : p))
    );
  };

  const handleResetProfiles = () => {
    setContextProfiles(DEFAULT_CONTEXT_PROFILES);
    setEditingProfileId(null);
  };

  return (
    <div className="space-y-6">
      {/* System Instructions & User Prompt Template */}
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations</CardTitle>
          <CardDescription>
            Configure the prompts used to generate optimization recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Collapsible open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>System Instructions</Label>
                  <p className="text-xs text-muted-foreground">
                    Customize the system prompt sent to Claude when generating recommendations
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${systemPromptOpen ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <Textarea
                  value={displaySystemPrompt}
                  onChange={(e) => handleSystemPromptChange(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  {systemPrompt !== null ? (
                    <span className="text-xs text-warning">Custom prompt in use</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Using default prompt</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetSystemPrompt}
                    disabled={systemPrompt === null}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Collapsible open={userPromptOpen} onOpenChange={setUserPromptOpen}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>User Prompt Template</Label>
                  <p className="text-xs text-muted-foreground">
                    Template for the user message sent with page data
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${userPromptOpen ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <Textarea
                  value={displayUserPromptTemplate}
                  onChange={(e) => handleUserPromptTemplateChange(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  {userPromptTemplate !== null ? (
                    <span className="text-xs text-warning">Custom template in use</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Using default template</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetUserPromptTemplate}
                    disabled={userPromptTemplate === null}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs font-medium mb-1.5">Available template variables:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <code key={v} className="text-xs bg-background px-1.5 py-0.5 rounded border">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Context Profiles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Context Profiles</CardTitle>
              <CardDescription>
                CRO guidelines applied to pages based on their campaign type
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleResetProfiles}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
              <Button variant="outline" size="sm" onClick={handleAddProfile}>
                <Plus className="h-3 w-3 mr-1" />
                Add Profile
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {contextProfiles.map((profile) => (
            <Collapsible
              key={profile.id}
              open={editingProfileId === profile.id}
              onOpenChange={(open) => setEditingProfileId(open ? profile.id : null)}
            >
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{profile.name}</span>
                    {profile.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{profile.description}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!profile.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(profile.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="mt-3 space-y-3">
                  {!profile.isDefault && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={profile.name}
                          onChange={(e) =>
                            handleProfileFieldChange(profile.id, 'name', e.target.value)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={profile.description}
                          onChange={(e) =>
                            handleProfileFieldChange(profile.id, 'description', e.target.value)
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Context Instructions</Label>
                    <Textarea
                      value={profile.context}
                      onChange={(e) => handleProfileContextChange(profile.id, e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* Save Result */}
      {saveResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            saveResult.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {saveResult.message}
        </div>
      )}

      {/* Save Button */}
      <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="w-full">
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Recommendation Settings'
        )}
      </Button>
    </div>
  );
}
