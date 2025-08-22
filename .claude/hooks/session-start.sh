#!/usr/bin/env bash

# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Ontology MCP Server - Session Start Hook                                ║
# ║  Automatically manages the MCP server lifecycle for Claude Code sessions ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# Configuration
MCP_PORT="${MCP_SSE_PORT:-7001}"
MCP_HOST="${MCP_SSE_HOST:-localhost}"
MCP_SERVER_DIR="$CLAUDE_PROJECT_DIR/mcp-ontology-server"
BUN_PATH="${HOME}/.bun/bin/bun"
PID_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.pid"
LOG_FILE="/tmp/ontology-mcp-server-${MCP_PORT}.log"

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
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            # PID file exists but process is dead
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Function to check if port is in use
is_port_in_use() {
    nc -z "$MCP_HOST" "$MCP_PORT" 2>/dev/null
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

# Function to start the server with beautiful output
start_server() {
    echo
    echo -e "  ${HOURGLASS}  ${BOLD}${BRIGHT_YELLOW}Starting MCP Server...${NC}"
    echo
    
    # Show startup status
    echo -e "  ${DIM}${BRIGHT_BLACK}┌─ Initialization ─────────────────────────────────────┐${NC}"
    echo -e "  ${DIM}${BRIGHT_BLACK}│${NC}  ${GEAR} Preparing environment...                      ${DIM}${BRIGHT_BLACK}│${NC}"
    echo -e "  ${DIM}${BRIGHT_BLACK}│${NC}  ${PACKAGE} Loading Bun runtime...                        ${DIM}${BRIGHT_BLACK}│${NC}"
    echo -e "  ${DIM}${BRIGHT_BLACK}│${NC}  ${TOOL} Binding to port ${MCP_PORT}...                        ${DIM}${BRIGHT_BLACK}│${NC}"
    echo -e "  ${DIM}${BRIGHT_BLACK}└──────────────────────────────────────────────────────┘${NC}"
    
    # Start the server in background
    cd "$MCP_SERVER_DIR"
    nohup "$BUN_PATH" run src/sse-server.ts > "$LOG_FILE" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$PID_FILE"
    
    # Wait for server to be ready with progress indication
    local attempts=0
    while [ $attempts -lt 10 ]; do
        if is_port_in_use; then
            echo
            echo -e "  ${BRIGHT_GREEN}${CHECK_MARK}${NC}  ${BOLD}${BRIGHT_GREEN}Server started successfully!${NC}"
            echo
            return 0
        fi
        # Show progress dots
        echo -ne "\r  ${DIM}Waiting for server to respond${NC}$(printf '.%.0s' $(seq 1 $((attempts % 4))))"
        sleep 0.5
        attempts=$((attempts + 1))
    done
    
    # Server didn't start properly
    echo
    echo -e "  ${BRIGHT_RED}${CROSS_MARK}${NC}  ${BOLD}${BRIGHT_RED}Failed to start server${NC}"
    echo -e "  ${DIM}Check logs at: $LOG_FILE${NC}"
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
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
    
    # Check if MCP server directory exists
    if [ ! -d "$MCP_SERVER_DIR" ]; then
        print_status "${WARNING}" "MCP Server" "Not Installed" "$BRIGHT_YELLOW"
        echo
        echo -e "  ${DIM}The Ontology MCP server is not installed in this project.${NC}"
        echo -e "  ${DIM}Continuing without MCP server capabilities.${NC}"
        echo
        exit 0
    fi
    
    # Check current server status
    echo -e "  ${BOLD}${BRIGHT_WHITE}${INFO} Server Status Check${NC}"
    print_separator
    
    if is_server_running; then
        local pid=$(cat "$PID_FILE")
        
        # Server is already running - show detailed status
        print_status "${CHECK_MARK}" "Status" "Running" "$BRIGHT_GREEN"
        print_status "${GEAR}" "Process ID" "$pid" "$BRIGHT_CYAN"
        print_status "${TOOL}" "Endpoint" "http://$MCP_HOST:$MCP_PORT/mcp/sse" "$BRIGHT_CYAN"
        print_status "${PACKAGE}" "Log File" "$LOG_FILE" "$DIM"
        
        show_capabilities
        show_quick_start
        
        echo
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_GREEN}${CHECK_MARK} MCP Server is ready for your commands!${NC}"
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo
        
        exit 0
    fi
    
    # Check if port is already in use by another process
    if is_port_in_use; then
        print_status "${WARNING}" "Port $MCP_PORT" "Already in use" "$BRIGHT_YELLOW"
        echo
        echo -e "  ${DIM}Another process is using port $MCP_PORT.${NC}"
        echo -e "  ${DIM}Cannot start Ontology MCP Server.${NC}"
        echo
        exit 0
    fi
    
    # Server is not running - start it
    print_status "${INFO}" "Status" "Not Running" "$BRIGHT_YELLOW"
    
    if start_server; then
        local pid=$(cat "$PID_FILE")
        
        # Show success status with details
        echo -e "  ${BOLD}${BRIGHT_WHITE}${CHECK_MARK} Server Started Successfully${NC}"
        print_separator
        print_status "${GEAR}" "Process ID" "$pid" "$BRIGHT_CYAN"
        print_status "${TOOL}" "Endpoint" "http://$MCP_HOST:$MCP_PORT/mcp/sse" "$BRIGHT_CYAN"
        print_status "${PACKAGE}" "Log File" "$LOG_FILE" "$DIM"
        
        show_capabilities
        show_quick_start
        
        echo
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_GREEN}${ROCKET} MCP Server launched and ready!${NC}"
        echo -e "  ${BRIGHT_GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo
    else
        echo
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${BOLD}${BRIGHT_RED}${CROSS_MARK} Failed to start MCP Server${NC}"
        echo -e "  ${DIM}Please check the logs for details.${NC}"
        echo -e "  ${BRIGHT_RED}════════════════════════════════════════════════════════════════${NC}"
        echo
        exit 0
    fi
}

# Run main function
main