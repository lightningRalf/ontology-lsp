# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items. For completed work, see PROJECT_STATUS.md

## 🚨 CRITICAL: Wire MCP Tools to LayerOrchestrator

**Problem**: Tools are defined but NOT connected to the actual implementation!
- ✅ LayerOrchestrator exists and routes through 5 layers
- ✅ 16 tools defined in `tools/index.ts`
- ❌ Tools call orchestrator.executeTool() but implementations missing!

## 🎯 Phase 2: MCP Tools Implementation [CURRENT]

### 1. Wire the tools to actual implementations
```typescript
// In mcp-ontology-server/src/layers/orchestrator.ts
// Map tool names to actual layer methods:
async executeTool(toolName: string, args: any) {
  switch(toolName) {
    case 'find_definition':
      return this.ontology.findDefinition(args)
    case 'find_references':  
      return this.ontology.findReferences(args)
    case 'rename_symbol':
      return this.knowledge.propagateRename(args)
    // ... wire all 16 tools
  }
}
```

### 2. Test with Claude Code (CLI)
```bash
# Start MCP server
./.claude/hooks/session-start.sh

# Test with Claude Code CLI (not Desktop!)
# The MCP server should respond to tool calls
```

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

## 📋 Implementation Checklist

### Tools to Wire (Priority Order):
- [ ] `find_definition` → ontology.findDefinition()
- [ ] `find_references` → ontology.findReferences()
- [ ] `rename_symbol` → knowledge.propagateRename()
- [ ] `suggest_refactoring` → patterns.suggestRefactoring()
- [ ] `learn_pattern` → patterns.learnPattern()
- [ ] `detect_patterns` → patterns.detectPatterns()
- [ ] `analyze_complexity` → treeSitter.analyzeComplexity()
- [ ] `search_files` → claudeTools.searchFiles()
- [ ] `grep_content` → claudeTools.grepContent()
- [ ] ... (7 more tools)

## ⚠️ Current State

- **Phase 1**: ✅ DONE (Unified core, config, ports)
- **Phase 2**: 🔴 IN PROGRESS (Wire MCP tools)
- **Phase 3**: ⏳ TODO (Integration)
- **Phase 4**: 🔮 FUTURE (Optimization)

## 🎬 Quick Start Next Session

```bash
cd ~/programming/ontology-lsp
./.claude/hooks/session-start.sh

# Focus: Wire the MCP tools to LayerOrchestrator
# File: mcp-ontology-server/src/layers/orchestrator.ts
```