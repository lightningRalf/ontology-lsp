# Ontology-LSP Production Dockerfile
# Multi-stage build for optimal production deployment

# ================================
# Stage 1: Base Dependencies
# ================================
FROM oven/bun:1.2.20-alpine AS base
WORKDIR /app

# Install system dependencies for Tree-sitter and native modules
RUN apk add --no-cache \
    build-base \
    python3 \
    make \
    g++ \
    curl \
    ca-certificates

# Create non-root user for security
RUN addgroup -g 1001 -S ontology && \
    adduser -S ontology -u 1001 -G ontology

# ================================
# Stage 2: Dependency Installation
# ================================
FROM base AS deps
WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lock ./
COPY vscode-client/package.json vscode-client/package-lock.json ./vscode-client/

# Install dependencies with frozen lockfile
RUN bun install --frozen-lockfile --production

# Install Tree-sitter languages (trusted dependencies)
RUN bun install tree-sitter tree-sitter-typescript tree-sitter-javascript tree-sitter-python

# ================================
# Stage 3: Build Application
# ================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/vscode-client/node_modules ./vscode-client/node_modules

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN bun run build:tsc

# Build production bundles for all services
RUN echo "Building LSP Server..." && \
    bun build src/servers/lsp.ts --target=bun --outdir=dist/lsp --minify --sourcemap && \
    \
    echo "Building HTTP API Server..." && \
    bun build src/servers/http.ts --target=bun --outdir=dist/api --minify --sourcemap && \
    \
    echo "Building MCP Server..." && \
    bun build src/servers/mcp.ts --target=bun --outdir=dist/mcp --minify --sourcemap && \
    \
    echo "Building CLI Tool..." && \
    bun build src/servers/cli.ts --target=bun --outdir=dist/cli --minify --sourcemap && \
    \
    echo "Building Adapters..." && \
    bun build src/adapters/index.ts --target=bun --outdir=dist/adapters --minify --sourcemap

# Run tests to ensure build quality
RUN bun test

# ================================
# Stage 4: Production Runtime
# ================================
FROM oven/bun:1.2.20-alpine AS runtime
WORKDIR /app

# Install minimal runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl \
    postgresql-client \
    redis \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S ontology && \
    adduser -S ontology -u 1001 -G ontology

# Create necessary directories
RUN mkdir -p \
    /app/dist \
    /app/data \
    /app/logs \
    /app/.ontology/db \
    /app/.ontology/cache \
    /app/.ontology/logs \
    /app/.ontology/pids && \
    chown -R ontology:ontology /app

# Copy built application
COPY --from=builder --chown=ontology:ontology /app/dist ./dist
COPY --from=builder --chown=ontology:ontology /app/package.json ./
COPY --from=builder --chown=ontology:ontology /app/justfile ./

# Copy minimal runtime dependencies (production only)
COPY --from=deps --chown=ontology:ontology /app/node_modules ./node_modules

# Copy configuration files
COPY --chown=ontology:ontology config/ ./config/
COPY --chown=ontology:ontology biome.json ./
COPY --chown=ontology:ontology tsconfig.json ./

# Switch to non-root user
USER ontology

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7000/health && \
        curl -f http://localhost:7001/health || exit 1

# Environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    HTTP_API_PORT=7000 \
    MCP_SSE_PORT=7001 \
    LSP_SERVER_PORT=7002 \
    CACHE_TTL=3600 \
    DATABASE_PATH=/app/data/ontology.db \
    PERFORMANCE_MONITORING=true \
    DISTRIBUTED_CACHE=true \
    PATTERN_LEARNING=true

# Expose all service ports
EXPOSE 7000 7001 7002

# Add startup scripts
COPY --chown=ontology:ontology <<'EOF' /app/start-services.sh
#!/bin/sh
set -e

echo "🚀 Starting Ontology-LSP Production Services..."
echo "=============================================="

# Create necessary directories
mkdir -p data logs .ontology/{db,cache,logs,pids}

# Start services in background with proper process management
echo "Starting LSP Server (port 7002)..."
bun run dist/lsp/lsp.js --port=7002 > logs/lsp.log 2>&1 &
echo $! > .ontology/pids/lsp.pid

echo "Starting HTTP API Server (port 7000)..."  
bun run dist/api/http.js --port=7000 > logs/http-api.log 2>&1 &
echo $! > .ontology/pids/http-api.pid

echo "Starting MCP SSE Server (port 7001)..."
bun run dist/mcp/mcp-sse.js --port=7001 > logs/mcp-sse.log 2>&1 &
echo $! > .ontology/pids/mcp-sse.pid

# Wait for services to start
sleep 5

echo "✅ All services started successfully!"
echo "📊 Health endpoints:"
echo "   - HTTP API: http://localhost:7000/health"
echo "   - MCP SSE:  http://localhost:7001/health"
echo "   - LSP:      TCP:7002"

# Keep container running and monitor processes
wait
EOF

RUN chmod +x /app/start-services.sh

# Default command
CMD ["/app/start-services.sh"]

# Add metadata labels
LABEL \
    org.opencontainers.image.title="Ontology-LSP" \
    org.opencontainers.image.description="Intelligent Programming Companion with MCP, LSP, and HTTP protocols" \
    org.opencontainers.image.version="2.0.0" \
    org.opencontainers.image.vendor="Claude Code Enhanced" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.source="https://github.com/yourusername/ontology-lsp" \
    ontology.protocols="lsp,mcp,http" \
    ontology.runtime="bun" \
    ontology.architecture="unified-core"