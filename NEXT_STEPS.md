# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items ONLY. No history, no completed items.
> For completed work, see PROJECT_STATUS.md

## 🔴 Critical Architectural Issue: Duplicate Implementation

### The Problem
We have **TWO PARALLEL IMPLEMENTATIONS** that don't share code:
1. **Original System** (`src/`): LSP Server + HTTP API - Works with VS Code
2. **MCP System** (`mcp-ontology-server/`): Duplicate layers - Broken integration

This causes:
- Double maintenance burden
- Divergent behavior
- Memory waste (two caches, two databases)
- Integration failures

## 🎯 Phase 1: Fix Architectural Split [URGENT]

### 1. Unify the Layer Implementations
```typescript
// Move shared layers to common location
// Both systems should use the SAME code:
common/
├── layers/
│   ├── claude-tools.ts    # Shared by both
│   ├── tree-sitter.ts     # Shared by both
│   ├── ontology.ts        # Shared by both
│   ├── patterns.ts        # Shared by both
│   └── knowledge.ts       # Shared by both
```

### 2. Fix Misnamed Components
```typescript
// Rename mcp-ontology-server/src/utils/lsp-client.ts
// It's actually an HTTP client, not LSP!
class HttpApiClient {  // <- Correct name
  async findDefinition(symbol: string) {
    // Add missing method
    return this.post('/find', { identifier: symbol, semantic: true })
  }
  
  async findReferences(symbol: string) {
    // Add missing method
    return this.post('/references', { symbol })  // Need new endpoint!
  }
}
```

### 3. Add Missing HTTP Endpoints
```typescript
// src/api/http-server.ts needs:
case '/definition':
  return this.handleFindDefinition(body, headers)
  
case '/references':
  return this.handleFindReferences(body, headers)
```

### 4. Fix Response Format Issues
```typescript
// mcp-ontology-server/src/layers/orchestrator.ts
// executeWithMetadata returns wrong structure
return {
  // Tests expect this at top level:
  layersUsed: layersUsed,
  executionTime: executionTime,
  confidence: confidence,
  data: result  // Actual data nested here
}
```

## 🎯 Phase 2: Create Proper Protocol Adapters [HIGH]

### 1. Protocol-Agnostic Core
```typescript
// Create shared business logic that doesn't know about protocols
interface CodeAnalyzer {
  findDefinition(symbol: string): Promise<Definition[]>
  findReferences(symbol: string): Promise<Reference[]>
  // ... other methods
}
```

### 2. Protocol Adapters
```typescript
// Thin adapters for each protocol:
class LSPAdapter {
  constructor(private analyzer: CodeAnalyzer) {}
  onDefinition(params) { return this.analyzer.findDefinition(...) }
}

class MCPAdapter {
  constructor(private analyzer: CodeAnalyzer) {}
  handleTool(name, args) { return this.analyzer[name](...) }
}

class HTTPAdapter {
  constructor(private analyzer: CodeAnalyzer) {}
  handleRequest(path, body) { return this.analyzer[path](...) }
}
```

## 🎯 Phase 3: Integration Testing [MEDIUM]

### 1. Test All Entry Points
```bash
# VS Code Extension → LSP Server
# Claude Code → MCP Server  
# CLI Tool → HTTP API
# All should produce identical results!
```

### 2. Add Missing Integration Tests
- Test MCP tools actually work with Claude Code
- Test VS Code extension with real LSP server
- Test CLI with HTTP API
- Cross-protocol consistency tests

## 🎯 Phase 4: Performance & Optimization [LOW]

### 1. Shared Cache Layer
```typescript
// Single cache used by all protocols
class SharedCache {
  private astCache: Map<string, AST>
  private conceptCache: Map<string, Concept>
  // Share expensive computations
}
```

### 2. Connection Pooling
- HTTP client connection reuse
- Database connection pooling
- WebSocket management for SSE

## 📍 Current Focus

**STOP adding features. FIX the architecture first.**

The duplicate implementation is causing:
- Integration test failures
- MCP tools not working
- Maintenance nightmare
- Performance degradation

## 🎬 Quick Start Next Session

```bash
cd ~/programming/ontology-lsp

# 1. Understand the split:
ls -la src/layers/           # Original implementation
ls -la mcp-ontology-server/src/layers/  # Duplicate implementation

# 2. See the problem:
diff src/layers/tree-sitter.ts mcp-ontology-server/src/layers/tree-sitter.ts

# 3. Run tests to see failures:
cd mcp-ontology-server && bun test

# 4. Start fixing:
# - Unify layers
# - Fix misnamed components
# - Add missing methods
```

## 🔧 Known Issues to Address

### Critical (Blocking Everything)
1. **Duplicate layer implementations**: Two separate codebases
2. **LSPClient is misnamed**: It's an HTTP client, not LSP
3. **Missing HTTP endpoints**: No `/definition` or `/references`
4. **Response format mismatch**: `layersUsed` in wrong place
5. **No shared state**: Two separate caches/databases

### High Priority
1. **File path resolution**: Undefined paths to tree-sitter
2. **Ontology layer timeout**: `findRelatedConcepts` hanging
3. **MCP can't access LSP**: Protocol barrier
4. **Tests failing**: Integration tests broken

### Medium Priority
1. **Remove redundant files**: Clean up duplicates
2. **Error handling**: Better error messages
3. **Build process**: Unify build for both systems

### Future
1. **Claude Tools Integration**: Research proper MCP tool access
2. **Performance monitoring**: Add metrics
3. **Documentation**: Update to reflect real architecture