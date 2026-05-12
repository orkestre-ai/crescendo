# API Credential Setup Guide

**Created**: 2025-10-17  
**Last Updated**: 2025-11-26  
**Status**: Active

Complete guide for obtaining all required API credentials for Crescendo.

**Time estimate**: 30-45 minutes (first time)

**Required accounts**:

- Google Cloud Platform account (free tier available)
- Engaging Networks account (organization-specific)
- Anthropic account (credit card required for API access)

---

## Table of Contents

1. [Google Analytics 4 (GA4) Setup](#google-analytics-4-ga4-setup)
2. [Engaging Networks API Setup](#engaging-networks-api-setup)
3. [Anthropic Claude API Setup](#anthropic-claude-api-setup)
4. [Encryption Key Setup](#encryption-key-setup)
5. [Environment Configuration](#environment-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Google Analytics 4 (GA4) Setup

### Automated Setup (Recommended)

If you have the `gcloud` CLI and `jq` installed, you can automate the entire GA4 setup:

```bash
npm run setup:ga4
```

This script handles everything below — creating the project, service account, key, and GA4 access — in about 3 minutes. If you prefer to set things up manually, follow the steps below.

### Overview

We use the **Google Analytics Data API v1** to fetch page performance metrics (page views, bounce rate, conversions, revenue). This requires:

- A Google Cloud Project
- Google Analytics Data API enabled
- A Service Account with access to your GA4 property
- A JSON key file for authentication

**Prerequisites**:

- You must have an existing GA4 property with data
- You must have Admin access to the GA4 property
- You must have permission to create projects in Google Cloud

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Sign in with your Google account
3. Click the project dropdown at the top of the page (next to "Google Cloud")
4. Click **"NEW PROJECT"** in the top right
5. Enter project details:
   - **Project name**: `crescendo` (or your preferred name)
   - **Organization**: Select your organization (if applicable)
   - **Location**: Leave as default or select your organization
6. Click **"CREATE"**
7. Wait for project creation (10-30 seconds)
8. Select your new project from the project dropdown

### Step 2: Enable Google Analytics Data API

1. In your Google Cloud project, click the hamburger menu (☰) in the top left
2. Navigate to **"APIs & Services"** → **"Library"**
3. In the search bar, type: `Google Analytics Data API`
4. Click on **"Google Analytics Data API"** in the results
5. Click the blue **"ENABLE"** button
6. Wait for the API to be enabled (5-10 seconds)
7. You should see "API enabled" confirmation

**Important**: Make sure you enable "Google Analytics Data API" (v1), NOT:

- Google Analytics Admin API
- Google Analytics API (deprecated Universal Analytics)

### Step 3: Create Service Account

A service account is a special type of Google account that represents an application rather than a person. It allows our application to access GA4 data programmatically.

1. In Google Cloud Console, navigate to **"IAM & Admin"** → **"Service Accounts"**
2. Click **"+ CREATE SERVICE ACCOUNT"** at the top
3. Enter service account details:
   - **Service account name**: `crescendo-ga4`
   - **Service account ID**: Will auto-populate (e.g., `crescendo-ga4@project-id.iam.gserviceaccount.com`)
   - **Description**: `Service account for accessing GA4 data in Crescendo`
4. Click **"CREATE AND CONTINUE"**
5. **Grant this service account access to project** (Step 2):
   - Skip this step - we don't need project-level permissions
   - Click **"CONTINUE"**
6. **Grant users access to this service account** (Step 3):
   - Skip this step
   - Click **"DONE"**
7. You should now see your service account in the list

**IMPORTANT**: Copy the service account email address - you'll need it in Step 6.
Format: `crescendo-ga4@your-project-id.iam.gserviceaccount.com`

### Step 4: Generate and Download JSON Key File

1. In the Service Accounts list, click on your service account name (`crescendo-ga4`)
2. Click the **"KEYS"** tab at the top
3. Click **"ADD KEY"** → **"Create new key"**
4. Select **"JSON"** as the key type
5. Click **"CREATE"**
6. A JSON file will automatically download to your computer
   - Filename format: `your-project-id-abc123.json`
   - **KEEP THIS FILE SECURE** - it provides full access to your GA4 data
7. Move this file to a secure location (NOT in your git repository)

**Security Note**: This JSON file contains a private key. Never:

- Commit it to version control
- Share it publicly
- Email it unencrypted
- Store it in unsecured locations

### Step 5: Add Service Account to GA4 Property

Now we need to grant the service account permission to read your GA4 data.

1. Go to [Google Analytics](https://analytics.google.com)
2. Select your GA4 property
3. Click the **"Admin"** gear icon in the bottom left
4. In the "Property" column, click **"Property Access Management"**
5. Click the blue **"+"** button in the top right
6. Click **"Add users"**
7. Enter the service account email address:
   - Paste: `crescendo-ga4@your-project-id.iam.gserviceaccount.com`
8. Uncheck **"Notify new users by email"** (service accounts don't have email)
9. In **"Role"** dropdown, select **"Viewer"**
   - Viewer is sufficient - we only read data, never modify
10. Click **"Add"** in the top right
11. Verify the service account appears in the user list

**Common Issue**: If you get "Invalid email" error:

- Make sure you copied the entire email including the domain
- Make sure there are no extra spaces
- Make sure the service account exists in Google Cloud Console

### Step 6: Find Your GA4 Property ID

1. Still in Google Analytics Admin panel
2. In the "Property" column, click **"Property Settings"**
3. Look for **"Property ID"** at the top right
   - Format: A 9-digit number like `123456789`
4. Copy this number - you'll need it for the .env.local file

**Format for .env.local**: You must add the `properties/` prefix:

- If Property ID is: `123456789`
- Then in .env.local use: `properties/123456789`

### Step 7: Format Credentials for .env.local

You need to convert the multi-line JSON key file into a single-line string.

**Original JSON file** (example):

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  "client_email": "crescendo-ga4@your-project-id.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

**Steps to convert**:

#### Option A: Using Command Line (Mac/Linux)

```bash
# Read the file and remove all newlines and extra spaces
cat path/to/your-key-file.json | jq -c
```

Copy the output (it will be one long line).

#### Option B: Using Text Editor (All Platforms)

1. Open the JSON file in a text editor
2. Remove all newlines (make it one continuous line)
3. Make sure the outer structure is intact: `{...}`
4. Copy the entire single-line JSON

**Final format in .env.local**:

```env
GA4_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project-id",...}'
```

**Important**: Use **single quotes** around the JSON string to preserve internal double quotes.

---

## Engaging Networks API Setup

### Overview

Engaging Networks (EN) is your fundraising page platform. We need an API token to fetch page information and submission data.

**Prerequisites**:

- You must have an Engaging Networks account
- You must have Administrator access

### Step 1: Login to Engaging Networks

1. Go to your Engaging Networks admin URL:
   - Usually: `https://us.e-activist.com/` or `https://ca.e-activist.com/` or `https://ea.engagingnetworks.app/`
   - Or your organization's custom domain
2. Log in with your administrator credentials

### Step 2: Navigate to API Settings

1. In the EN admin panel, click **"Settings"** in the top navigation
2. In the left sidebar, look for **"API"** section
3. Click on **"API"** or **"API Access"**

**Note**: The exact menu structure may vary by EN version. If you can't find it:

- Try searching for "API" in the search bar
- Contact your EN account manager for guidance
- Check under "Admin" → "Settings" → "API"

### Step 3: Generate or Copy API Token

1. In the API settings page, look for **"API Token"** or **"Authentication Token"**
2. If no token exists:
   - Click **"Generate New Token"** or **"Create Token"**
   - A new token will be created (usually starts with a long alphanumeric string)
3. If a token already exists:
   - Copy the existing token
   - **Important**: If you regenerate a token, it will invalidate the old one
4. Copy the token to a secure location

**Security Note**:

- This token provides full access to your EN account
- Never share it publicly or commit it to version control
- If compromised, regenerate immediately

### Step 4: Test the Token (Optional)

You can test your token with curl:

```bash
curl -H "ens-auth-token: YOUR_TOKEN_HERE" \
     https://us.e-activist.com/ens/service/page?type=donation&status=live
```

Expected response: JSON list of your donation pages.

### Step 5: Add to .env.local

```env
EN_API_TOKEN="your_actual_token_here"
```

**Format**:

- Use double quotes
- No spaces before or after the token
- Full token string (usually 32-64 characters)

---

## Anthropic Claude API Setup

### Overview

We use Claude AI (via Anthropic API) to generate optimization recommendations based on page performance data. We specifically use the **Claude Haiku 4.5** model for cost-effective recommendations.

**Prerequisites**:

- An Anthropic account
- A credit card (required for API access, even with free credits)

### Step 1: Create Anthropic Account

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Click **"Sign Up"** in the top right
3. Sign up with:
   - Email address
   - Google account
   - Or GitHub account
4. Verify your email address
5. Complete account setup

### Step 2: Add Payment Method

1. After logging in, go to **"Settings"** → **"Billing"**
2. Click **"Add Payment Method"**
3. Enter your credit card information
4. Click **"Save"**

**Pricing Notes** (as of October 2024):

- Claude Haiku 4.5: ~$1.50/month for 50 pages/day
- Free tier: $5 credit for new accounts
- Pay-as-you-go: Billed monthly based on usage
- See [Anthropic Pricing](https://www.anthropic.com/pricing) for current rates

### Step 3: Create API Key

1. In Anthropic Console, click **"API Keys"** in the left sidebar
2. Click **"+ Create Key"** button
3. Give your key a name:
   - **Name**: `crescendo-dev` (or your preferred name)
   - **Description**: `Development key for Crescendo`
4. Click **"Create Key"**
5. **IMPORTANT**: Copy the key immediately
   - Format: `sk-ant-api03-...` (long alphanumeric string)
   - This key will only be shown once
   - Store it securely

**Security Note**:

- If you lose the key, you'll need to create a new one
- Never commit API keys to version control
- Rotate keys periodically for security

### Step 4: Set Usage Limits (Optional but Recommended)

1. Go to **"Settings"** → **"Billing"** → **"Usage Limits"**
2. Set a monthly spending limit:
   - Recommended: $10-20/month for development
   - Production: Based on your page count and frequency
3. Enable email alerts for:
   - 50% of limit reached
   - 80% of limit reached
   - 100% of limit reached

### Step 5: Add to .env.local

```env
ANTHROPIC_API_KEY="sk-ant-api03-YOUR_ACTUAL_KEY_HERE"
```

**Format**:

- Must start with `sk-ant-`
- Use double quotes
- Full key string (usually 100+ characters)

---

## Encryption Key Setup

### Overview

The Settings page uses AES-256-GCM encryption to securely store API keys in the database. You need to generate a 32-byte (64-character hex) encryption key.

**Prerequisites**:

- Node.js installed (for key generation)

### Step 1: Generate Encryption Key

Generate a random 32-byte encryption key using one of these methods:

#### Option A: Using Node.js (Recommended)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This will output a 64-character hexadecimal string like:

```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

#### Option B: Using OpenSSL (Mac/Linux)

```bash
openssl rand -hex 32
```

#### Option C: Online Generator

Visit [Random.org](https://www.random.org/strings/) and generate a 64-character hexadecimal string.

### Step 2: Add to .env.local

Copy the generated key and add it to your `.env.local` file:

```env
ENCRYPTION_KEY="your_64_character_hex_key_here"
```

**Format**:

- Must be exactly 64 hexadecimal characters (0-9, a-f)
- Use double quotes
- No spaces or special characters

**Security Note**:

- This key encrypts sensitive data in the database
- Never share this key or commit it to version control
- If compromised, regenerate the key and re-encrypt all stored API keys
- Store securely (use a password manager)

### Step 3: Verify Key Format

The encryption key must be exactly 32 bytes (64 hex characters). Verify with:

```bash
# Check length (should be 64)
echo -n "YOUR_KEY_HERE" | wc -c

# Verify hex format (should return empty if valid)
echo "YOUR_KEY_HERE" | grep -vE '^[0-9a-fA-F]{64}$' && echo "Invalid format"
```

---

## Environment Configuration

Now that you have all credentials, create your `.env.local` file.

### Step 1: Copy Template

```bash
cp .env.example .env.local
```

### Step 2: Edit .env.local

Open `.env.local` in your text editor and fill in the values:

```env
# ============================================================================
# DATABASE (Docker PostgreSQL)
# ============================================================================

POSTGRES_URL="postgresql://postgres:postgres@localhost:54320/crescendo"
POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:54320/crescendo?pgbouncer=true"
POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:54320/crescendo"

# ============================================================================
# ENGAGING NETWORKS API
# ============================================================================

EN_API_TOKEN="your_actual_en_token_here"

# ============================================================================
# GOOGLE ANALYTICS 4
# ============================================================================

GA4_PROPERTY_ID="properties/123456789"

GA4_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"crescendo-ga4@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'

# ============================================================================
# ANTHROPIC CLAUDE API
# ============================================================================

ANTHROPIC_API_KEY="sk-ant-api03-your_actual_key_here"

# ============================================================================
# ENCRYPTION
# ============================================================================

ENCRYPTION_KEY="your_64_character_hex_key_here"

# ============================================================================
# APP CONFIGURATION
# ============================================================================

NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="change_this_to_a_random_32_character_string"
NODE_ENV="development"
```

### Step 3: Generate Cron Secret

The cron secret is used to authenticate scheduled jobs. Generate a random 32+ character string:

```bash
# Option 1: Using openssl (Mac/Linux)
openssl rand -hex 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Online generator
# Visit: https://www.random.org/strings/
```

Copy the generated string and use it as your `CRON_SECRET`.

### Step 4: Verify Configuration

Run the environment validator:

```bash
npm run type-check
```

This will validate all environment variables are properly formatted.

---

## Troubleshooting

### Google Analytics 4 Issues

#### "Permission denied" or "403 Forbidden"

**Cause**: Service account doesn't have access to GA4 property.

**Solution**:

1. Verify service account email is correct
2. Check GA4 Property Access Management
3. Ensure service account has "Viewer" role
4. Wait 5-10 minutes for permissions to propagate

#### "Property not found" or "404"

**Cause**: Property ID is incorrect or doesn't exist.

**Solution**:

1. Verify Property ID format: `properties/123456789`
2. Check GA4 Admin → Property Settings for correct ID
3. Ensure you have access to the property

#### "API not enabled"

**Cause**: Google Analytics Data API not enabled in Google Cloud project.

**Solution**:

1. Go to Google Cloud Console
2. Navigate to APIs & Services → Library
3. Search for "Google Analytics Data API"
4. Click "Enable"

#### "Invalid credentials" or "401 Unauthorized"

**Cause**: JSON key file is malformed or invalid.

**Solution**:

1. Verify JSON is properly formatted (use `jq` to validate)
2. Check for missing quotes or brackets
3. Ensure entire JSON is on one line in .env.local
4. Regenerate service account key if necessary

### Engaging Networks Issues

#### "Invalid token" or "401 Unauthorized"

**Cause**: API token is incorrect or expired.

**Solution**:

1. Log into EN admin panel
2. Navigate to Settings → API
3. Verify token matches exactly
4. Regenerate token if necessary
5. Update .env.local with new token

#### "Rate limit exceeded" or "429"

**Cause**: Too many API requests in a short time.

**Solution**:

1. The app implements automatic retry with backoff
2. If persistent, contact EN support about rate limits
3. Consider reducing collection frequency

### Anthropic Claude Issues

#### "Invalid API key" or "401 Unauthorized"

**Cause**: API key is incorrect or revoked.

**Solution**:

1. Verify key starts with `sk-ant-`
2. Check for extra spaces or quotes
3. Generate new API key in Anthropic Console
4. Update .env.local

#### "Insufficient credits" or "Payment required"

**Cause**: Account has insufficient credits or no payment method.

**Solution**:

1. Go to Anthropic Console → Billing
2. Add payment method
3. Purchase credits or wait for monthly reset

#### "Rate limit exceeded"

**Cause**: Too many requests per minute.

**Solution**:

1. The app implements automatic rate limiting
2. If persistent, consider upgrading Anthropic plan
3. Reduce concurrent page processing

### Encryption Key Issues

#### "Invalid encryption key" or "Key length mismatch"

**Cause**: Encryption key is not exactly 64 hexadecimal characters.

**Solution**:

1. Verify key is exactly 64 characters long
2. Ensure it contains only hexadecimal characters (0-9, a-f)
3. Regenerate key using one of the methods above
4. Update .env.local

#### "Decryption failed" or "Authentication tag mismatch"

**Cause**: Encryption key changed or corrupted data.

**Solution**:

1. Verify ENCRYPTION_KEY matches the key used when data was encrypted
2. If key was changed, you'll need to re-encrypt all stored API keys
3. Check for typos or extra spaces in .env.local

### Environment Configuration Issues

#### "Missing required environment variable"

**Cause**: .env.local is missing a required variable.

**Solution**:

1. Compare .env.local with .env.example
2. Ensure all variables are present
3. Check for typos in variable names

#### "Invalid environment variable format"

**Cause**: Variable value doesn't match expected format.

**Solution**:

1. Review format requirements above
2. Use single quotes for JSON strings (GA4_SERVICE_ACCOUNT_KEY)
3. Use double quotes for simple strings
4. No spaces around equals sign

---

## Next Steps

After completing credential setup:

1. **Initialize Database**:

   ```bash
   ./src/scripts/init-db.sh
   ```

2. **Verify Setup**:

   ```bash
   npm run dev
   ```

3. **Test Data Collection** (optional):
   - Go to http://localhost:3000
   - Click "Refresh Data" to trigger manual collection
   - Monitor for errors in terminal

4. **Review Logs**:
   - Check for authentication errors
   - Verify API connections
   - Confirm data collection succeeds

---

## Related Documentation

- [Docker Setup Guide](./docker-setup.md) - Set up local PostgreSQL database
- [Engaging Networks API Reference](../api/engaging-networks.md) - EN API documentation
- [Google Analytics Reference](../api/google-analytics.md) - GA4 API documentation

---

## Security Best Practices

1. **Never commit credentials to version control**:
   - `.env.local` is in `.gitignore`
   - Double-check before pushing code

2. **Rotate credentials periodically**:
   - Regenerate API keys every 90 days
   - Update service account keys annually
   - Rotate encryption key annually (requires re-encryption)

3. **Use separate credentials for environments**:
   - Development: Use test/sandbox accounts when possible
   - Production: Use dedicated service accounts

4. **Monitor usage**:
   - Set spending limits in Anthropic Console
   - Monitor GA4 API quota usage
   - Review EN API logs regularly

5. **Secure storage**:
   - Use password manager for API keys and encryption key
   - Encrypt service account JSON files
   - Restrict file permissions on .env.local

---

## Support Resources

- **Google Analytics**: [GA4 Help Center](https://support.google.com/analytics)
- **Google Cloud**: [Service Account Documentation](https://cloud.google.com/iam/docs/service-accounts)
- **Engaging Networks**: Contact your account manager or support team
- **Anthropic**: [API Documentation](https://docs.anthropic.com)
- **Project Issues**: [GitHub Issues](https://github.com/your-org/crescendo/issues)
