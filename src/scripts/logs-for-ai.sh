#!/bin/bash

# Extract last N log lines formatted for AI context
# Usage: ./scripts/logs-for-ai.sh [N]
# Output: Copies to clipboard and writes to logs/context.txt

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
CONTEXT_FILE="$LOGS_DIR/context.txt"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default to 100 lines
COUNT=${1:-100}

# Determine which log file to use
detect_log_file() {
  if [ -f "$LOGS_DIR/dev-logs.json" ]; then
    echo "$LOGS_DIR/dev-logs.json"
  elif [ -f "$LOGS_DIR/staging-logs.json" ]; then
    echo "$LOGS_DIR/staging-logs.json"
  elif [ -f "$LOGS_DIR/production-logs.json" ]; then
    echo "$LOGS_DIR/production-logs.json"
  else
    echo "$LOGS_DIR/nextjs.log"
  fi
}

LOG_FILE=$(detect_log_file)

if [ ! -f "$LOG_FILE" ]; then
  echo -e "${RED}❌ Log file not found: $LOG_FILE${NC}"
  echo -e "${YELLOW}   Run the app first to generate logs${NC}"
  exit 1
fi

echo -e "${GREEN}📋 Extracting last $COUNT log lines for AI context...${NC}"

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Extract and format logs
if [[ "$LOG_FILE" == *.json ]]; then
  # JSON log file - format nicely
  OUTPUT=$(tail -n "$COUNT" "$LOG_FILE" | head -n "$COUNT")
  
  # Create formatted output with header
  FORMATTED_OUTPUT="## Log Context (Last $COUNT entries from $(basename "$LOG_FILE"))
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

\`\`\`json
$OUTPUT
\`\`\`

---

**To reference in Cursor:** Use \`@logs/context.txt\`"
else
  # Plain text log file
  OUTPUT=$(tail -n "$COUNT" "$LOG_FILE" | head -n "$COUNT")
  
  # Create formatted output with header
  FORMATTED_OUTPUT="## Log Context (Last $COUNT entries from $(basename "$LOG_FILE"))
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

\`\`\`
$OUTPUT
\`\`\`

---

**To reference in Cursor:** Use \`@logs/context.txt\`"
fi

# Write to context file
echo "$FORMATTED_OUTPUT" > "$CONTEXT_FILE"
echo -e "${GREEN}✅ Logs written to: $CONTEXT_FILE${NC}"

# Copy to clipboard if on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  if command -v pbcopy &> /dev/null; then
    echo "$FORMATTED_OUTPUT" | pbcopy
    echo -e "${GREEN}✅ Logs copied to clipboard${NC}"
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  if command -v xclip &> /dev/null; then
    echo "$FORMATTED_OUTPUT" | xclip -selection clipboard
    echo -e "${GREEN}✅ Logs copied to clipboard (xclip)${NC}"
  elif command -v xsel &> /dev/null; then
    echo "$FORMATTED_OUTPUT" | xsel --clipboard --input
    echo -e "${GREEN}✅ Logs copied to clipboard (xsel)${NC}"
  fi
fi

echo ""
echo -e "${YELLOW}💡 To use in Cursor chat:${NC}"
echo -e "   Reference: ${GREEN}@logs/context.txt${NC}"
echo -e "   Or paste from clipboard"

