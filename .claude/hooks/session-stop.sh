#!/usr/bin/env bash

# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Ontology MCP Server - Session Stop Hook                                 ║
# ║  Gracefully stops the MCP server when Claude Code session ends           ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# Configuration
MCP_PORT="${MCP_SSE_PORT:-7001}"
HTTP_API_PORT="${ONTOLOGY_API_PORT:-7000}"
MCP_PID_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.pid"
MCP_LOG_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.log"
LSP_PID_FILE="/tmp/ontology-lsp-server.pid"
LSP_LOG_FILE="/tmp/ontology-lsp-server.log"
API_PID_FILE="/tmp/ontology-api-server-${HTTP_API_PORT}.pid"
API_LOG_FILE="/tmp/ontology-api-server-${HTTP_API_PORT}.log"

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
    echo -e "${BRIGHT_CYAN}║${NC}  ${BOLD}${BRIGHT_WHITE}${STOP} Stopping Ontology Server Suite${NC}                                ${BRIGHT_CYAN}║${NC}"
    echo -e "${BRIGHT_CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo
}

# Generic function to stop a server
stop_server() {
    local server_name="$1"
    local pid_file="$2"
    local log_file="$3"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  ${INFO}  ${BOLD}Stopping ${server_name}${NC} (PID: ${BRIGHT_CYAN}$pid${NC})"
            
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
            
            echo -e "\n  ${BRIGHT_GREEN}${CHECK_MARK}${NC}  ${BOLD}${BRIGHT_GREEN}${server_name} stopped successfully${NC}"
            rm -f "$pid_file"
            
            # Clean up old log files if they're getting large
            if [ -f "$log_file" ] && [ $(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo 0) -gt 10485760 ]; then
                echo -e "  ${DIM}Archiving large log file...${NC}"
                mv "$log_file" "${log_file}.$(date +%Y%m%d_%H%M%S)"
            fi
            
            return 0
        else
            echo -e "  ${DIM}${server_name} process not found (stale PID file)${NC}"
            rm -f "$pid_file"
            return 0
        fi
    else
        echo -e "  ${DIM}No ${server_name} running (no PID file found)${NC}"
        return 0
    fi
}

# Main logic
main() {
    print_header
    
    local servers_stopped=0
    local servers_failed=0
    
    # Stop all servers
    echo -e "  ${BOLD}${BRIGHT_WHITE}Stopping all Ontology servers...${NC}"
    echo
    
    # 1. Stop MCP Server
    if stop_server "MCP Server" "$MCP_PID_FILE" "$MCP_LOG_FILE"; then
        servers_stopped=$((servers_stopped + 1))
    else
        servers_failed=$((servers_failed + 1))
    fi
    
    # 2. Stop HTTP API Server
    if stop_server "HTTP API Server" "$API_PID_FILE" "$API_LOG_FILE"; then
        servers_stopped=$((servers_stopped + 1))
    else
        servers_failed=$((servers_failed + 1))
    fi
    
    # 3. Stop LSP Server
    if stop_server "LSP Server" "$LSP_PID_FILE" "$LSP_LOG_FILE"; then
        servers_stopped=$((servers_stopped + 1))
    else
        servers_failed=$((servers_failed + 1))
    fi
    
    # Show summary
    echo
    if [ $servers_failed -eq 0 ]; then
        echo -e "  ${BRIGHT_CYAN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_CYAN}${WAVE} Session ended. All servers have been stopped.${NC}"
        echo -e "  ${BRIGHT_CYAN}════════════════════════════════════════════════════════════════${NC}"
    else
        echo -e "  ${BRIGHT_YELLOW}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_YELLOW}${WAVE} Session ended. Some servers may still be running.${NC}"
        echo -e "  ${BRIGHT_YELLOW}════════════════════════════════════════════════════════════════${NC}"
    fi
    echo
}

# Run main function
main