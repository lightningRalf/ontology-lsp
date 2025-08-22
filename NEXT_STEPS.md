# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items ONLY. No history, no completed items.
> For completed work, see PROJECT_STATUS.md

## 🎯 Phase 3: Integration [CURRENT]

### 1. Complete MCP Integration Testing
- Test stdio server with Claude Code directly
- Verify SSE server endpoints are responding correctly
- Ensure all 16 MCP tools are working end-to-end
- Add integration tests for MCP → Layer communication

### 2. MCP → LSP Bridge Enhancement
```typescript
// Current: MCP talks to layers directly
// Next: Add LSP server integration on port 7002
// Enable: MCP → LSP → VS Code workflow
```

### 3. Shared Cache Layer
```typescript
// Implement unified cache across all layers
// Share AST parsing results between layers
// Avoid duplicate Tree-sitter parsing
```

### 4. Session Management
```typescript
// Track multiple MCP client sessions
// Handle concurrent Claude instances
// Add session-specific context preservation
```

## 🎯 Phase 4: Optimization [FUTURE]

- Connection pooling for HTTP requests
- Query optimization for large codebases
- Incremental parsing (only reparse changed files)
- Pattern mining from usage data

## 📍 Current Focus

**Testing MCP Integration**: Verify the fixed stdio/SSE servers work with Claude Code

## 🎬 Quick Start Next Session

```bash
cd ~/programming/ontology-lsp

# 1. Start servers (fixed import paths):
just start

# 2. Test MCP connection in Claude Code:
# The stdio server should now work directly
# SSE server available at http://localhost:7001/mcp/sse

# 3. Verify all tools are accessible:
just mcp-tools

# 4. Check health and logs:
just health
just logs

# 5. Run tests to ensure nothing broke:
just test

# Next: Test each of the 16 MCP tools with real queries
```

## 🔧 Known Issues to Address

1. **Remove redundant files**: Delete `stdio-simple.ts` and `index-simple.ts` (unnecessary complexity)
2. **Build process**: Update package.json build target from `--target=node` to `--target=bun`
3. **Error handling**: Add better error messages when layers fail to initialize
4. **Documentation**: Create MCP tool usage examples for each of the 16 tools