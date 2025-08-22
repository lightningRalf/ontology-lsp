#!/usr/bin/env bash

# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Ontology MCP Server - Session Stop Hook                                 ║
# ║  Gracefully stops the MCP server when Claude Code session ends           ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# Configuration
MCP_PORT="${MCP_SSE_PORT:-7001}"
PID_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.pid"
LOG_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.log"

# ANSI color codes
BOLD='\033[1m'
DIM='\033[2m'

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BRIGHT_RED='\033[0;91m'
BRIGHT_GREEN='\033[0;92m'
BRIGHT_YELLOW='\033[0;93m'
BRIGHT_CYAN='\033[0;96m'
BRIGHT_WHITE='\033[0;97m'
NC='\033[0m' # No Color

# Unicode symbols
CHECK_MARK="✓"
CROSS_MARK="✗"
INFO="ℹ"
STOP="⛔"
WAVE="👋"

# Function to print header
print_header() {
    echo
    echo -e "${BRIGHT_CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BRIGHT_CYAN}║${NC}  ${BOLD}${BRIGHT_WHITE}${STOP} Stopping Ontology MCP Server${NC}                                  ${BRIGHT_CYAN}║${NC}"
    echo -e "${BRIGHT_CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo
}

# Function to stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  ${INFO}  ${BOLD}Stopping server${NC} (PID: ${BRIGHT_CYAN}$pid${NC})"
            
            # Send SIGTERM for graceful shutdown
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait up to 5 seconds for process to exit
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                echo -ne "\r  ${DIM}Waiting for graceful shutdown${NC}$(printf '.%.0s' $(seq 1 $((count % 4))))"
                sleep 0.5
                count=$((count + 1))
            done
            
            # If still running, force kill
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "\n  ${YELLOW}⚠${NC}  ${BRIGHT_YELLOW}Forcing shutdown...${NC}"
                kill -KILL "$pid" 2>/dev/null || true
                sleep 0.5
            fi
            
            echo -e "\n  ${BRIGHT_GREEN}${CHECK_MARK}${NC}  ${BOLD}${BRIGHT_GREEN}Server stopped successfully${NC}"
            rm -f "$PID_FILE"
            
            # Clean up old log files if they're getting large
            if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt 10485760 ]; then
                echo -e "  ${DIM}Archiving large log file...${NC}"
                mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S)"
            fi
            
            return 0
        else
            echo -e "  ${DIM}Server process not found (stale PID file)${NC}"
            rm -f "$PID_FILE"
            return 0
        fi
    else
        echo -e "  ${DIM}No server running (no PID file found)${NC}"
        return 0
    fi
}

# Main logic
main() {
    print_header
    
    if stop_server; then
        echo
        echo -e "  ${BRIGHT_CYAN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_CYAN}${WAVE} Session ended. MCP Server has been stopped.${NC}"
        echo -e "  ${BRIGHT_CYAN}════════════════════════════════════════════════════════════════${NC}"
        echo
    else
        echo
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_RED}${CROSS_MARK} Error stopping server${NC}"
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
        echo
    fi
}

# Run main function
main