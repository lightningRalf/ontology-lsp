# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items ONLY. No history, no completed items.
> For completed work, see PROJECT_STATUS.md

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

## 📍 Current Focus

**Phase 3**: Integration - MCP → LSP Bridge

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