'use client';

import { useState } from 'react';
import { clog } from '@/lib/client-logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { SettingsResponse, ConnectionTestResult } from '@/types/settings';

const REST_DATACENTERS = {
  ca: 'https://ca.engagingnetworks.app/ens/service',
  us: 'https://us.engagingnetworks.app/ens/service',
  us2: 'https://us2.engagingnetworks.app/ens/service',
} as const;

type RestDatacenter = keyof typeof REST_DATACENTERS;

function datacenterFromUrl(url: string): RestDatacenter {
  if (url.includes('us2.')) return 'us2';
  if (url.includes('us.')) return 'us';
  return 'ca';
}

interface ENConnectionPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function ENConnectionPanel({ settings, onSettingsUpdate }: ENConnectionPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [datacenter, setDatacenter] = useState<RestDatacenter>(
    datacenterFromUrl(settings.engagingNetworks.baseUrl)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const { engagingNetworks } = settings;

  const handleSaveAndTest = async () => {
    if (!apiKey.trim()) return;

    setIsSaving(true);
    setTestResult(null);

    try {
      // Save the API key and base URL
      const saveResponse = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enApiKey: apiKey,
          enBaseUrl: REST_DATACENTERS[datacenter],
        }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save API key');
      }

      // Then test the connection
      setIsTesting(true);
      const testResponse = await fetch('/api/settings/test-en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      const result: ConnectionTestResult = await testResponse.json();
      setTestResult(result);

      if (result.success) {
        setApiKey(''); // Clear input on success
      }

      onSettingsUpdate();
    } catch (error) {
      clog.error('en-connection-panel', 'save-test-failed', { error: error instanceof Error ? error.message : String(error) });
      setTestResult({
        success: false,
        status: 'DISCONNECTED',
        message: 'Failed to save API key. Please try again.',
      });
    } finally {
      setIsSaving(false);
      setIsTesting(false);
    }
  };

  const handleDatacenterChange = async (newDc: RestDatacenter) => {
    setDatacenter(newDc);

    // Save immediately if key is already configured
    if (engagingNetworks.hasApiKey) {
      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enBaseUrl: REST_DATACENTERS[newDc] }),
        });
        onSettingsUpdate();
      } catch (error) {
        clog.error('en-connection-panel', 'datacenter-save-failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/settings/test-en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result: ConnectionTestResult = await response.json();
      setTestResult(result);
      onSettingsUpdate();
    } catch (error) {
      clog.error('en-connection-panel', 'connection-test-failed', { error: error instanceof Error ? error.message : String(error) });
      setTestResult({
        success: false,
        status: 'DISCONNECTED',
        message: 'Connection test failed. Please try again.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusBadge = () => {
    switch (engagingNetworks.connectionStatus) {
      case 'CONNECTED':
        return (
          <Badge variant="default" className="bg-success/10 text-success border-success/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
          </Badge>
        );
      case 'DISCONNECTED':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" /> Disconnected
          </Badge>
        );
      case 'TESTING':
        return (
          <Badge variant="secondary">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Testing
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <AlertCircle className="w-3 h-3 mr-1" /> Not Tested
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>EN REST API Services</CardTitle>
            <CardDescription>Page sync and management</CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current API Key Status */}
        {engagingNetworks.hasApiKey && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Current API Key</div>
            <div className="font-mono text-sm">{engagingNetworks.apiKeyMasked}</div>
            {engagingNetworks.pageCount !== null && (
              <div className="text-sm text-muted-foreground mt-1">
                {engagingNetworks.pageCount} donation pages available
              </div>
            )}
          </div>
        )}

        {/* Datacenter Select */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Datacenter</label>
          <Select value={datacenter} onValueChange={(v) => handleDatacenterChange(v as RestDatacenter)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ca">Canada (ca)</SelectItem>
              <SelectItem value="us">United States (us)</SelectItem>
              <SelectItem value="us2">United States 2 (us2)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Must match your EN account datacenter
          </p>
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {engagingNetworks.hasApiKey ? 'Update API Key' : 'Enter API Key'}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your EN API token..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleSaveAndTest} disabled={!apiKey.trim() || isSaving || isTesting}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Save & Test'
              )}
            </Button>
          </div>
        </div>

        {/* Test Connection Button (for existing key) */}
        {engagingNetworks.hasApiKey && !apiKey && (
          <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing Connection...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-3 rounded-lg ${
              testResult.success
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="font-medium">
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </span>
            </div>
            <div className="text-sm mt-1">{testResult.message}</div>
            {testResult.details?.responseTimeMs && (
              <div className="text-xs mt-1 opacity-70">
                Response time: {testResult.details.responseTimeMs}ms
              </div>
            )}
          </div>
        )}

        {/* Last Test Info */}
        {engagingNetworks.lastTestedAt && !testResult && (
          <div className="text-xs text-muted-foreground">
            Last tested: {new Date(engagingNetworks.lastTestedAt).toLocaleString()}
            {engagingNetworks.lastTestError && (
              <span className="text-destructive ml-2">Error: {engagingNetworks.lastTestError}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
