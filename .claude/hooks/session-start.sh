#!/usr/bin/env bash

# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Ontology MCP Server - Session Start Hook                                ║
# ║  Automatically manages the MCP server lifecycle for Claude Code sessions ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# Configuration - Import from central config
# Get script directory and derive project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MCP_SERVER_DIR="$PROJECT_DIR/mcp-ontology-server"
LSP_SERVER_DIR="$PROJECT_DIR"

# Source configuration from the TypeScript config (defaults)
# These can be overridden by environment variables
MCP_PORT="${MCP_SSE_PORT:-7001}"
MCP_HOST="${MCP_SSE_HOST:-localhost}"
HTTP_API_PORT="${HTTP_API_PORT:-7000}"
BUN_PATH="${HOME}/.bun/bin/bun"
MCP_PID_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.pid"
MCP_LOG_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.log"
LSP_PID_FILE="/tmp/ontology-lsp-server.pid"
LSP_LOG_FILE="/tmp/ontology-lsp-server.log"
API_PID_FILE="/tmp/ontology-api-server-${HTTP_API_PORT}.pid"
API_LOG_FILE="/tmp/ontology-api-server-${HTTP_API_PORT}.log"

# ANSI color codes for beautiful output
BOLD='\033[1m'
DIM='\033[2m'
ITALIC='\033[3m'
UNDERLINE='\033[4m'
BLINK='\033[5m'
REVERSE='\033[7m'

# Colors
BLACK='\033[0;30m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'

# Bright colors
BRIGHT_BLACK='\033[0;90m'
BRIGHT_RED='\033[0;91m'
BRIGHT_GREEN='\033[0;92m'
BRIGHT_YELLOW='\033[0;93m'
BRIGHT_BLUE='\033[0;94m'
BRIGHT_MAGENTA='\033[0;95m'
BRIGHT_CYAN='\033[0;96m'
BRIGHT_WHITE='\033[0;97m'

# Background colors
BG_BLACK='\033[40m'
BG_RED='\033[41m'
BG_GREEN='\033[42m'
BG_YELLOW='\033[43m'
BG_BLUE='\033[44m'
BG_MAGENTA='\033[45m'
BG_CYAN='\033[46m'
BG_WHITE='\033[47m'

NC='\033[0m' # No Color / Reset

# Unicode symbols for status
CHECK_MARK="✓"
CROSS_MARK="✗"
ARROW="→"
BULLET="•"
STAR="★"
GEAR="⚙"
ROCKET="🚀"
LIGHTNING="⚡"
SPARKLES="✨"
WARNING="⚠"
INFO="ℹ"
HOURGLASS="⏳"
CLOCK="🕐"
PACKAGE="📦"
TOOL="🔧"
CHART="📊"
BRAIN="🧠"

# Function to print a beautiful header
print_header() {
    echo
    echo -e "${BRIGHT_CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BRIGHT_CYAN}║${NC}  ${BOLD}${BRIGHT_WHITE}${LIGHTNING} Ontology MCP Server Status${NC}                                    ${BRIGHT_CYAN}║${NC}"
    echo -e "${BRIGHT_CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo
}

# Function to print a status line with icon
print_status() {
    local icon="$1"
    local label="$2"
    local value="$3"
    local color="${4:-$BRIGHT_WHITE}"
    
    printf "  ${icon}  ${BOLD}%-20s${NC} ${color}%s${NC}\n" "$label:" "$value"
}

# Function to print a separator
print_separator() {
    echo -e "${DIM}${BRIGHT_BLACK}  ──────────────────────────────────────────────────────────────────${NC}"
}

# Function to check if server is running
is_server_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            # PID file exists but process is dead
            rm -f "$pid_file"
        fi
    fi
    return 1
}

# Function to check if port is in use
is_port_in_use() {
    local host="$1"
    local port="$2"
    nc -z "$host" "$port" 2>/dev/null
}

# Function to show startup animation
show_startup_animation() {
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local message="$1"
    local duration=${2:-10}  # Default 10 iterations (5 seconds)
    
    for i in $(seq 1 $duration); do
        frame=${frames[$((i % ${#frames[@]}))]}
        echo -ne "\r  ${BRIGHT_YELLOW}${frame}${NC}  ${message}" >&2
        sleep 0.5
    done
    echo -ne "\r\033[K" >&2  # Clear the line
}

# Generic function to start a server
start_server() {
    local server_name="$1"
    local server_dir="$2"
    local start_command="$3"
    local pid_file="$4"
    local log_file="$5"
    local check_port="${6:-}"
    local check_host="${7:-localhost}"
    
    echo
    echo -e "  ${HOURGLASS}  ${BOLD}${BRIGHT_YELLOW}Starting ${server_name}...${NC}"
    
    # Kill any existing process using the port
    if [ -n "$check_port" ]; then
        local existing_pid=$(lsof -ti:$check_port 2>/dev/null)
        if [ -n "$existing_pid" ]; then
            echo -e "  ${DIM}Killing existing process on port $check_port (PID: $existing_pid)${NC}"
            kill -9 $existing_pid 2>/dev/null || true
            sleep 1
        fi
    fi
    
    # Start the server in background with nohup to detach from terminal
    cd "$server_dir"
    nohup $start_command > "$log_file" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$pid_file"
    
    # If port provided, wait for server to be ready
    if [ -n "$check_port" ]; then
        local attempts=0
        while [ $attempts -lt 20 ]; do
            if is_port_in_use "$check_host" "$check_port"; then
                echo -e "  ${BRIGHT_GREEN}${CHECK_MARK}${NC}  ${BOLD}${BRIGHT_GREEN}${server_name} started successfully!${NC}"
                return 0
            fi
            sleep 0.5
            attempts=$((attempts + 1))
        done
    else
        # No port to check, just verify process is running
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  ${BRIGHT_GREEN}${CHECK_MARK}${NC}  ${BOLD}${BRIGHT_GREEN}${server_name} started successfully!${NC}"
            return 0
        fi
    fi
    
    # Server didn't start properly - check log for errors
    if [ -f "$log_file" ]; then
        local error_msg=$(tail -5 "$log_file" | grep -i error | head -1)
        if [ -n "$error_msg" ]; then
            echo -e "  ${BRIGHT_RED}${CROSS_MARK}${NC}  ${BOLD}${BRIGHT_RED}Failed to start ${server_name}${NC}"
            echo -e "  ${DIM}Error: $error_msg${NC}"
        else
            echo -e "  ${BRIGHT_RED}${CROSS_MARK}${NC}  ${BOLD}${BRIGHT_RED}Failed to start ${server_name}${NC}"
            echo -e "  ${DIM}Check logs at: $log_file${NC}"
        fi
    else
        echo -e "  ${BRIGHT_RED}${CROSS_MARK}${NC}  ${BOLD}${BRIGHT_RED}Failed to start ${server_name}${NC}"
    fi
    
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
    return 1
}

# Function to display server capabilities
show_capabilities() {
    echo
    echo -e "  ${BOLD}${BRIGHT_WHITE}${SPARKLES} Available Capabilities${NC}"
    print_separator
    echo -e "  ${BRIGHT_BLUE}${BULLET}${NC} ${BRAIN} ${BOLD}5-Layer Intelligence Architecture${NC}"
    echo -e "     ${DIM}Claude Tools ${ARROW} Tree-sitter ${ARROW} Ontology ${ARROW} Patterns ${ARROW} Knowledge${NC}"
    echo
    echo -e "  ${BRIGHT_BLUE}${BULLET}${NC} ${LIGHTNING} ${BOLD}Ultra-Fast Performance${NC}"
    echo -e "     ${DIM}<100ms response time for most operations${NC}"
    echo
    echo -e "  ${BRIGHT_BLUE}${BULLET}${NC} ${TOOL} ${BOLD}16 Intelligent Tools${NC}"
    echo -e "     ${DIM}Code analysis, refactoring, pattern learning & more${NC}"
    echo
    echo -e "  ${BRIGHT_BLUE}${BULLET}${NC} ${CHART} ${BOLD}Real-time Updates${NC}"
    echo -e "     ${DIM}SSE transport for instant synchronization${NC}"
}

# Function to show quick start guide
show_quick_start() {
    echo
    echo -e "  ${BOLD}${BRIGHT_WHITE}${ROCKET} Quick Start Commands${NC}"
    print_separator
    echo -e "  ${BRIGHT_CYAN}${ARROW}${NC} ${ITALIC}\"Find the definition of [ClassName]\"${NC}"
    echo -e "  ${BRIGHT_CYAN}${ARROW}${NC} ${ITALIC}\"Analyze this codebase\"${NC}"
    echo -e "  ${BRIGHT_CYAN}${ARROW}${NC} ${ITALIC}\"Suggest refactoring for [file]\"${NC}"
    echo -e "  ${BRIGHT_CYAN}${ARROW}${NC} ${ITALIC}\"What patterns exist in [module]?\"${NC}"
    echo
    echo -e "  ${DIM}${INFO} For detailed guide: ${UNDERLINE}mcp-ontology-server/docs/FIRST_STEPS.md${NC}"
}

# Main logic
main() {
    # Show immediate feedback that the script is running
    echo -e "${BRIGHT_CYAN}${LIGHTNING} Initializing Ontology Server Suite...${NC}" >&2
    
    print_header
    
    # Check if Bun is installed
    if [ ! -f "$BUN_PATH" ]; then
        print_status "${CROSS_MARK}" "Bun Runtime" "Not Found" "$BRIGHT_RED"
        echo
        echo -e "  ${WARNING}  ${BRIGHT_YELLOW}Bun is required but not installed${NC}"
        echo -e "  ${DIM}Install with: ${UNDERLINE}curl -fsSL https://bun.sh/install | bash${NC}"
        echo
        exit 1
    fi
    
    # Status tracking
    local servers_started=0
    local servers_failed=0
    
    echo -e "  ${BOLD}${BRIGHT_WHITE}${INFO} Checking Ontology Server Suite${NC}"
    print_separator
    
    # 1. Start MCP Server (if directory exists)
    if [ -d "$MCP_SERVER_DIR" ]; then
        if is_server_running "$MCP_PID_FILE"; then
            local pid=$(cat "$MCP_PID_FILE")
            print_status "${CHECK_MARK}" "MCP Server" "Running (PID: $pid)" "$BRIGHT_GREEN"
        elif is_port_in_use "$MCP_HOST" "$MCP_PORT"; then
            print_status "${WARNING}" "MCP Port $MCP_PORT" "In use by another process" "$BRIGHT_YELLOW"
        else
            if start_server "MCP Server" "$MCP_SERVER_DIR" "$BUN_PATH run src/sse-server.ts" "$MCP_PID_FILE" "$MCP_LOG_FILE" "$MCP_PORT" "$MCP_HOST"; then
                servers_started=$((servers_started + 1))
            else
                servers_failed=$((servers_failed + 1))
            fi
        fi
    fi
    
    # 2. Start HTTP API Server
    if [ -d "$LSP_SERVER_DIR/src/api" ]; then
        if is_server_running "$API_PID_FILE"; then
            local pid=$(cat "$API_PID_FILE")
            print_status "${CHECK_MARK}" "HTTP API Server" "Running (PID: $pid)" "$BRIGHT_GREEN"
        elif is_port_in_use "localhost" "$HTTP_API_PORT"; then
            print_status "${WARNING}" "API Port $HTTP_API_PORT" "In use by another process" "$BRIGHT_YELLOW"
        else
            if start_server "HTTP API Server" "$LSP_SERVER_DIR" "$BUN_PATH run src/api/http-server.ts" "$API_PID_FILE" "$API_LOG_FILE" "$HTTP_API_PORT" "localhost"; then
                servers_started=$((servers_started + 1))
            else
                servers_failed=$((servers_failed + 1))
            fi
        fi
    fi
    
    # 3. LSP Server runs via VS Code extension, not standalone
    # We don't start it here - it's launched by the extension when needed
    print_status "${INFO}" "LSP Server" "Launched by VS Code Extension" "$DIM"
    
    # Show summary
    echo
    if [ $servers_started -gt 0 ] || [ $servers_failed -eq 0 ]; then
        show_capabilities
        show_quick_start
        
        echo
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        if [ $servers_started -gt 0 ]; then
            echo -e "  ${BOLD}${BRIGHT_GREEN}${ROCKET} Started $servers_started server(s) successfully!${NC}"
        fi
        if [ $servers_failed -gt 0 ]; then
            echo -e "  ${BOLD}${BRIGHT_YELLOW}${WARNING} Failed to start $servers_failed server(s)${NC}"
        fi
        if [ $servers_started -eq 0 ] && [ $servers_failed -eq 0 ]; then
            echo -e "  ${BOLD}${BRIGHT_GREEN}${CHECK_MARK} All servers already running!${NC}"
        fi
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        
        # Show endpoints
        echo
        echo -e "  ${BOLD}${BRIGHT_WHITE}${TOOL} Available Endpoints${NC}"
        print_separator
        if is_server_running "$MCP_PID_FILE"; then
            echo -e "  ${BRIGHT_CYAN}${BULLET}${NC} MCP Server: ${UNDERLINE}http://$MCP_HOST:$MCP_PORT/mcp/sse${NC}"
        fi
        if is_server_running "$API_PID_FILE"; then
            echo -e "  ${BRIGHT_CYAN}${BULLET}${NC} HTTP API:   ${UNDERLINE}http://localhost:$HTTP_API_PORT${NC}"
        fi
        echo -e "  ${BRIGHT_CYAN}${BULLET}${NC} LSP Server: Managed by VS Code extension (stdio mode)"
    else
        echo
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_RED}${CROSS_MARK} Failed to start servers${NC}"
        echo -e "  ${DIM}Please check the logs for details.${NC}"
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
    fi
    
    echo
}

# Run main function
main