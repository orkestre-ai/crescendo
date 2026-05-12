#!/bin/bash

# Log viewing script for Crescendo
# Usage: ./scripts/logs.sh [tail|last|search] [options]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine which log file to use based on environment
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

# Check if jq is available for JSON parsing
if command -v jq &> /dev/null; then
  HAS_JQ=true
else
  HAS_JQ=false
  echo -e "${YELLOW}⚠️  jq not found. Install for better JSON formatting: brew install jq${NC}"
fi

# Function to format JSON log entry
format_log_entry() {
  if [ "$HAS_JQ" = true ]; then
    echo "$1" | jq -c '.'
  else
    echo "$1"
  fi
}

# Function to pretty print JSON log entry
pretty_log_entry() {
  if [ "$HAS_JQ" = true ]; then
    echo "$1" | jq -r '"[\(.timestamp)] \(.levelName) \(.operation) → \(.message)"'
  else
    echo "$1"
  fi
}

# Tail live logs
tail_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo -e "${RED}❌ Log file not found: $LOG_FILE${NC}"
    echo -e "${YELLOW}   Run the app first to generate logs${NC}"
    exit 1
  fi

  echo -e "${GREEN}📋 Tailing logs from: $LOG_FILE${NC}"
  echo -e "${BLUE}   Press Ctrl+C to stop${NC}\n"

  if [[ "$LOG_FILE" == *.json ]]; then
    # JSON log file - use jq if available
    if [ "$HAS_JQ" = true ]; then
      tail -f "$LOG_FILE" | while IFS= read -r line; do
        if [ -n "$line" ]; then
          pretty_log_entry "$line" 2>/dev/null || echo "$line"
        fi
      done
    else
      tail -f "$LOG_FILE"
    fi
  else
    # Plain text log file
    tail -f "$LOG_FILE"
  fi
}

# Show last N log entries
last_logs() {
  local count=${1:-50}
  
  if [ ! -f "$LOG_FILE" ]; then
    echo -e "${RED}❌ Log file not found: $LOG_FILE${NC}"
    echo -e "${YELLOW}   Run the app first to generate logs${NC}"
    exit 1
  fi

  echo -e "${GREEN}📋 Last $count log entries from: $LOG_FILE${NC}\n"

  if [[ "$LOG_FILE" == *.json ]]; then
    # JSON log file - extract last N lines and format
    if [ "$HAS_JQ" = true ]; then
      tail -n "$count" "$LOG_FILE" | while IFS= read -r line; do
        if [ -n "$line" ]; then
          pretty_log_entry "$line" 2>/dev/null || echo "$line"
        fi
      done
    else
      tail -n "$count" "$LOG_FILE"
    fi
  else
    tail -n "$count" "$LOG_FILE"
  fi
}

# Search logs
search_logs() {
  local query=${1:-""}
  
  if [ -z "$query" ]; then
    echo -e "${RED}❌ Please provide a search query${NC}"
    echo -e "${YELLOW}   Usage: ./scripts/logs.sh search \"ERROR\"${NC}"
    exit 1
  fi

  if [ ! -f "$LOG_FILE" ]; then
    echo -e "${RED}❌ Log file not found: $LOG_FILE${NC}"
    echo -e "${YELLOW}   Run the app first to generate logs${NC}"
    exit 1
  fi

  echo -e "${GREEN}🔍 Searching for: \"$query\" in $LOG_FILE${NC}\n"

  if [[ "$LOG_FILE" == *.json ]]; then
    # JSON log file - search and format
    if [ "$HAS_JQ" = true ]; then
      grep -i "$query" "$LOG_FILE" | while IFS= read -r line; do
        if [ -n "$line" ]; then
          pretty_log_entry "$line" 2>/dev/null || echo "$line"
        fi
      done
    else
      grep -i "$query" "$LOG_FILE"
    fi
  else
    grep -i "$query" "$LOG_FILE"
  fi
}

# Main command handler
case "${1:-tail}" in
  tail)
    tail_logs
    ;;
  last)
    last_logs "${2:-50}"
    ;;
  search)
    search_logs "${2:-}"
    ;;
  *)
    echo -e "${RED}❌ Unknown command: $1${NC}"
    echo ""
    echo "Usage: ./scripts/logs.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  tail              Tail live logs (default)"
    echo "  last [N]          Show last N log entries (default: 50)"
    echo "  search \"query\"    Search logs for query"
    echo ""
    echo "Examples:"
    echo "  ./scripts/logs.sh tail"
    echo "  ./scripts/logs.sh last 100"
    echo "  ./scripts/logs.sh search \"ERROR\""
    exit 1
    ;;
esac

