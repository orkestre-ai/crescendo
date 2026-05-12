'use client';

import { useState, useRef, useEffect } from 'react';
import { clog } from '@/lib/client-logger';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  ExternalLink,
  Upload,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import type { SettingsResponse, ConnectionTestResult } from '@/types/settings';

interface GA4WizardPanelProps {
  settings: SettingsResponse;
  onSettingsUpdate: () => void;
}

const COLLECTED_METRICS = [
  { name: 'Page Views', description: 'Total views per page' },
  { name: 'Bounce Rate', description: 'Percentage of single-page sessions' },
  { name: 'Conversions', description: 'Completed donation transactions' },
  { name: 'Revenue', description: 'Total donation revenue' },
  { name: 'Session Duration', description: 'Average time on page' },
];

const TOTAL_STEPS = 5;

// --- Validation helpers ---

function validatePropertyId(value: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, normalized: '', error: 'Property ID is required' };

  // Accept bare number or properties/number
  if (/^\d+$/.test(trimmed)) {
    return { valid: true, normalized: `properties/${trimmed}` };
  }
  if (/^properties\/\d+$/.test(trimmed)) {
    return { valid: true, normalized: trimmed };
  }
  return { valid: false, normalized: trimmed, error: 'Property ID must be a number (e.g., 292436382)' };
}

function validateServiceAccountKey(value: string): {
  valid: boolean;
  email?: string;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, error: 'Service account key is required' };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, error: 'Invalid JSON. Make sure you copied the entire file contents.' };
  }

  if (parsed.type !== 'service_account') {
    return { valid: false, error: "This doesn't look like a service account key — missing \"type\": \"service_account\"." };
  }
  if (!parsed.private_key) {
    return { valid: false, error: 'Missing "private_key" field. Make sure you copied the entire JSON file.' };
  }
  if (!parsed.client_email) {
    return { valid: false, error: 'Missing "client_email" field. This key file may be corrupted.' };
  }

  return { valid: true, email: parsed.client_email as string };
}

// --- Status badge (reused from existing pattern) ---

function StatusBadge({ status }: { status: string }) {
  switch (status) {
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
          <AlertCircle className="w-3 h-3 mr-1" /> Not Configured
        </Badge>
      );
  }
}

// --- Wizard step content ---

function StepIndicator({
  number,
  isActive,
  isComplete,
}: {
  number: number;
  isActive: boolean;
  isComplete: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium shrink-0 ${
        isComplete
          ? 'bg-success/20 text-success'
          : isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      {isComplete ? <CheckCircle2 className="w-4 h-4" /> : number}
    </div>
  );
}

// --- Main component ---

export function GA4WizardPanel({ settings, onSettingsUpdate }: GA4WizardPanelProps) {
  const { googleAnalytics } = settings;

  const [showWizard, setShowWizard] = useState(!googleAnalytics.isConfigured);
  const [currentStep, setCurrentStep] = useState(1);
  const [propertyId, setPropertyId] = useState('');
  const [propertyIdError, setPropertyIdError] = useState<string | null>(null);
  const [serviceAccountKey, setServiceAccountKey] = useState('');
  const [keyValidation, setKeyValidation] = useState<{
    valid: boolean;
    email?: string;
    error?: string;
  } | null>(null);
  const [showPasteField, setShowPasteField] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- gcloud / auto-setup state ---
  const [gcloudStatus, setGcloudStatus] = useState<{
    available: boolean;
    authenticated?: boolean;
    account?: string;
    project?: { exists: boolean; billingEnabled: boolean; billingAccounts?: Array<{ id: string; name: string }> };
  } | null>(null);
  const [isAutoSetupRunning, setIsAutoSetupRunning] = useState(false);
  const [autoSetupSteps, setAutoSetupSteps] = useState<Array<{ step: string; status: string; message: string }>>([]);
  const [autoSetupError, setAutoSetupError] = useState<string | null>(null);
  const [selectedBillingAccount, setSelectedBillingAccount] = useState<string>('');
  const [billingAccounts, setBillingAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [autoSetupServiceAccountEmail, setAutoSetupServiceAccountEmail] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupSteps, setCleanupSteps] = useState<Array<{ step: string; status: string; message: string }>>([]);
  const [isListingProperties, setIsListingProperties] = useState(false);
  const [ga4Properties, setGa4Properties] = useState<Array<{ propertyId: string; displayName: string; accountName: string }>>([]);
  const [propertyListError, setPropertyListError] = useState<string | null>(null);

  // Check gcloud availability on mount
  useEffect(() => {
    if (!googleAnalytics.isConfigured || showWizard) {
      fetch('/api/settings/setup-ga4')
        .then((res) => res.json())
        .then((data) => setGcloudStatus(data))
        .catch(() => setGcloudStatus({ available: false }));
    }
  }, [googleAnalytics.isConfigured, showWizard]);

  // --- File upload handler ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setServiceAccountKey(content);
      const validation = validateServiceAccountKey(content);
      setKeyValidation(validation);
    };
    reader.readAsText(file);

    // Reset file input so the same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Paste handler ---

  const handleKeyPaste = (value: string) => {
    setServiceAccountKey(value);
    if (value.trim()) {
      setKeyValidation(validateServiceAccountKey(value));
    } else {
      setKeyValidation(null);
    }
  };

  // --- Save & Test ---

  const handleSaveAndTest = async () => {
    // Validate property ID
    const pidResult = validatePropertyId(propertyId);
    if (!pidResult.valid) {
      setPropertyIdError(pidResult.error || 'Invalid property ID');
      return;
    }
    setPropertyIdError(null);

    // Validate key
    const keyResult = validateServiceAccountKey(serviceAccountKey);
    if (!keyResult.valid) {
      setKeyValidation(keyResult);
      return;
    }

    setIsSaving(true);
    setTestResult(null);

    try {
      // Save credentials
      const saveResponse = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ga4PropertyId: pidResult.normalized,
          ga4ServiceAccountKey: serviceAccountKey.trim(),
        }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save credentials');
      }

      // Test connection
      setIsTesting(true);
      const testResponse = await fetch('/api/settings/test-ga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result: ConnectionTestResult = await testResponse.json();
      setTestResult(result);

      if (result.success) {
        // Clear form and switch to connected state
        setPropertyId('');
        setServiceAccountKey('');
        setKeyValidation(null);
        setShowWizard(false);
      }

      onSettingsUpdate();
    } catch (error) {
      clog.error('ga4-wizard', 'save-test-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTestResult({
        success: false,
        status: 'DISCONNECTED',
        message: 'Failed to save credentials. Please try again.',
      });
    } finally {
      setIsSaving(false);
      setIsTesting(false);
    }
  };

  // --- Test existing connection ---

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/settings/test-ga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result: ConnectionTestResult = await response.json();
      setTestResult(result);
      onSettingsUpdate();
    } catch (error) {
      clog.error('ga4-wizard', 'test-failed', {
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

  // --- Auto setup handler ---

  const handleAutoSetup = async (billingAccountId?: string) => {
    setIsAutoSetupRunning(true);
    setAutoSetupError(null);
    setAutoSetupSteps([]);

    try {
      const response = await fetch('/api/settings/setup-ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billingAccountId ? { billingAccountId } : {}),
      });

      const data = await response.json();
      setAutoSetupSteps(data.steps || []);

      if (data.error === 'billing_selection_required') {
        setBillingAccounts(data.billingAccounts || []);
        setAutoSetupError('billing_selection_required');
        return;
      }

      if (!data.success) {
        setAutoSetupError(data.error || 'Setup failed');
        return;
      }

      // Success! Auto-fill the key and jump to step 4
      const { keyJson, serviceAccountEmail } = data.result;
      setServiceAccountKey(keyJson);
      setKeyValidation(validateServiceAccountKey(keyJson));
      setAutoSetupServiceAccountEmail(serviceAccountEmail);
      setCurrentStep(4); // Jump to "Grant Viewer Access" step
    } catch (error) {
      clog.error('ga4-wizard', 'auto-setup-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setAutoSetupError('Failed to run automated setup. Check your internet connection.');
    } finally {
      setIsAutoSetupRunning(false);
    }
  };

  // --- gcloud auth handler ---

  const handleGcloudAuth = async () => {
    setIsAuthenticating(true);
    try {
      const response = await fetch('/api/settings/setup-ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth' }),
      });

      const data = await response.json();
      if (data.success) {
        // Re-fetch status to update the UI
        const statusRes = await fetch('/api/settings/setup-ga4');
        const status = await statusRes.json();
        setGcloudStatus(status);
      } else {
        clog.error('ga4-wizard', 'auth-failed', { error: data.error });
      }
    } catch (error) {
      clog.error('ga4-wizard', 'auth-error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // --- Cleanup handler ---

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    setCleanupSteps([]);

    try {
      const response = await fetch('/api/settings/setup-ga4', { method: 'DELETE' });
      const data = await response.json();
      setCleanupSteps(data.steps || []);
    } catch (error) {
      clog.error('ga4-wizard', 'cleanup-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setCleanupSteps([{ step: 'cleanup', status: 'failed', message: 'Cleanup request failed' }]);
    } finally {
      setIsCleaningUp(false);
    }
  };

  // --- List GA4 properties handler ---

  const handleListProperties = async () => {
    if (!serviceAccountKey) return;
    setIsListingProperties(true);
    setPropertyListError(null);

    try {
      const response = await fetch('/api/settings/setup-ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-properties', keyJson: serviceAccountKey }),
      });

      const data = await response.json();

      if (!data.success) {
        setPropertyListError(
          data.error?.includes('Viewer access')
            ? data.error
            : 'Could not find any properties. Make sure you granted Viewer access in step 4, then wait 2-5 minutes for permissions to propagate.'
        );
        return;
      }

      setGa4Properties(data.properties || []);

      if (data.properties?.length === 1) {
        // Auto-select if only one property
        setPropertyId(data.properties[0].propertyId);
        setPropertyIdError(null);
      }
    } catch (error) {
      clog.error('ga4-wizard', 'list-properties-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setPropertyListError('Failed to list properties. Please try again.');
    } finally {
      setIsListingProperties(false);
    }
  };

  // --- Enter wizard mode ---

  const handleReconfigure = () => {
    setShowWizard(true);
    setCurrentStep(1);
    setTestResult(null);
    setPropertyId('');
    setServiceAccountKey('');
    setKeyValidation(null);
    setShowPasteField(false);
    setAutoSetupSteps([]);
    setAutoSetupError(null);
    setBillingAccounts([]);
    setAutoSetupServiceAccountEmail(null);
    setCleanupSteps([]);
    setGa4Properties([]);
    setPropertyListError(null);
  };

  // --- Clear credentials handler ---

  const [isClearing, setIsClearing] = useState(false);

  const handleClearCredentials = async () => {
    setIsClearing(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ga4PropertyId: '', ga4ServiceAccountKey: '' }),
      });
      onSettingsUpdate();
      setShowWizard(true);
      setCurrentStep(1);
    } catch (error) {
      clog.error('ga4-wizard', 'clear-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsClearing(false);
    }
  };

  // --- Render connected state ---

  if (googleAnalytics.isConfigured && !showWizard) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Google Analytics 4
              </CardTitle>
              <CardDescription>GA4 analytics data collection</CardDescription>
            </div>
            <StatusBadge status={googleAnalytics.connectionStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="text-sm text-muted-foreground">Property ID</div>
            <div className="font-mono text-sm">{googleAnalytics.propertyId}</div>
            {googleAnalytics.serviceAccountEmail && (
              <>
                <div className="text-sm text-muted-foreground mt-2">Service Account</div>
                <div className="font-mono text-sm">{googleAnalytics.serviceAccountEmail}</div>
              </>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              Configured via {googleAnalytics.source === 'environment' ? 'environment variables' : 'Settings'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReconfigure}>
              Reconfigure
            </Button>
            {googleAnalytics.source === 'database' && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleClearCredentials}
                disabled={isClearing}
              >
                {isClearing ? 'Clearing...' : 'Clear'}
              </Button>
            )}
          </div>

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

          {/* Collected Metrics */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Collected Metrics</div>
            <div className="grid grid-cols-2 gap-2">
              {COLLECTED_METRICS.map((metric) => (
                <div key={metric.name} className="p-2 bg-muted rounded text-sm">
                  <div className="font-medium">{metric.name}</div>
                  <div className="text-xs text-muted-foreground">{metric.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Last Test Info */}
          {googleAnalytics.lastTestedAt && !testResult && (
            <div className="text-xs text-muted-foreground">
              Last tested: {new Date(googleAnalytics.lastTestedAt).toLocaleString()}
              {googleAnalytics.lastTestError && (
                <span className="text-destructive ml-2">
                  Error: {googleAnalytics.lastTestError}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // --- Render wizard state ---

  const steps = [
    {
      title: 'Create Google Cloud Project',
      content: (
        <div className="space-y-3 text-sm">
          <p>
            GA4 data access requires a Google Cloud project. If you already have one, you can skip
            this step.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>
              Go to{' '}
              <a
                href="https://console.cloud.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Google Cloud Console <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>Click the project dropdown at the top and select &quot;New Project&quot;</li>
            <li>Name it anything you like (e.g., &quot;Crescendo&quot;) and click Create</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Tip: If you have the <code>gcloud</code> CLI installed, you can run{' '}
            <code>npm run setup:ga4</code> to automate the entire setup.
          </p>
        </div>
      ),
    },
    {
      title: 'Enable the Google Analytics Data API',
      content: (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>In your Google Cloud project, go to APIs &amp; Services &gt; Library</li>
            <li>Search for &quot;Google Analytics Data API&quot;</li>
            <li>Click on it and press Enable</li>
          </ol>
          <div className="p-3 bg-warning/10 text-warning rounded-lg text-xs">
            <div className="flex items-center gap-1 font-medium">
              <AlertCircle className="h-3 w-3" /> Important
            </div>
            <p className="mt-1">
              Make sure you enable &quot;Google Analytics Data API&quot;, not &quot;Google Analytics
              Admin API&quot; or the deprecated &quot;Google Analytics API&quot; (Universal
              Analytics).
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Create Service Account & Download Key',
      content: (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Go to IAM &amp; Admin &gt; Service Accounts</li>
            <li>Click &quot;Create Service Account&quot;</li>
            <li>
              Name it <code>crescendo-ga4</code> (or any name), then click Create and Continue
            </li>
            <li>Skip the optional permissions steps and click Done</li>
            <li>Click on your new service account in the list</li>
            <li>Go to the Keys tab &gt; Add Key &gt; Create new key &gt; JSON</li>
            <li>A <code>.json</code> file will download — you&apos;ll need it in step 5</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Copy the service account email address (looks like{' '}
            <code>name@project-id.iam.gserviceaccount.com</code>) — you&apos;ll need it in the next
            step.
          </p>
        </div>
      ),
    },
    {
      title: 'Grant Viewer Access in GA4',
      content: (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>
              Go to{' '}
              <a
                href="https://analytics.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Google Analytics <ExternalLink className="h-3 w-3" />
              </a>{' '}
              &gt; Admin (gear icon)
            </li>
            <li>Under &quot;Property&quot;, click Property Access Management</li>
            <li>Click the + button &gt; Add users</li>
            <li>Paste the service account email from step 3</li>
            <li>Uncheck &quot;Notify new users by email&quot;</li>
            <li>Set the role to Viewer and click Add</li>
          </ol>
          {autoSetupServiceAccountEmail && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-xs font-medium">Your service account email:</div>
              <code className="text-xs mt-1 block select-all">{autoSetupServiceAccountEmail}</code>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Note: Permissions may take 2-5 minutes to propagate. If the connection test fails at
            first, wait a few minutes and try again.
          </p>
        </div>
      ),
    },
    {
      title: 'Enter Your Credentials',
      content: null, // Rendered separately because it has form fields
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Google Analytics 4
            </CardTitle>
            <CardDescription>
              {googleAnalytics.isConfigured
                ? 'Reconfigure your GA4 connection'
                : 'Set up GA4 analytics data collection'}
            </CardDescription>
          </div>
          <StatusBadge status={googleAnalytics.isConfigured ? googleAnalytics.connectionStatus : 'UNKNOWN'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Cancel button if reconfiguring */}
        {googleAnalytics.isConfigured && (
          <div className="mb-4">
            <Button variant="outline" size="sm" onClick={() => setShowWizard(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Automated Setup — not authenticated */}
        {gcloudStatus?.available && !gcloudStatus?.authenticated && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Automated Setup
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sign in with Google to automate steps 1-3
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGcloudAuth}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Waiting for sign-in...
                  </>
                ) : (
                  'Sign in with Google'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Automated Setup — authenticated */}
        {gcloudStatus?.available && gcloudStatus?.authenticated && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Automated Setup
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Signed in as {gcloudStatus.account}
                  <button
                    type="button"
                    className="ml-2 text-primary hover:underline"
                    onClick={handleGcloudAuth}
                    disabled={isAuthenticating}
                  >
                    {isAuthenticating ? 'Signing in...' : 'Switch account'}
                  </button>
                </p>
              </div>
              {!isAutoSetupRunning && autoSetupSteps.length === 0 && !autoSetupError && (
                <Button size="sm" onClick={() => handleAutoSetup()}>
                  Run Setup
                </Button>
              )}
            </div>

            {/* Progress steps */}
            {autoSetupSteps.length > 0 && (
              <div className="space-y-1.5">
                {autoSetupSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {s.status === 'success' ? (
                      <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                    ) : s.status === 'skipped' ? (
                      <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                    <span className={s.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                      {s.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Running spinner */}
            {isAutoSetupRunning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting up Google Cloud resources...
              </div>
            )}

            {/* Billing selection */}
            {autoSetupError === 'billing_selection_required' && billingAccounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Multiple billing accounts found. Select one to continue:
                </p>
                <select
                  value={selectedBillingAccount}
                  onChange={(e) => setSelectedBillingAccount(e.target.value)}
                  className="w-full p-2 text-sm border rounded-md bg-background"
                >
                  <option value="">Select a billing account...</option>
                  {billingAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => handleAutoSetup(selectedBillingAccount)}
                  disabled={!selectedBillingAccount || isAutoSetupRunning}
                >
                  {isAutoSetupRunning ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Running...
                    </>
                  ) : (
                    'Continue Setup'
                  )}
                </Button>
              </div>
            )}

            {/* Error (non-billing) */}
            {autoSetupError && autoSetupError !== 'billing_selection_required' && (
              <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                {autoSetupError}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 text-xs"
                  onClick={() => {
                    setAutoSetupError(null);
                    setAutoSetupSteps([]);
                  }}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Clean up resources */}
            {(autoSetupSteps.length > 0 || gcloudStatus?.project?.exists) && !isAutoSetupRunning && (
              <div className="pt-2 border-t">
                {cleanupSteps.length > 0 ? (
                  <div className="space-y-1.5">
                    {cleanupSteps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {s.status === 'success' ? (
                          <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                        ) : s.status === 'skipped' ? (
                          <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-destructive shrink-0" />
                        )}
                        <span className={s.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                          {s.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={handleCleanup}
                    disabled={isCleaningUp}
                  >
                    {isCleaningUp ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Cleaning up...
                      </>
                    ) : (
                      'Clean up Google Cloud resources'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* gcloud not available hint */}
        {gcloudStatus && !gcloudStatus.available && (
          <p className="text-xs text-muted-foreground mb-4">
            Tip: Install the{' '}
            <a
              href="https://cloud.google.com/sdk/docs/install"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              gcloud CLI
            </a>{' '}
            to automate steps 1-3, or follow the manual steps below.
          </p>
        )}

        {/* Stepper */}
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = currentStep === stepNumber;
          const isComplete = currentStep > stepNumber;
          const isLastStep = stepNumber === TOTAL_STEPS;

          return (
            <div key={stepNumber} className="relative">
              {/* Step header */}
              <button
                type="button"
                className="flex items-center gap-3 w-full py-3 text-left hover:bg-muted/50 rounded-lg px-2 -mx-2"
                onClick={() => {
                  if (isComplete || isActive) setCurrentStep(stepNumber);
                }}
                disabled={!isComplete && !isActive}
              >
                <StepIndicator
                  number={stepNumber}
                  isActive={isActive}
                  isComplete={isComplete}
                />
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.title}
                </span>
                {isActive ? (
                  <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                )}
              </button>

              {/* Step content */}
              {isActive && (
                <div className="ml-10 pb-4 space-y-4">
                  {/* Instructional steps (1-4) */}
                  {step.content}

                  {/* Step 5: credential inputs */}
                  {isLastStep && (
                    <div className="space-y-4">
                      {/* Property ID — with optional auto-detect */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">GA4 Property ID</label>

                        {/* Property picker (when SA key is available from auto-setup) */}
                        {serviceAccountKey && ga4Properties.length === 0 && !propertyId && (
                          <div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleListProperties}
                              disabled={isListingProperties}
                              className="w-full justify-center"
                            >
                              {isListingProperties ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Detecting properties...
                                </>
                              ) : (
                                'Detect my GA4 properties'
                              )}
                            </Button>
                            {propertyListError && (
                              <p className="text-xs text-destructive mt-1">{propertyListError}</p>
                            )}
                          </div>
                        )}

                        {/* Property dropdown (when properties detected) */}
                        {ga4Properties.length > 0 && (
                          <div className="space-y-2">
                            <select
                              value={propertyId}
                              onChange={(e) => {
                                setPropertyId(e.target.value);
                                setPropertyIdError(null);
                              }}
                              className="w-full p-2 text-sm border rounded-md bg-background"
                            >
                              <option value="">Select a property...</option>
                              {ga4Properties.map((p) => (
                                <option key={p.propertyId} value={p.propertyId}>
                                  {p.displayName} ({p.accountName}) — {p.propertyId.replace('properties/', '')}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setGa4Properties([]);
                                setPropertyId('');
                              }}
                            >
                              Enter manually instead
                            </button>
                          </div>
                        )}

                        {/* Manual input (default or fallback) */}
                        {ga4Properties.length === 0 && (
                          <Input
                            type="text"
                            value={propertyId}
                            onChange={(e) => {
                              setPropertyId(e.target.value);
                              setPropertyIdError(null);
                            }}
                            placeholder="e.g., 292436382"
                          />
                        )}

                        {propertyIdError && (
                          <p className="text-xs text-destructive">{propertyIdError}</p>
                        )}
                        {ga4Properties.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Find this in Google Analytics &gt; Admin &gt; Property Settings. It&apos;s a
                            number like 292436382.
                          </p>
                        )}
                      </div>

                      {/* Service Account Key */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Service Account JSON Key</label>

                        {/* File upload */}
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full justify-center"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload JSON Key File
                          </Button>
                        </div>

                        {/* Toggle paste */}
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPasteField(!showPasteField)}
                        >
                          {showPasteField ? 'Hide paste field' : 'or paste manually'}
                        </button>

                        {/* Paste textarea */}
                        {showPasteField && (
                          <textarea
                            value={serviceAccountKey}
                            onChange={(e) => handleKeyPaste(e.target.value)}
                            placeholder='{"type": "service_account", "project_id": "...", ...}'
                            className="w-full h-32 p-3 text-xs font-mono border rounded-md bg-background resize-none"
                          />
                        )}

                        {/* Validation feedback */}
                        {keyValidation && (
                          <div
                            className={`p-2 rounded text-xs ${
                              keyValidation.valid
                                ? 'bg-success/10 text-success'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {keyValidation.valid ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Valid key for: {keyValidation.email}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                {keyValidation.error}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Save & Test */}
                      <Button
                        onClick={handleSaveAndTest}
                        disabled={!propertyId.trim() || !serviceAccountKey.trim() || isSaving}
                        className="w-full"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {isTesting ? 'Testing Connection...' : 'Saving...'}
                          </>
                        ) : (
                          'Save & Test Connection'
                        )}
                      </Button>

                      {/* Test result */}
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
                              {testResult.success
                                ? 'Connection Successful'
                                : 'Connection Failed'}
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
                    </div>
                  )}

                  {/* Advance button for instructional steps */}
                  {!isLastStep && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep(stepNumber + 1)}
                    >
                      {stepNumber === 1 ? "I've done this / I already have a project" : "I've done this"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
