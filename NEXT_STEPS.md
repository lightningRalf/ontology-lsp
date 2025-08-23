# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items ONLY. No history, no completed items.
> For completed work, see PROJECT_STATUS.md

## 🎯 Phase 3: Integration [CURRENT]

### 1. Fix Layer Implementation Issues [CRITICAL]
Based on integration tests, the following need immediate fixes:
- **LSP Client**: `findDefinition` and `findReferences` methods are undefined
- **Layer Response Format**: Layers returning wrong format (missing `layersUsed` array)
- **File Path Handling**: Tree-sitter getting undefined file paths
- **Ontology Layer**: Hanging on `findRelatedConcepts` (5s timeout)
- **executeWithMetadata**: Not wrapping responses correctly

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

### High Priority (Blocking)
1. **Layer implementations incomplete**: Many methods just stub implementations
2. **LSP Client methods missing**: `findDefinition`, `findReferences` not implemented
3. **Response format inconsistent**: Layers not returning expected structure
4. **File path resolution**: Relative vs absolute path handling broken

### Medium Priority
1. **Remove redundant files**: Delete `stdio-simple.ts` and `index-simple.ts` (unnecessary complexity)
2. **Build process**: Update package.json build target from `--target=node` to `--target=bun`
3. **Error handling**: Add better error messages when layers fail to initialize
4. **Tree-sitter query syntax**: Invalid queries for TypeScript causing parser errors

### Low Priority (Future)
1. **Claude Tools Integration**: Investigate how to properly access Claude Code's native tools
   - Research MCP server context for tool injection
   - Understand how Claude Code exposes Glob, Grep, LS tools to MCP servers
   - Determine if tools should be passed via transport or context
   - Test with actual Claude Code integration (not standalone)