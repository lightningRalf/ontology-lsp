# Ontology LSP Commands

# Default recipe - show available commands
default:
    @just --list

# Path to Bun runtime
bun := env_var_or_default("BUN_PATH", "~/.bun/bin/bun")
workspace := env_var_or_default("ONTOLOGY_WORKSPACE", justfile_directory())

# === SERVER MANAGEMENT (replaces session-start/stop) ===

# Start all servers  
start: stop-quiet
    @echo "🚀 Starting Ontology LSP System..."
    @echo "=================================="
    @mkdir -p .ontology/pids .ontology/logs
    @echo "Starting HTTP API Server (port 7000)..."
    @sh -c '{{bun}} run src/api/http-server.ts > .ontology/logs/http-api.log 2>&1 & echo $$! > .ontology/pids/http-api.pid'
    @echo "Starting MCP SSE Server (port 7001)..."
    @sh -c '{{bun}} run mcp-ontology-server/src/sse-server.ts > .ontology/logs/mcp-sse.log 2>&1 & echo $$! > .ontology/pids/mcp-sse.pid'
    @sleep 3
    @just health
    @echo ""
    @echo "✅ All servers started!"
    @echo "📌 Logs: tail -f .ontology/logs/*.log"
    @echo "📌 Stop: just stop"

# Stop all servers
stop:
    @echo "🛑 Stopping Ontology LSP servers..."
    @-bash -c "[ -f .ontology/pids/http-api.pid ] && kill \$$(cat .ontology/pids/http-api.pid) 2>/dev/null && rm .ontology/pids/http-api.pid || true"
    @-bash -c "[ -f .ontology/pids/mcp-sse.pid ] && kill \$$(cat .ontology/pids/mcp-sse.pid) 2>/dev/null && rm .ontology/pids/mcp-sse.pid || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7000 | xargs -r kill -9 2>/dev/null || true) || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7001 | xargs -r kill -9 2>/dev/null || true) || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7002 | xargs -r kill -9 2>/dev/null || true) || true"
    @echo "✅ All servers stopped"

# Stop quietly (internal use)
stop-quiet:
    @-bash -c "[ -f .ontology/pids/http-api.pid ] && kill \$$(cat .ontology/pids/http-api.pid) 2>/dev/null && rm .ontology/pids/http-api.pid || true"
    @-bash -c "[ -f .ontology/pids/mcp-sse.pid ] && kill \$$(cat .ontology/pids/mcp-sse.pid) 2>/dev/null && rm .ontology/pids/mcp-sse.pid || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7000 | xargs -r kill -9 2>/dev/null || true) || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7001 | xargs -r kill -9 2>/dev/null || true) || true"
    @-bash -c "command -v lsof >/dev/null 2>&1 && (lsof -ti:7002 | xargs -r kill -9 2>/dev/null || true) || true"

# Restart servers
restart: stop start

# Check health
health:
    @echo "🧪 Checking server health..."
    @curl -s http://localhost:7000/health >/dev/null 2>&1 && echo "✅ HTTP API (7000): HEALTHY" || echo "❌ HTTP API (7000): NOT RESPONDING"
    @curl -s http://localhost:7001/health >/dev/null 2>&1 && echo "✅ MCP SSE (7001): HEALTHY" || echo "❌ MCP SSE (7001): NOT RESPONDING"

# Show server status
status:
    @echo "📊 Server Status"
    @echo "=================="
    @if [ -f .ontology/pids/http-api.pid ] && kill -0 $$(cat .ontology/pids/http-api.pid) 2>/dev/null; then \
        echo "✅ HTTP API: Running (PID: $$(cat .ontology/pids/http-api.pid))"; \
    else \
        echo "❌ HTTP API: Not running"; \
    fi
    @if [ -f .ontology/pids/mcp-sse.pid ] && kill -0 $$(cat .ontology/pids/mcp-sse.pid) 2>/dev/null; then \
        echo "✅ MCP SSE: Running (PID: $$(cat .ontology/pids/mcp-sse.pid))"; \
    else \
        echo "❌ MCP SSE: Not running"; \
    fi

# Show logs
logs:
    @tail -f .ontology/logs/*.log

# Get stats from servers
stats:
    @echo "📊 Server Statistics"
    @curl -s http://localhost:7000/stats | jq . || echo "Server not responding"

# === BUILD COMMANDS ===

# Build the LSP server
build:
    {{bun}} build ./src/server.ts --target=bun --outdir=dist --format=esm

# Build the VS Code extension
build-extension:
    cd vscode-client && npm install && npm run compile

# Build everything
build-all: build build-extension

# Package the VS Code extension
package-extension:
    cd vscode-client && npx @vscode/vsce package

# Install the extension in VS Code
install-extension: build-all package-extension
    code --install-extension vscode-client/ontology-lsp-*.vsix

# === TESTING ===

# Run all tests
test-all: test test-extension

# Run server tests with Bun
test:
    {{bun}} test tests/step*.test.ts tests/integration.test.ts

# Run extension tests
test-extension:
    cd vscode-client && npm test

# Run unit tests only
test-unit:
    {{bun}} test tests/step*.test.ts

# Run integration tests only
test-integration:
    {{bun}} test tests/integration.test.ts

# Run performance tests only
test-perf:
    {{bun}} test tests/integration.test.ts --grep "Performance"

# Run tests with coverage
test-coverage:
    {{bun}} test --coverage

# Run tests in watch mode
test-watch:
    {{bun}} test --watch

# === DEVELOPMENT ===

# Development mode - start with auto-reload
dev: stop-quiet
    @echo "🔧 Starting in development mode..."
    @mkdir -p .ontology/pids .ontology/logs
    @sh -c '{{bun}} run --watch src/api/http-server.ts > .ontology/logs/http-api.log 2>&1 & echo $$! > .ontology/pids/http-api.pid'
    @sh -c '{{bun}} run --watch mcp-ontology-server/src/sse-server.ts > .ontology/logs/mcp-sse.log 2>&1 & echo $$! > .ontology/pids/mcp-sse.pid'
    @echo "✅ Development servers started with auto-reload"
    @echo "📌 Logs: just logs"
    @echo "📌 Stop: just stop"

# Open VS Code with extension in development mode
dev-extension:
    cd vscode-client && code .

# Interactive session (start servers and watch logs)
session: start
    @echo ""
    @echo "📺 Watching logs (Ctrl+C to stop)..."
    @echo "=================================="
    @tail -f .ontology/logs/*.log

# === CODE QUALITY ===

# Run linter
lint:
    {{bun}} run lint
    cd vscode-client && npm run lint

# Format code
format:
    {{bun}} run format

# Type check
typecheck:
    {{bun}} run typecheck

# Run all checks (format, lint, typecheck, test)
check: format lint typecheck test

# === CLEANUP ===

# Clean build artifacts and logs
clean:
    @echo "🧹 Cleaning..."
    @rm -rf dist .ontology/logs/* .ontology/pids/*
    @cd vscode-client && rm -rf out node_modules coverage .nyc_output
    @echo "✅ Cleaned"

# Full clean including database
clean-all: stop
    @echo "🧹 Full clean..."
    @rm -rf dist .ontology node_modules bun.lockb
    @cd vscode-client && rm -rf out node_modules
    @echo "✅ Everything cleaned"

# === UTILITIES ===

# Install all dependencies
install:
    {{bun}} install
    cd vscode-client && npm install

# Initialize project (first time setup)
init:
    @echo "🎯 Initializing Ontology LSP..."
    @mkdir -p .ontology/logs .ontology/pids .ontology/db
    @{{bun}} install
    @echo "✅ Initialized! Run 'just start' to begin."

# Show available MCP tools
mcp-tools:
    @echo "🔧 Available MCP Tools"
    @echo "====================="
    @curl -s http://localhost:7001/tools 2>/dev/null | jq -r '.[] | "• \(.name): \(.description | split("\n")[0])"' || echo "MCP server not running. Run 'just start' first."

# Test all endpoints
test-endpoints:
    @echo "🧪 Testing Endpoints"
    @echo "===================="
    @echo "HTTP API Health:"
    @curl -s http://localhost:7000/health | jq . || echo "Failed"
    @echo ""
    @echo "MCP SSE Health:"
    @curl -s http://localhost:7001/health | jq . || echo "Failed"
    @echo ""
    @echo "HTTP API Stats:"
    @curl -s http://localhost:7000/stats | jq '.ontology' || echo "Failed"

# Full CI/CD simulation
ci: clean install build-all lint test-all test-coverage package-extension
    @echo "✓ CI pipeline complete!"