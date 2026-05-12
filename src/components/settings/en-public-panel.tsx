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

interface ENPublicPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

export function ENPublicPanel({ settings, onSettingsUpdate }: ENPublicPanelProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [region, setRegion] = useState<'us' | 'ca'>(settings.engagingNetworks.publicApi.region);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const { publicApi } = settings.engagingNetworks;

  const handleSaveAndTest = async () => {
    if (!token.trim()) return;

    setIsSaving(true);
    setTestResult(null);

    try {
      // Save the token and region
      const saveResponse = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enPublicToken: token, enRegion: region }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save Public API token');
      }

      // Test the connection
      setIsTesting(true);
      const testResponse = await fetch('/api/settings/test-en-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, region }),
      });

      const result: ConnectionTestResult = await testResponse.json();
      setTestResult(result);

      if (result.success) {
        setToken(''); // Clear input on success
      }

      onSettingsUpdate();
    } catch (error) {
      clog.error('en-public-panel', 'save-test-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTestResult({
        success: false,
        status: 'DISCONNECTED',
        message: 'Failed to save token. Please try again.',
      });
    } finally {
      setIsSaving(false);
      setIsTesting(false);
    }
  };

  const handleRegionChange = async (newRegion: 'us' | 'ca') => {
    setRegion(newRegion);

    // Save immediately if token is already configured
    if (publicApi.hasToken) {
      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enRegion: newRegion }),
        });
        onSettingsUpdate();
      } catch (error) {
        clog.error('en-public-panel', 'region-save-failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/settings/test-en-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result: ConnectionTestResult = await response.json();
      setTestResult(result);
      onSettingsUpdate();
    } catch (error) {
      clog.error('en-public-panel', 'connection-test-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
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
    switch (publicApi.connectionStatus) {
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
            <CardTitle>EN Public API Services</CardTitle>
            <CardDescription>
              Fundraising data (NetDonor)
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Token Status */}
        {publicApi.hasToken && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Current Token</div>
            <div className="font-mono text-sm">{publicApi.tokenMasked}</div>
          </div>
        )}

        {/* Region Select */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Region</label>
          <Select value={region} onValueChange={(v) => handleRegionChange(v as 'us' | 'ca')}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ca">Canada (ca)</SelectItem>
              <SelectItem value="us">United States (us)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Must match your EN account region
          </p>
        </div>

        {/* Token Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {publicApi.hasToken ? 'Update Public API Token' : 'Enter Public API Token'}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your EN Public API token..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleSaveAndTest} disabled={!token.trim() || isSaving || isTesting}>
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

        {/* Test Connection Button (for existing token) */}
        {publicApi.hasToken && !token && (
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
        {publicApi.lastTestedAt && !testResult && (
          <div className="text-xs text-muted-foreground">
            Last tested: {new Date(publicApi.lastTestedAt).toLocaleString()}
            {publicApi.lastTestError && (
              <span className="text-destructive ml-2">Error: {publicApi.lastTestError}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
