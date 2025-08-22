# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items. For completed work, see PROJECT_STATUS.md

## 🚨 CRITICAL: Fix HTTP API Server Startup

**Problem**: HTTP API server on port 7000 is not starting properly
- ✅ MCP Server running on port 7001 (confirmed via health check)
- ❌ HTTP API server fails to respond on port 7000
- ⚠️ Logs suggest it starts but then immediately shuts down

### Debug Steps:
1. Check why HTTP server is not persisting
2. Verify Bun runtime compatibility with the HTTP server code
3. Check for any unhandled promise rejections or errors
4. Ensure database initialization is working

## 🎯 Phase 3: Integration [NEXT]

### 1. MCP → LSP Bridge
```typescript
// Connect MCP tools to LSP server on port 7002
// Or use HTTP API on port 7000 as intermediary
```

### 2. Shared Cache Layer
```typescript
// Implement cache sharing between layers
// Avoid duplicate parsing/analysis
```

### 3. Session Management
```typescript
// Track MCP sessions and their state
// Handle multiple concurrent Claude instances
```

## 🎯 Phase 4: Optimization [FUTURE]

- Connection pooling for HTTP requests
- Query optimization for large codebases
- Incremental parsing (only reparse changed files)
- Pattern mining from usage data

## ⚠️ Current State

- **Phase 1**: ✅ DONE (Unified core, config, ports)
- **Phase 2**: ✅ DONE (Wire MCP tools - all 16 tools connected!)
- **Phase 2.5**: 🔴 IN PROGRESS (Fix HTTP API server startup)
- **Phase 3**: ⏳ TODO (Integration)
- **Phase 4**: 🔮 FUTURE (Optimization)

## 🎬 Quick Start Next Session

```bash
cd ~/programming/ontology-lsp
./.claude/hooks/session-start.sh

# Focus: Fix HTTP API server on port 7000
# Check: src/api/http-server.ts
```