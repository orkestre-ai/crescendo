#!/bin/bash

# Google Analytics 4 Setup Script for Crescendo
# Automates the GA4 credential setup process using gcloud CLI
#
# What this script does:
#   1. Authenticates you with Google
#   2. Creates (or reuses) the orkestre-ai-crescendo Google Cloud project
#   3. Links a billing account (required to enable APIs)
#   4. Enables the GA4 Data API
#   5. Creates a service account with a JSON key
#   6. Prompts you for your GA4 Property ID
#   7. Shows instructions to grant the service account Viewer access
#   8. Writes the credentials to .env.local
#
# Prerequisites: gcloud CLI, jq
# Time: ~3 minutes

set -e

# ============================================================================
# Shared print helpers (colors, icons, print_success/error/warning/info/header)
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/print.sh
source "$SCRIPT_DIR/lib/print.sh"

# Project root (for finding .env.local)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

# Fixed project and service account names
GCP_PROJECT="orkestre-ai-crescendo"
SA_NAME="crescendo-ga4"
SA_DISPLAY_NAME="Crescendo GA4 Reader"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

# Temp key file (no suffix after Xs — macOS mktemp requires Xs at the end)
TMP_KEY_FILE=$(mktemp /tmp/crescendo-ga4-XXXXXX)

# Cleanup on exit
cleanup() {
    if [ -f "$TMP_KEY_FILE" ]; then
        rm -f "$TMP_KEY_FILE"
    fi
}
trap cleanup EXIT

# ============================================================================
# Step 1: Check prerequisites
# ============================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    # gcloud CLI
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed"
        echo ""
        echo "  Install it:"
        echo "    macOS (Homebrew): brew install --cask google-cloud-sdk"
        echo "    macOS (manual):   curl https://sdk.cloud.google.com | bash"
        echo "    Linux:            curl https://sdk.cloud.google.com | bash"
        echo "    Windows:          https://cloud.google.com/sdk/docs/install"
        echo ""
        exit 1
    fi
    print_success "gcloud CLI is installed"

    # jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed"
        echo ""
        echo "  Install it:"
        echo "    macOS:   brew install jq"
        echo "    Linux:   sudo apt-get install jq"
        echo "    Windows: https://jqlang.github.io/jq/download/"
        echo ""
        exit 1
    fi
    print_success "jq is installed"
}

# ============================================================================
# Step 2: Authenticate with Google
# ============================================================================

authenticate() {
    print_header "Google Authentication"

    # Check if already authenticated
    CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)

    if [ -n "$CURRENT_ACCOUNT" ]; then
        print_info "Currently authenticated as: ${BOLD}$CURRENT_ACCOUNT${NC}"
        echo ""
        read -p "  Use this account? (Y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            print_success "Using existing authentication"
            return 0
        fi
    fi

    print_info "Opening browser for Google sign-in..."
    echo ""
    gcloud auth login --brief

    CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
    if [ -z "$CURRENT_ACCOUNT" ]; then
        print_error "Authentication failed"
        exit 1
    fi
    print_success "Authenticated as: ${BOLD}$CURRENT_ACCOUNT${NC}"
}

# ============================================================================
# Step 3: Create or reuse the Google Cloud project
# ============================================================================

setup_project() {
    print_header "Google Cloud Project"

    # Check if the project already exists
    EXISTING=$(gcloud projects describe "$GCP_PROJECT" --format="value(projectId)" 2>/dev/null || true)

    if [ "$EXISTING" = "$GCP_PROJECT" ]; then
        print_success "Project already exists: ${BOLD}$GCP_PROJECT${NC}"
        gcloud config set project "$GCP_PROJECT" --quiet
    else
        print_info "Creating project: ${BOLD}$GCP_PROJECT${NC}"

        if ! gcloud projects create "$GCP_PROJECT" --name="Orkestre AI Crescendo" 2>&1; then
            print_error "Failed to create project"
            echo ""
            echo "  Common causes:"
            echo "    - Project ID already taken by another account"
            echo "    - You've hit the project quota (delete unused projects)"
            echo "    - Organization policy restrictions"
            echo ""
            exit 1
        fi

        gcloud config set project "$GCP_PROJECT" --quiet
        print_success "Project created: ${BOLD}$GCP_PROJECT${NC}"
    fi

    # Check billing
    check_billing
}

check_billing() {
    print_info "Checking billing status..."
    BILLING=$(gcloud billing projects describe "$GCP_PROJECT" --format="value(billingEnabled)" 2>/dev/null || true)

    if [ "$BILLING" = "True" ]; then
        print_success "Billing is enabled"
        return 0
    fi

    print_warning "Billing is not enabled on this project"
    echo ""
    echo "  Google Cloud requires billing to enable APIs (the GA4 API itself is free)."
    echo ""

    BILLING_ACCOUNTS=$(gcloud billing accounts list --format="value(name,displayName)" --filter="open=true" 2>/dev/null || true)

    if [ -n "$BILLING_ACCOUNTS" ]; then
        echo "  Your billing accounts:"
        echo ""

        INDEX=1
        BILLING_IDS=()
        while IFS=$'\t' read -r bid bname; do
            printf "    ${BOLD}%2d)${NC} %s\n" "$INDEX" "$bname"
            BILLING_IDS+=("$bid")
            INDEX=$((INDEX + 1))
        done <<< "$BILLING_ACCOUNTS"
        echo ""

        read -p "  Select a billing account [1-$((INDEX - 1))]: " BILLING_SELECTION

        if [ -n "$BILLING_SELECTION" ] && [ "$BILLING_SELECTION" -ge 1 ] && [ "$BILLING_SELECTION" -lt "$INDEX" ] 2>/dev/null; then
            SELECTED_BILLING="${BILLING_IDS[$((BILLING_SELECTION - 1))]}"
            gcloud billing projects link "$GCP_PROJECT" --billing-account="$SELECTED_BILLING" --quiet
            print_success "Billing account linked"
        else
            print_error "Billing is required to continue"
            echo ""
            echo "  Link billing manually:"
            echo "    https://console.cloud.google.com/billing/linkedaccount?project=$GCP_PROJECT"
            echo ""
            echo "  Then re-run: npm run setup:ga4"
            exit 1
        fi
    else
        print_error "No billing accounts found"
        echo ""
        echo "  Create a billing account and link it to the project:"
        echo "    https://console.cloud.google.com/billing/linkedaccount?project=$GCP_PROJECT"
        echo ""
        echo "  Then re-run: npm run setup:ga4"
        exit 1
    fi
}

# ============================================================================
# Step 4: Enable APIs
# ============================================================================

enable_apis() {
    print_header "Enabling APIs"

    print_info "Enabling Google Analytics Data API..."
    if gcloud services enable analyticsdata.googleapis.com --quiet 2>&1; then
        print_success "Google Analytics Data API enabled"
    else
        print_error "Failed to enable Google Analytics Data API"
        echo "  This usually means billing is not linked. Run: npm run setup:ga4"
        exit 1
    fi
}

# ============================================================================
# Step 5: Create service account
# ============================================================================

create_service_account() {
    print_header "Service Account"

    # Check if service account already exists
    EXISTING_SA=$(gcloud iam service-accounts list --filter="email:$SA_EMAIL" --format="value(email)" 2>/dev/null || true)

    if [ -n "$EXISTING_SA" ]; then
        print_info "Service account already exists: ${BOLD}$SA_EMAIL${NC}"
        echo ""
        read -p "  Reuse it? (Y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            print_info "Deleting existing service account..."
            gcloud iam service-accounts delete "$SA_EMAIL" --quiet
            print_info "Creating new service account..."
            gcloud iam service-accounts create "$SA_NAME" \
                --display-name="$SA_DISPLAY_NAME" --quiet
            print_success "Service account recreated"
        else
            print_success "Reusing existing service account"
        fi
    else
        print_info "Creating service account..."
        gcloud iam service-accounts create "$SA_NAME" \
            --display-name="$SA_DISPLAY_NAME" --quiet
        print_success "Service account created: ${BOLD}$SA_EMAIL${NC}"
    fi
}

# ============================================================================
# Step 6: Create JSON key
# ============================================================================

create_key() {
    print_header "Service Account Key"

    print_info "Generating JSON key file..."
    gcloud iam service-accounts keys create "$TMP_KEY_FILE" \
        --iam-account="$SA_EMAIL" --quiet

    if [ ! -s "$TMP_KEY_FILE" ]; then
        print_error "Failed to generate key file"
        exit 1
    fi

    # Validate it's valid JSON
    if ! jq empty "$TMP_KEY_FILE" 2>/dev/null; then
        print_error "Generated key file is not valid JSON"
        exit 1
    fi

    print_success "JSON key generated"
}

# ============================================================================
# Step 7: Get GA4 Property ID
# ============================================================================

get_ga4_property() {
    print_header "GA4 Property ID"

    echo -e "  You need your GA4 Property ID. To find it:"
    echo ""
    echo -e "    1. Go to ${BOLD}https://analytics.google.com${NC}"
    echo "    2. Select your property"
    echo -e "    3. Click the ${BOLD}Admin${NC} gear icon (bottom left)"
    echo -e "    4. Under \"Property\", click ${BOLD}Property Settings${NC}"
    echo -e "    5. Copy the ${BOLD}Property ID${NC} (a number like 123456789)"
    echo ""

    read -p "  Property ID: " MANUAL_ID

    if [[ "$MANUAL_ID" =~ ^[0-9]+$ ]]; then
        GA4_PROPERTY="properties/$MANUAL_ID"
        print_success "Using property: ${BOLD}$GA4_PROPERTY${NC}"
    elif [[ "$MANUAL_ID" =~ ^properties/[0-9]+$ ]]; then
        GA4_PROPERTY="$MANUAL_ID"
        print_success "Using property: ${BOLD}$GA4_PROPERTY${NC}"
    else
        print_error "Invalid property ID — expected a number like 123456789"
        exit 1
    fi
}

# ============================================================================
# Step 8: Grant service account access to GA4
# ============================================================================

grant_ga4_access() {
    print_header "Grant GA4 Access"

    echo -e "  The service account needs ${BOLD}Viewer${NC} access to your GA4 property."
    echo ""
    echo "  Follow these steps:"
    echo ""
    echo -e "    1. Go to ${BOLD}https://analytics.google.com${NC}"
    echo -e "    2. Click ${BOLD}Admin${NC} (gear icon, bottom left)"
    echo -e "    3. Under \"Property\", click ${BOLD}Property Access Management${NC}"
    echo -e "    4. Click the ${BOLD}+${NC} button → ${BOLD}Add users${NC}"
    echo -e "    5. Paste this email:"
    echo ""
    echo -e "       ${BOLD}$SA_EMAIL${NC}"
    echo ""
    echo -e "    6. Uncheck \"Notify new users by email\""
    echo -e "    7. Set role to: ${BOLD}Viewer${NC}"
    echo -e "    8. Click ${BOLD}Add${NC}"
    echo ""

    read -p "  Press Enter once you've added the service account..."
    print_success "Continuing with setup"
}

# ============================================================================
# Step 9: Write to .env.local
# ============================================================================

write_env_local() {
    print_header "Updating .env.local"

    # Format the JSON key as a single line
    GA4_KEY_SINGLE_LINE=$(jq -c . "$TMP_KEY_FILE")

    if [ -f "$ENV_FILE" ]; then
        print_info "Found existing .env.local"

        # Check if GA4 values already exist
        HAS_PROPERTY_ID=$(grep -c "^GA4_PROPERTY_ID=" "$ENV_FILE" 2>/dev/null || echo "0")
        HAS_SA_KEY=$(grep -c "^GA4_SERVICE_ACCOUNT_KEY=" "$ENV_FILE" 2>/dev/null || echo "0")

        if [ "$HAS_PROPERTY_ID" -gt 0 ] || [ "$HAS_SA_KEY" -gt 0 ]; then
            print_warning "GA4 values already exist in .env.local"
            echo ""
            read -p "  Overwrite existing GA4 values? (Y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Nn]$ ]]; then
                print_info "Skipping .env.local update"
                echo ""
                echo "  Add these values manually:"
                echo ""
                echo "  GA4_PROPERTY_ID=\"$GA4_PROPERTY\""
                echo "  GA4_SERVICE_ACCOUNT_KEY='$GA4_KEY_SINGLE_LINE'"
                echo ""
                return
            fi
        fi

        # Remove existing GA4 lines (if any) and append new ones
        TEMP_ENV=$(mktemp)
        grep -v "^GA4_PROPERTY_ID=" "$ENV_FILE" | grep -v "^GA4_SERVICE_ACCOUNT_KEY=" > "$TEMP_ENV" || true

        # Also remove any previous "configured by setup-ga4.sh" comment
        grep -v "# Google Analytics 4 (configured by setup-ga4.sh)" "$TEMP_ENV" > "${TEMP_ENV}.clean" || true
        mv "${TEMP_ENV}.clean" "$TEMP_ENV"

        # Append new values
        {
            echo ""
            echo "# Google Analytics 4 (configured by setup-ga4.sh)"
            echo "GA4_PROPERTY_ID=\"$GA4_PROPERTY\""
            echo "GA4_SERVICE_ACCOUNT_KEY='$GA4_KEY_SINGLE_LINE'"
        } >> "$TEMP_ENV"

        mv "$TEMP_ENV" "$ENV_FILE"
        print_success "Updated .env.local with GA4 credentials"
    else
        print_info "Creating .env.local from .env.example..."

        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"

            # Replace placeholder values
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^GA4_PROPERTY_ID=.*|GA4_PROPERTY_ID=\"$GA4_PROPERTY\"|" "$ENV_FILE"
                sed -i '' "s|^GA4_SERVICE_ACCOUNT_KEY=.*|GA4_SERVICE_ACCOUNT_KEY='$GA4_KEY_SINGLE_LINE'|" "$ENV_FILE"
            else
                sed -i "s|^GA4_PROPERTY_ID=.*|GA4_PROPERTY_ID=\"$GA4_PROPERTY\"|" "$ENV_FILE"
                sed -i "s|^GA4_SERVICE_ACCOUNT_KEY=.*|GA4_SERVICE_ACCOUNT_KEY='$GA4_KEY_SINGLE_LINE'|" "$ENV_FILE"
            fi

            print_success "Created .env.local with GA4 credentials"
            print_warning "You still need to fill in the other values (EN_API_TOKEN, etc.)"
        else
            {
                echo "# Google Analytics 4 (configured by setup-ga4.sh)"
                echo "GA4_PROPERTY_ID=\"$GA4_PROPERTY\""
                echo "GA4_SERVICE_ACCOUNT_KEY='$GA4_KEY_SINGLE_LINE'"
            } > "$ENV_FILE"

            print_success "Created .env.local with GA4 credentials"
            print_warning "You'll need to add the remaining env vars (see .env.example)"
        fi
    fi
}

# ============================================================================
# Step 10: Verify
# ============================================================================

verify_setup() {
    print_header "Verification"

    # Verify the JSON key parses correctly
    KEY_EMAIL=$(jq -r '.client_email' "$TMP_KEY_FILE" 2>/dev/null || true)
    KEY_PROJECT=$(jq -r '.project_id' "$TMP_KEY_FILE" 2>/dev/null || true)

    if [ -n "$KEY_EMAIL" ] && [ -n "$KEY_PROJECT" ]; then
        print_success "Service account key is valid"
        echo -e "    Email:   ${DIM}$KEY_EMAIL${NC}"
        echo -e "    Project: ${DIM}$KEY_PROJECT${NC}"
    else
        print_warning "Could not verify key file"
    fi

    # Verify property ID format
    if [[ "$GA4_PROPERTY" =~ ^properties/[0-9]+$ ]]; then
        print_success "Property ID format is correct: $GA4_PROPERTY"
    else
        print_warning "Property ID format may be incorrect: $GA4_PROPERTY"
    fi

    # Verify .env.local has the values
    if [ -f "$ENV_FILE" ]; then
        if grep -q "^GA4_PROPERTY_ID=" "$ENV_FILE" && grep -q "^GA4_SERVICE_ACCOUNT_KEY=" "$ENV_FILE"; then
            print_success ".env.local contains GA4 credentials"
        else
            print_warning ".env.local may be missing GA4 values"
        fi
    fi
}

# ============================================================================
# Summary
# ============================================================================

show_summary() {
    print_header "Setup Complete"

    echo -e "  ${GREEN}GA4 setup is complete!${NC}"
    echo ""
    echo "  Configuration:"
    echo "    Project:         $GCP_PROJECT"
    echo "    Service Account: $SA_EMAIL"
    echo "    GA4 Property:    $GA4_PROPERTY"
    echo "    Credentials:     $ENV_FILE"
    echo ""
    echo "  Next steps:"
    echo "    1. Start the app:  npm run dev"
    echo "    2. Go to:          http://localhost:3000"
    echo "    3. Click:          'Refresh Data' to test GA4 collection"
    echo ""
    echo "  If you see GA4 errors:"
    echo "    - Wait 2-5 minutes for GA4 permissions to propagate"
    echo "    - Verify the service account has Viewer access in GA4"
    echo -e "    - Run: ${BOLD}npm run logs:tail${NC} to see detailed error messages"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}║  Crescendo GA4 Setup                  ║${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}║  Automated Google Analytics 4 setup   ║${NC}"
    echo -e "${BLUE}║  using gcloud CLI                     ║${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    authenticate
    setup_project
    enable_apis
    create_service_account
    create_key
    get_ga4_property
    grant_ga4_access
    write_env_local
    verify_setup
    show_summary
}

main
