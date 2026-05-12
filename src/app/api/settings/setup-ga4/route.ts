import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { rootLogger } from '@/lib/logging';
import { mkdtempSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/setup-ga4' });

const GCP_PROJECT = 'orkestre-ai-crescendo';
const SA_NAME = 'crescendo-ga4';
const SA_DISPLAY_NAME = 'Crescendo GA4 Reader';
const SA_EMAIL = `${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com`;

// Billing account IDs follow the format XXXXXX-XXXXXX-XXXXXX
const BILLING_ID_PATTERN = /^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/;

/**
 * Execute a command safely using execFileSync (no shell interpolation).
 * All arguments are passed as an array to avoid injection.
 */
function run(cmd: string, args: string[], timeoutMs = 30000): string {
  return execFileSync(cmd, args, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function runSafe(cmd: string, args: string[]): string | null {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
}

/**
 * GET: Check if gcloud is available and authenticated.
 * Returns availability status so the UI can decide whether to show automation.
 */
export async function GET() {
  try {
    // Check gcloud installed
    const gcloudPath = runSafe('which', ['gcloud']);
    if (!gcloudPath) {
      return NextResponse.json({
        available: false,
        reason: 'gcloud CLI is not installed',
      });
    }

    // Check authentication
    const account = runSafe('gcloud', [
      'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)',
    ]);
    if (!account) {
      return NextResponse.json({
        available: true,
        authenticated: false,
        reason: 'gcloud is installed but not authenticated. Run: gcloud auth login',
      });
    }

    // Check if project exists
    const projectId = runSafe('gcloud', [
      'projects', 'describe', GCP_PROJECT, '--format=value(projectId)',
    ]);
    const projectExists = projectId === GCP_PROJECT;

    // Check billing if project exists
    let billingEnabled = false;
    let billingAccounts: Array<{ id: string; name: string }> = [];
    if (projectExists) {
      const billing = runSafe('gcloud', [
        'billing', 'projects', 'describe', GCP_PROJECT, '--format=value(billingEnabled)',
      ]);
      billingEnabled = billing === 'True';
    }

    if (!billingEnabled) {
      const accountsRaw = runSafe('gcloud', [
        'billing', 'accounts', 'list', '--filter=open=true', '--format=json',
      ]);
      if (accountsRaw) {
        try {
          const parsed = JSON.parse(accountsRaw);
          billingAccounts = parsed.map((a: { name: string; displayName: string }) => ({
            id: a.name.replace('billingAccounts/', ''),
            name: a.displayName,
          }));
        } catch { /* ignore parse errors */ }
      }
    }

    // Check if service account already exists
    const saExists = !!runSafe('gcloud', [
      'iam', 'service-accounts', 'list',
      `--project=${GCP_PROJECT}`, `--filter=email:${SA_EMAIL}`, '--format=value(email)',
    ]);

    // Check if API is enabled
    const apiEnabled = !!runSafe('gcloud', [
      'services', 'list',
      `--project=${GCP_PROJECT}`, '--filter=config.name:analyticsdata.googleapis.com',
      '--format=value(config.name)',
    ]);

    return NextResponse.json({
      available: true,
      authenticated: true,
      account,
      project: {
        id: GCP_PROJECT,
        exists: projectExists,
        billingEnabled,
        billingAccounts: billingEnabled ? [] : billingAccounts,
      },
      serviceAccount: {
        email: SA_EMAIL,
        exists: saExists,
      },
      apiEnabled,
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to check gcloud status');
    return NextResponse.json({ available: false, reason: 'Failed to check gcloud status' });
  }
}

interface SetupRequest {
  action?: 'auth' | 'setup' | 'list-properties';
  billingAccountId?: string;
  keyJson?: string;
}

interface StepResult {
  step: string;
  status: 'success' | 'skipped' | 'failed';
  message: string;
}

/**
 * POST: Run GA4 setup actions.
 *
 * Actions:
 * - { action: 'auth' } — Trigger gcloud auth login (opens browser, blocks until complete)
 * - { action: 'list-properties', keyJson } — List GA4 properties accessible to the service account
 * - { action: 'setup' } or {} — Run the full automation pipeline
 */
export async function POST(request: Request) {
  const steps: StepResult[] = [];
  let tmpKeyFile: string | null = null;

  try {
    const body: SetupRequest = await request.json().catch(() => ({}));

    // --- Auth action: trigger gcloud login ---
    if (body.action === 'auth') {
      if (!runSafe('which', ['gcloud'])) {
        return NextResponse.json(
          { success: false, error: 'gcloud CLI is not installed' },
          { status: 400 }
        );
      }

      try {
        // --brief suppresses verbose output; opens browser for OAuth
        // This blocks until the user completes sign-in in the browser
        run('gcloud', ['auth', 'login', '--brief'], 120000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ err: error instanceof Error ? error : new Error(msg) }, 'gcloud auth login failed');
        return NextResponse.json(
          { success: false, error: 'Authentication failed or was cancelled' },
          { status: 400 }
        );
      }

      // Verify auth succeeded
      const account = runSafe('gcloud', [
        'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)',
      ]);

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'Authentication did not complete' },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, account });
    }

    // --- List properties action: use SA credentials to list GA4 properties ---
    if (body.action === 'list-properties') {
      if (!body.keyJson) {
        return NextResponse.json(
          { success: false, error: 'keyJson is required for list-properties' },
          { status: 400 }
        );
      }

      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(body.keyJson);
        if (!credentials.private_key || !credentials.client_email) {
          throw new Error('Invalid key');
        }
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid service account key JSON' },
          { status: 400 }
        );
      }

      try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
        });

        const client = await auth.getClient();
        const tokenRes = await client.getAccessToken();

        const res = await fetch(
          'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
          { headers: { Authorization: `Bearer ${tokenRes.token}` } }
        );

        const data = await res.json();

        if (data.error) {
          const msg = data.error.message || 'Failed to list properties';
          logger.error({ event: 'ga4.list-properties.failed', error: msg }, msg);
          return NextResponse.json({ success: false, error: msg });
        }

        // Flatten accounts → properties into a simple list
        interface AccountSummary {
          displayName: string;
          propertySummaries?: Array<{
            property: string;
            displayName: string;
          }>;
        }
        const properties: Array<{
          propertyId: string;
          displayName: string;
          accountName: string;
        }> = [];

        for (const account of (data.accountSummaries || []) as AccountSummary[]) {
          for (const prop of account.propertySummaries || []) {
            properties.push({
              propertyId: prop.property, // e.g. "properties/292436382"
              displayName: prop.displayName,
              accountName: account.displayName,
            });
          }
        }

        return NextResponse.json({ success: true, properties });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ err: error instanceof Error ? error : new Error(msg) }, 'Failed to list GA4 properties');
        return NextResponse.json({
          success: false,
          error: 'Failed to list properties. Make sure the service account has Viewer access in GA4.',
        });
      }
    }

    // Validate billing account ID format if provided (prevents injection via execFileSync args)
    if (body.billingAccountId && !BILLING_ID_PATTERN.test(body.billingAccountId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid billing account ID format', steps },
        { status: 400 }
      );
    }

    // Verify gcloud is available and authenticated
    if (!runSafe('which', ['gcloud'])) {
      return NextResponse.json(
        { success: false, error: 'gcloud CLI is not installed', steps },
        { status: 400 }
      );
    }

    const account = runSafe('gcloud', [
      'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)',
    ]);
    if (!account) {
      return NextResponse.json(
        { success: false, error: 'gcloud is not authenticated. Run: gcloud auth login', steps },
        { status: 400 }
      );
    }

    // Step 1: Create or reuse project
    const projectId = runSafe('gcloud', [
      'projects', 'describe', GCP_PROJECT, '--format=value(projectId)',
    ]);

    if (projectId === GCP_PROJECT) {
      run('gcloud', ['config', 'set', 'project', GCP_PROJECT, '--quiet']);
      steps.push({ step: 'project', status: 'skipped', message: `Project ${GCP_PROJECT} already exists` });
    } else {
      try {
        run('gcloud', ['projects', 'create', GCP_PROJECT, '--name=Orkestre AI Crescendo', '--quiet']);
        run('gcloud', ['config', 'set', 'project', GCP_PROJECT, '--quiet']);
        steps.push({ step: 'project', status: 'success', message: `Created project ${GCP_PROJECT}` });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'project', status: 'failed', message: `Failed to create project: ${msg}` });
        return NextResponse.json({ success: false, error: 'Failed to create GCP project', steps });
      }
    }

    // Step 2: Check/link billing
    const billing = runSafe('gcloud', [
      'billing', 'projects', 'describe', GCP_PROJECT, '--format=value(billingEnabled)',
    ]);

    if (billing === 'True') {
      steps.push({ step: 'billing', status: 'skipped', message: 'Billing already enabled' });
    } else if (body.billingAccountId) {
      try {
        run('gcloud', [
          'billing', 'projects', 'link', GCP_PROJECT,
          `--billing-account=${body.billingAccountId}`, '--quiet',
        ]);
        steps.push({ step: 'billing', status: 'success', message: 'Billing account linked' });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'billing', status: 'failed', message: `Failed to link billing: ${msg}` });
        return NextResponse.json({ success: false, error: 'Failed to link billing account', steps });
      }
    } else {
      // No billing — check how many accounts are available
      const accountsRaw = runSafe('gcloud', [
        'billing', 'accounts', 'list', '--filter=open=true', '--format=json',
      ]);
      let accounts: Array<{ id: string; name: string }> = [];
      if (accountsRaw) {
        try {
          const parsed = JSON.parse(accountsRaw);
          accounts = parsed.map((a: { name: string; displayName: string }) => ({
            id: a.name.replace('billingAccounts/', ''),
            name: a.displayName,
          }));
        } catch { /* ignore */ }
      }

      if (accounts.length === 1) {
        // Auto-select the only billing account
        try {
          run('gcloud', [
            'billing', 'projects', 'link', GCP_PROJECT,
            `--billing-account=${accounts[0].id}`, '--quiet',
          ]);
          steps.push({ step: 'billing', status: 'success', message: `Linked billing account: ${accounts[0].name}` });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          steps.push({ step: 'billing', status: 'failed', message: `Failed to link billing: ${msg}` });
          return NextResponse.json({ success: false, error: 'Failed to link billing account', steps });
        }
      } else if (accounts.length > 1) {
        steps.push({ step: 'billing', status: 'failed', message: 'Multiple billing accounts found — select one' });
        return NextResponse.json({
          success: false,
          error: 'billing_selection_required',
          billingAccounts: accounts,
          steps,
        });
      } else {
        steps.push({ step: 'billing', status: 'failed', message: 'No billing accounts found' });
        return NextResponse.json({
          success: false,
          error: 'No billing accounts found. Create one at https://console.cloud.google.com/billing then retry.',
          steps,
        });
      }
    }

    // Step 3: Enable APIs (Data API + Admin API for property listing)
    const enabledApis = runSafe('gcloud', [
      'services', 'list',
      `--project=${GCP_PROJECT}`, '--format=value(config.name)',
    ]) || '';

    const dataApiEnabled = enabledApis.includes('analyticsdata.googleapis.com');
    const adminApiEnabled = enabledApis.includes('analyticsadmin.googleapis.com');

    if (dataApiEnabled && adminApiEnabled) {
      steps.push({ step: 'api', status: 'skipped', message: 'GA4 APIs already enabled' });
    } else {
      try {
        const apisToEnable: string[] = [];
        if (!dataApiEnabled) apisToEnable.push('analyticsdata.googleapis.com');
        if (!adminApiEnabled) apisToEnable.push('analyticsadmin.googleapis.com');
        run('gcloud', ['services', 'enable', ...apisToEnable, '--quiet']);
        steps.push({ step: 'api', status: 'success', message: `Enabled: ${apisToEnable.join(', ')}` });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'api', status: 'failed', message: `Failed to enable APIs: ${msg}` });
        return NextResponse.json({ success: false, error: 'Failed to enable GA4 APIs', steps });
      }
    }

    // Step 4: Create service account
    const saCheck = runSafe('gcloud', [
      'iam', 'service-accounts', 'list',
      `--project=${GCP_PROJECT}`, `--filter=email:${SA_EMAIL}`, '--format=value(email)',
    ]);

    if (saCheck) {
      steps.push({ step: 'serviceAccount', status: 'skipped', message: `Service account ${SA_EMAIL} already exists` });
    } else {
      try {
        run('gcloud', [
          'iam', 'service-accounts', 'create', SA_NAME,
          `--display-name=${SA_DISPLAY_NAME}`, `--project=${GCP_PROJECT}`, '--quiet',
        ]);
        steps.push({ step: 'serviceAccount', status: 'success', message: `Created service account: ${SA_EMAIL}` });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'serviceAccount', status: 'failed', message: `Failed to create service account: ${msg}` });
        return NextResponse.json({ success: false, error: 'Failed to create service account', steps });
      }
    }

    // Step 5: Generate key
    try {
      const tmpDir = mkdtempSync(join(tmpdir(), 'crescendo-ga4-'));
      tmpKeyFile = join(tmpDir, 'key.json');

      run('gcloud', [
        'iam', 'service-accounts', 'keys', 'create', tmpKeyFile,
        `--iam-account=${SA_EMAIL}`, '--quiet',
      ]);

      if (!existsSync(tmpKeyFile)) {
        throw new Error('Key file was not created');
      }

      const keyJson = readFileSync(tmpKeyFile, 'utf-8');
      const keyParsed = JSON.parse(keyJson);

      if (!keyParsed.type || !keyParsed.private_key || !keyParsed.client_email) {
        throw new Error('Generated key is missing required fields');
      }

      steps.push({ step: 'key', status: 'success', message: 'Service account key generated' });

      return NextResponse.json({
        success: true,
        steps,
        result: {
          project: GCP_PROJECT,
          serviceAccountEmail: SA_EMAIL,
          keyJson,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      steps.push({ step: 'key', status: 'failed', message: `Failed to generate key: ${msg}` });
      return NextResponse.json({ success: false, error: 'Failed to generate service account key', steps });
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'GA4 setup automation failed');
    return NextResponse.json(
      { success: false, error: 'Setup automation failed', steps },
      { status: 500 }
    );
  } finally {
    if (tmpKeyFile) {
      try { unlinkSync(tmpKeyFile); } catch { /* ignore */ }
    }
  }
}

/**
 * DELETE: Clean up GCP resources created by the automated setup.
 * Deletes the service account (and its keys), and optionally disables the API.
 */
export async function DELETE() {
  const steps: StepResult[] = [];

  try {
    if (!runSafe('which', ['gcloud'])) {
      return NextResponse.json(
        { success: false, error: 'gcloud CLI is not installed', steps },
        { status: 400 }
      );
    }

    // Check if project exists
    const projectId = runSafe('gcloud', [
      'projects', 'describe', GCP_PROJECT, '--format=value(projectId)',
    ]);

    if (projectId !== GCP_PROJECT) {
      steps.push({ step: 'project', status: 'skipped', message: 'Project does not exist — nothing to clean up' });
      return NextResponse.json({ success: true, steps });
    }

    // Delete service account (this also deletes all its keys)
    const saCheck = runSafe('gcloud', [
      'iam', 'service-accounts', 'list',
      `--project=${GCP_PROJECT}`, `--filter=email:${SA_EMAIL}`, '--format=value(email)',
    ]);

    if (saCheck) {
      try {
        run('gcloud', [
          'iam', 'service-accounts', 'delete', SA_EMAIL,
          `--project=${GCP_PROJECT}`, '--quiet',
        ]);
        steps.push({ step: 'serviceAccount', status: 'success', message: `Deleted service account: ${SA_EMAIL}` });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'serviceAccount', status: 'failed', message: `Failed to delete service account: ${msg}` });
      }
    } else {
      steps.push({ step: 'serviceAccount', status: 'skipped', message: 'Service account does not exist' });
    }

    // Disable GA4 Data API
    const apiCheck = runSafe('gcloud', [
      'services', 'list',
      `--project=${GCP_PROJECT}`, '--filter=config.name:analyticsdata.googleapis.com',
      '--format=value(config.name)',
    ]);

    if (apiCheck) {
      try {
        run('gcloud', [
          'services', 'disable', 'analyticsdata.googleapis.com',
          `--project=${GCP_PROJECT}`, '--quiet',
        ]);
        steps.push({ step: 'api', status: 'success', message: 'Disabled Google Analytics Data API' });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        steps.push({ step: 'api', status: 'failed', message: `Failed to disable API: ${msg}` });
      }
    } else {
      steps.push({ step: 'api', status: 'skipped', message: 'API was not enabled' });
    }

    const allSucceeded = steps.every((s) => s.status !== 'failed');
    return NextResponse.json({ success: allSucceeded, steps });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'GA4 cleanup failed');
    return NextResponse.json(
      { success: false, error: 'Cleanup failed', steps },
      { status: 500 }
    );
  }
}
