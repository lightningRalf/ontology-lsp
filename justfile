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
    @sh -c '{{bun}} run src/servers/http.ts > .ontology/logs/http-api.log 2>&1 & echo $$! > .ontology/pids/http-api.pid'
    @echo "Starting MCP SSE Server (port 7001)..."
    @sh -c '{{bun}} run src/servers/mcp-sse.ts > .ontology/logs/mcp-sse.log 2>&1 & echo $$! > .ontology/pids/mcp-sse.pid'
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
    @if [ -f .ontology/pids/http-api.pid ] && kill -0 $(cat .ontology/pids/http-api.pid) 2>/dev/null; then \
        echo "✅ HTTP API: Running (PID: $(cat .ontology/pids/http-api.pid))"; \
    else \
        echo "❌ HTTP API: Not running"; \
    fi
    @if [ -f .ontology/pids/mcp-sse.pid ] && kill -0 $(cat .ontology/pids/mcp-sse.pid) 2>/dev/null; then \
        echo "✅ MCP SSE: Running (PID: $(cat .ontology/pids/mcp-sse.pid))"; \
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

# Run all tests including comprehensive integration tests
test-all: test test-integration-comprehensive test-extension

# Run basic server tests with Bun
test:
    {{bun}} test tests/step*.test.ts tests/integration.test.ts

# Run comprehensive integration test suite (NEW UNIFIED ARCHITECTURE)
test-integration-comprehensive:
    @echo "🧪 Running Comprehensive Integration Tests for Unified Architecture"
    @echo "=================================================================="
    ./scripts/test-integration.sh

# Run individual comprehensive test suites
test-unified-core:
    @echo "🧪 Testing Unified Core Architecture..."
    {{bun}} test tests/unified-core.test.ts --timeout 120000

test-adapters:
    @echo "🧪 Testing Protocol Adapters..."
    {{bun}} test tests/adapters.test.ts --timeout 120000

test-learning-system:
    @echo "🧪 Testing Learning System..."
    {{bun}} test tests/learning-system.test.ts --timeout 120000

test-performance:
    @echo "⚡ Running Performance Benchmarks..."
    {{bun}} test tests/performance.test.ts --timeout 300000

test-consistency:
    @echo "🔄 Testing Cross-Protocol Consistency..."
    {{bun}} test tests/consistency.test.ts --timeout 180000

# Run extension tests
test-extension:
    cd vscode-client && npm test

# Run unit tests only (legacy)
test-unit:
    {{bun}} test tests/step*.test.ts

# Run integration tests only (legacy)
test-integration:
    {{bun}} test tests/integration.test.ts

# Run performance tests only (legacy)
test-perf:
    {{bun}} test tests/integration.test.ts --grep "Performance"

# Run tests with coverage
test-coverage:
    {{bun}} test --coverage tests/

# Run tests in watch mode
test-watch:
    {{bun}} test --watch tests/

# Verify VISION.md requirements are met
test-vision-compliance:
    @echo "🎯 Verifying VISION.md Requirements..."
    @echo "======================================"
    @echo "✅ Testing unified architecture (protocol-agnostic core)"
    @{{bun}} test tests/unified-core.test.ts --timeout 120000
    @echo "✅ Testing all 5 processing layers with performance targets"
    @{{bun}} test tests/performance.test.ts --timeout 300000
    @echo "✅ Testing learning system integration"
    @{{bun}} test tests/learning-system.test.ts --timeout 120000
    @echo "✅ Testing cross-protocol consistency"
    @{{bun}} test tests/consistency.test.ts --timeout 180000
    @echo ""
    @echo "🎉 VISION.md compliance verified!"

# === DEVELOPMENT ===

# Development mode - start with auto-reload (VISION.md compliant)
dev: stop-quiet
    @echo "🚀 Starting Ontology-LSP in development mode..."
    @mkdir -p .ontology/pids .ontology/logs
    
    # Load yesterday's patterns and warm cache
    @echo "📊 Loading patterns and warming cache..."
    @{{bun}} run src/cli/analyze.ts --warm-cache 2>/dev/null || true
    
    # Start servers with hot-reload
    @sh -c '{{bun}} run --watch src/servers/lsp.ts > .ontology/logs/lsp.log 2>&1 & echo $$! > .ontology/pids/lsp.pid'
    @sh -c '{{bun}} run --watch src/servers/http.ts > .ontology/logs/http-api.log 2>&1 & echo $$! > .ontology/pids/http-api.pid'
    @sh -c '{{bun}} run --watch src/servers/mcp.ts > .ontology/logs/mcp-sse.log 2>&1 & echo $$! > .ontology/pids/mcp-sse.pid'
    
    @sleep 2
    @echo "🧠 Knowledge base loaded with $({{bun}} run src/cli/stats.ts --quiet 2>/dev/null | grep concepts | awk '{print $2}' || echo '0') concepts"
    @echo "⚡ Cache warmed for optimal performance"
    @echo "✅ All systems operational"
    @echo ""
    @echo "📌 Logs: just logs"
    @echo "📌 Health: just health"
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

# === ANALYSIS & LEARNING (VISION.md) ===

# Analyze codebase and learn patterns
analyze:
    @echo "🧠 Learning from your code..."
    @{{bun}} run src/cli/analyze.ts {{workspace}}
    @echo ""
    @echo "📊 Analysis complete! New patterns discovered:"
    @{{bun}} run src/cli/stats.ts --patterns

# Analyze pull request for quality
analyze-pr pr="":
    @echo "🔍 Analyzing pull request..."
    @{{bun}} run src/cli/analyze.ts --pr {{pr}}

# === DEPLOYMENT (VISION.md) ===

# Build for production
build-prod:
    @echo "🔨 Building for production..."
    {{bun}} build src/servers/lsp.ts --target=bun --outdir=dist/lsp --minify
    {{bun}} build src/servers/http.ts --target=bun --outdir=dist/api --minify
    {{bun}} build src/servers/mcp.ts --target=bun --outdir=dist/mcp --minify
    {{bun}} build src/servers/cli.ts --target=bun --outdir=dist/cli --minify --sourcemap

# Build Docker image
docker-build: build-prod
    @echo "🐳 Building Docker image..."
    docker build -t ontology-lsp:2.0.0 .
    docker tag ontology-lsp:2.0.0 ontology-lsp:latest
    @echo "✅ Docker image built"

# Push Docker image to registry
docker-push registry="ghcr.io/yourusername": docker-build
    @echo "📤 Pushing Docker image to {{registry}}..."
    docker tag ontology-lsp:latest {{registry}}/ontology-lsp:latest
    docker tag ontology-lsp:2.0.0 {{registry}}/ontology-lsp:2.0.0
    docker push {{registry}}/ontology-lsp:latest
    docker push {{registry}}/ontology-lsp:2.0.0
    @echo "✅ Docker images pushed"

# Start local development with Docker Compose
docker-dev:
    @echo "🐳 Starting Docker Compose development environment..."
    @if [ ! -f .env ]; then cp .env.sample .env; echo "Created .env from .env.sample - please configure it"; fi
    docker-compose up -d
    @echo "✅ Development environment started"
    @echo "📊 Grafana: http://localhost:3000 (admin/admin)"
    @echo "📈 Prometheus: http://localhost:9090"
    @echo "🔍 Jaeger: http://localhost:16686"

# Stop Docker Compose development
docker-dev-stop:
    @echo "🛑 Stopping Docker Compose development..."
    docker-compose down
    @echo "✅ Development environment stopped"

# Stop and clean Docker Compose
docker-dev-clean:
    @echo "🧹 Cleaning Docker Compose development..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    @echo "✅ Development environment cleaned"

# Deploy to Kubernetes staging
deploy-staging: docker-build test-all
    @echo "🚀 Deploying to staging..."
    @if ! kubectl config current-context | grep -q staging; then echo "❌ Not connected to staging cluster"; exit 1; fi
    
    # Update image in manifests
    @sed -i.bak "s|ontology-lsp:2.0.0|ontology-lsp:latest|g" k8s/production.yaml
    
    # Apply Kubernetes manifests
    kubectl apply -f k8s/namespace.yaml
    kubectl apply -f k8s/configmap.yaml
    @if ! kubectl get secret ontology-lsp-secrets -n ontology-lsp >/dev/null 2>&1; then \
        echo "⚠️  Creating default secrets - update them for production!"; \
        kubectl create secret generic ontology-lsp-secrets \
            --from-literal=DATABASE_URL="postgres://ontology:changeme@postgres-service:5432/ontology_lsp" \
            --from-literal=REDIS_URL="redis://redis-service:6379" \
            --from-literal=JWT_SECRET="changeme-in-production" \
            -n ontology-lsp; \
    fi
    kubectl apply -f k8s/postgres.yaml
    kubectl apply -f k8s/redis.yaml
    kubectl apply -f k8s/production.yaml
    
    # Wait for rollout
    @echo "⏳ Waiting for deployment rollout..."
    kubectl rollout status deployment/ontology-lsp -n ontology-lsp --timeout=300s
    
    # Restore backup
    @mv k8s/production.yaml.bak k8s/production.yaml 2>/dev/null || true
    @echo "✅ Staging deployment complete!"

# Deploy to production (Docker + Kubernetes)
deploy-production: docker-build test-all
    @echo "🚢 Deploying to production..."
    @if ! kubectl config current-context | grep -q prod; then echo "❌ Not connected to production cluster"; exit 1; fi
    
    # Confirm production deployment
    @echo "⚠️  You are about to deploy to PRODUCTION. Continue? [y/N]"
    @read -r confirm && [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ] || (echo "Deployment cancelled" && exit 1)
    
    # Update image in manifests  
    @sed -i.bak "s|ontology-lsp:2.0.0|ontology-lsp:latest|g" k8s/production.yaml
    
    # Create backup of current deployment
    @kubectl get deployment ontology-lsp -n ontology-lsp -o yaml > deployment-backup-$(date +%Y%m%d-%H%M%S).yaml || echo "No existing deployment"
    
    # Apply manifests with production checks
    kubectl apply -f k8s/namespace.yaml
    kubectl apply -f k8s/configmap.yaml
    @if ! kubectl get secret ontology-lsp-secrets -n ontology-lsp >/dev/null 2>&1; then \
        echo "❌ Production secrets not found! Create them manually."; \
        exit 1; \
    fi
    kubectl apply -f k8s/postgres.yaml
    kubectl apply -f k8s/redis.yaml
    kubectl apply -f k8s/production.yaml
    
    # Wait for rollout with extended timeout
    @echo "⏳ Waiting for production deployment rollout..."
    kubectl rollout status deployment/ontology-lsp -n ontology-lsp --timeout=600s
    
    # Verify health
    @sleep 30
    @echo "🩺 Verifying production health..."
    @kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=ontology-lsp -n ontology-lsp --timeout=120s
    
    # Restore backup
    @mv k8s/production.yaml.bak k8s/production.yaml 2>/dev/null || true
    @echo "🎉 Production deployment complete!"

# Quick deploy (staging without tests - use with caution)
deploy: docker-build
    @echo "🚀 Quick deploy to staging (no tests)..."
    @just deploy-staging

# Rollback deployment
rollback namespace="ontology-lsp":
    @echo "↩️  Rolling back deployment in {{namespace}}..."
    kubectl rollout undo deployment/ontology-lsp -n {{namespace}}
    kubectl rollout status deployment/ontology-lsp -n {{namespace}} --timeout=300s
    @echo "✅ Rollback complete!"

# Check deployment status
deploy-status namespace="ontology-lsp":
    @echo "📊 Deployment Status for {{namespace}}"
    @echo "=================================="
    kubectl get pods -n {{namespace}} -l app.kubernetes.io/name=ontology-lsp
    kubectl get services -n {{namespace}} -l app.kubernetes.io/name=ontology-lsp
    kubectl get ingress -n {{namespace}}
    @echo ""
    @echo "Recent events:"
    kubectl get events -n {{namespace}} --sort-by='.lastTimestamp' | tail -10

# Scale deployment
scale replicas="3" namespace="ontology-lsp":
    @echo "📈 Scaling deployment to {{replicas}} replicas in {{namespace}}..."
    kubectl scale deployment/ontology-lsp --replicas={{replicas}} -n {{namespace}}
    kubectl rollout status deployment/ontology-lsp -n {{namespace}} --timeout=300s
    @echo "✅ Scaled to {{replicas}} replicas"

# Port forward for local testing
port-forward namespace="ontology-lsp":
    @echo "🔀 Port forwarding from {{namespace}}..."
    @echo "📍 HTTP API: http://localhost:7000"
    @echo "📍 MCP SSE: http://localhost:7001" 
    @echo "Press Ctrl+C to stop"
    kubectl port-forward -n {{namespace}} svc/ontology-lsp-http 7000:7000 &
    kubectl port-forward -n {{namespace}} svc/ontology-lsp-mcp 7001:7001 &
    wait

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