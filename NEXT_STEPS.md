# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items. For completed work, see PROJECT_STATUS.md

## ✅ FIXED: HTTP API Server Startup

**Resolution**: HTTP API server on port 7000 is now working correctly
- ✅ MCP Server running on port 7001 (confirmed via health check)
- ✅ HTTP API server running on port 7000 (health check confirmed)
- ✅ Database initialization working properly
- ✅ All layers (Claude Tools, Tree-sitter, Ontology, Pattern Learner) initialized

### Fixed Issues:
1. ✅ Added proper async initialization handling for OntologyEngine and PatternLearner
2. ✅ Fixed process lifecycle - server now stays alive with signal handlers
3. ✅ Added comprehensive error handling and logging
4. ✅ Ensured database connections are properly awaited

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
- **Phase 2.5**: ✅ DONE (HTTP API server fixed and running!)
- **Phase 3**: 🟡 IN PROGRESS (Integration - MCP → LSP Bridge)
- **Phase 4**: 🔮 FUTURE (Optimization)

## 🎬 Quick Start Next Session

```bash
cd ~/programming/ontology-lsp

# Start all servers:
just start

# Or for development mode with auto-reload:
just dev

# Check status:
just status
just health

# Watch logs:
just logs

# Focus: Implement MCP → LSP Bridge
```