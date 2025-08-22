# Ontology-Enhanced MCP Server

A sophisticated MCP (Model Context Protocol) server that exposes a 5-layer intelligent code understanding system, providing LLMs with deep semantic awareness and adaptive learning capabilities.

**New to this?** 👉 **[Check out the First Steps Guide](docs/FIRST_STEPS.md)** for a quick start with the 20% of features that provide 80% of the value!

**Want automatic startup?** 🚀 **[Follow the Auto-Start Setup Guide](docs/AUTO_START_SETUP.md)** to have the MCP server start automatically with Claude Code!

## 🎯 Overview

This MCP server integrates with the ontology-lsp project to provide:
- **Fast file operations** via Claude Tools layer (5ms)
- **Semantic analysis** via Tree-sitter layer (50ms)
- **Concept relationships** via Ontology Engine (10ms)
- **Pattern learning** from developer actions (10ms)
- **Intelligent propagation** of changes (20ms)

## 🚀 Features

### Multi-Layer Intelligence
1. **Claude Tools Layer** - Lightning-fast file search and grep operations
2. **Tree-Sitter Layer** - AST-based semantic code understanding
3. **Ontology Layer** - Concept relationships and knowledge graph
4. **Pattern Layer** - Learns and applies refactoring patterns
5. **Knowledge Layer** - Propagates insights across the codebase

### Transport Options
- **stdio** - Traditional CLI integration (Claude Desktop)
- **SSE** - Real-time Server-Sent Events for web-based tools

### Rich Tool Set
- Code search with fuzzy matching
- Semantic symbol navigation
- Dependency analysis
- Pattern detection and learning
- Intelligent refactoring with propagation
- Performance optimization suggestions
- Test generation

## 📦 Installation

```bash
# Install dependencies
bun install

# Build the project
bun run build
```

## 🔧 Usage

### Claude Code Integration

#### Option A: Automatic Startup (Recommended)

Set up automatic MCP server startup when Claude Code sessions begin:

1. **Create the startup hook script** at `.claude/hooks/start-mcp-server.sh`:
   ```bash
   mkdir -p .claude/hooks
   cp /path/to/mcp-ontology-server/docs/examples/start-mcp-server.sh .claude/hooks/
   chmod +x .claude/hooks/start-mcp-server.sh
   ```

2. **Configure Claude Code settings** in `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "matcher": "startup",
           "hooks": [
             {
               "type": "command",
               "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/start-mcp-server.sh",
               "timeout": 10
             }
           ]
         },
         {
           "matcher": "resume",
           "hooks": [
             {
               "type": "command",
               "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/start-mcp-server.sh",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```

3. **Add project MCP configuration** in `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "ontology-lsp": {
         "type": "sse",
         "url": "http://localhost:7001/mcp/sse",
         "description": "Ontology-enhanced LSP with 5-layer intelligent code understanding"
       }
     }
   }
   ```

Now the MCP server starts automatically when you open Claude Code in this project!

#### Option B: Manual Setup

If you prefer to manually control the server:

1. **Start the SSE server**:
   ```bash
   cd /path/to/mcp-ontology-server
   ~/.bun/bin/bun run src/sse-server.ts
   ```

2. **Add to Claude Code**:
   ```bash
   # User scope (available across all projects)
   claude mcp add --transport sse ontology-lsp --scope user http://localhost:7001/mcp/sse
   
   # Verify connection
   claude mcp list
   ```

#### Option C: Stdio Mode

For simpler setups without SSE features:

```bash
claude mcp add ontology-lsp -- ~/.bun/bin/bun run /path/to/mcp-ontology-server/src/stdio.ts
```

### Claude Desktop Integration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ontology-lsp": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-ontology-server/src/stdio.ts"]
    }
  }
}
```

### SSE Mode (Web Integration)

```bash
# Start the SSE server
bun run mcp:sse

# Server runs on http://localhost:7001
```

Connect from a web client:

```javascript
const eventSource = new EventSource('http://localhost:7001/mcp/sse')
let sessionId = null

eventSource.addEventListener('endpoint', (e) => {
  const url = new URL(e.data)
  sessionId = url.searchParams.get('sessionId')
})

eventSource.addEventListener('message', (e) => {
  const message = JSON.parse(e.data)
  console.log('Received:', message)
})

// Send requests
fetch(`http://localhost:7001/mcp/messages?sessionId=${sessionId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'find_definition',
      arguments: { symbol: 'MyClass' }
    },
    id: 1
  })
})
```

## 🛠️ Available Tools

### Search & Navigation
- `search_files` - Fast file search with glob patterns
- `grep_content` - Content search with regex support
- `find_definition` - Find symbol definitions with fuzzy matching
- `find_references` - Find all references to a symbol

### Code Analysis
- `analyze_complexity` - Analyze code complexity metrics
- `find_related_concepts` - Find ontologically related concepts
- `analyze_dependencies` - Analyze and detect circular dependencies
- `detect_patterns` - Detect design patterns and anti-patterns

### Refactoring & Learning
- `suggest_refactoring` - Get AI-powered refactoring suggestions
- `learn_pattern` - Teach the system new refactoring patterns
- `rename_symbol` - Intelligent symbol renaming with propagation
- `apply_refactoring` - Apply complex refactorings across the codebase
- `extract_interface` - Extract interfaces with automatic updates

### Code Generation
- `generate_tests` - Generate tests based on code understanding
- `optimize_performance` - Get performance optimization suggestions
- `explain_code` - Get semantic explanations of code

## 📊 Resources

The server exposes various resources for introspection:

- `ontology://concepts` - Ontology concepts
- `ontology://relationships` - Concept relationships
- `patterns://learned` - Learned refactoring patterns
- `knowledge://propagations` - Recent propagations
- `stats://performance` - Performance metrics
- `codebase://quality` - Code quality metrics

## 🎨 Prompts

Context-aware prompts that leverage the full system:

- `analyze_codebase` - Comprehensive codebase analysis
- `suggest_refactoring` - Refactoring suggestions
- `explain_concept` - Explain ontology concepts
- `detect_issues` - Find potential issues
- `architecture_review` - Review architecture

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│            MCP Client (LLM)             │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│         Layer Orchestrator              │
│   (Intelligent routing & caching)       │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴─────────┬─────────┬─────────┬─────────┐
    ▼               ▼         ▼         ▼         ▼
┌─────────┐   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Claude  │   │  Tree   │ │Ontology │ │Pattern  │ │Knowledge│
│ Tools   │   │ Sitter  │ │ Engine  │ │ Learner │ │Spreader │
│  (5ms)  │   │ (50ms)  │ │ (10ms)  │ │ (10ms)  │ │ (20ms)  │
└─────────┘   └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## 🧪 Testing

```bash
# Run tests
bun test

# Run specific test file
bun test src/layers/orchestrator.test.ts

# Run with coverage
bun test --coverage
```

## 🔍 Development

```bash
# Run in development mode with watch
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint
```

## 📈 Performance

The system is designed for optimal performance:
- **Layer 1** (Claude Tools): ~5ms for basic operations
- **Layer 2** (Tree-sitter): ~50ms for AST analysis
- **Layer 3** (Ontology): ~10ms for concept queries
- **Layer 4** (Patterns): ~10ms for pattern matching
- **Layer 5** (Knowledge): ~20ms for propagation

Total response time for complex queries: <100ms

## 🤝 Contributing

Contributions are welcome! The system is designed to be extensible:

1. **Add new tools** in `src/tools/index.ts`
2. **Extend layers** in `src/layers/`
3. **Add resources** in `src/resources/index.ts`
4. **Create prompts** in `src/prompts/index.ts`

## 📄 License

MIT

## 🔗 Related Projects

- [ontology-lsp](https://github.com/yourusername/ontology-lsp) - The main ontology LSP implementation
- [bun-mcp-sse-transport](https://github.com/yourusername/bun-mcp-sse-transport) - SSE transport for MCP

## 🙏 Acknowledgments

Built on top of:
- Anthropic's MCP SDK
- Bun runtime for blazing performance
- Tree-sitter for language parsing
- The ontology-lsp 5-layer architecture