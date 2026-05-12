#!/bin/bash

# Setup script to create symlinks from logs/ directory to /tmp log files
# This allows easy access to logs from Cursor and project directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔗 Setting up log symlinks...${NC}"

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Create symlink to dev-logs.json if it doesn't exist or is broken
if [ ! -e "$LOGS_DIR/dev-logs.json" ] || [ ! -L "$LOGS_DIR/dev-logs.json" ]; then
  if [ -L "$LOGS_DIR/dev-logs.json" ]; then
    rm "$LOGS_DIR/dev-logs.json"
  fi
  ln -sf /tmp/dev-logs.json "$LOGS_DIR/dev-logs.json"
  echo -e "${GREEN}✅ Created symlink: logs/dev-logs.json → /tmp/dev-logs.json${NC}"
else
  echo -e "${YELLOW}⚠️  Symlink already exists: logs/dev-logs.json${NC}"
fi

# Create symlink to staging-logs.json if it doesn't exist
if [ ! -e "$LOGS_DIR/staging-logs.json" ] || [ ! -L "$LOGS_DIR/staging-logs.json" ]; then
  if [ -L "$LOGS_DIR/staging-logs.json" ]; then
    rm "$LOGS_DIR/staging-logs.json"
  fi
  ln -sf /tmp/staging-logs.json "$LOGS_DIR/staging-logs.json"
  echo -e "${GREEN}✅ Created symlink: logs/staging-logs.json → /tmp/staging-logs.json${NC}"
fi

# Create symlink to production-logs.json if it doesn't exist
if [ ! -e "$LOGS_DIR/production-logs.json" ] || [ ! -L "$LOGS_DIR/production-logs.json" ]; then
  if [ -L "$LOGS_DIR/production-logs.json" ]; then
    rm "$LOGS_DIR/production-logs.json"
  fi
  ln -sf /tmp/production-logs.json "$LOGS_DIR/production-logs.json"
  echo -e "${GREEN}✅ Created symlink: logs/production-logs.json → /tmp/production-logs.json${NC}"
fi

echo -e "${GREEN}✅ Log symlinks setup complete!${NC}"
echo -e "${YELLOW}   Log files are accessible at: logs/dev-logs.json${NC}"

