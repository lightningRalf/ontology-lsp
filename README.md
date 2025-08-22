# Ontology-Enhanced LSP Proxy

An intelligent Language Server Protocol (LSP) proxy that uses semantic understanding, pattern learning, and knowledge propagation to provide enhanced code navigation and refactoring capabilities. Designed specifically to handle LLM-generated code with fuzzy matching and adaptive learning.

## Features

### 🔍 **Intelligent Code Search**
- **Multi-layer Search**: Combines Claude Code's native tools (Grep, Glob, LS) with Tree-sitter AST analysis
- **Fuzzy Matching**: Finds semantically similar identifiers even with different naming
- **Contextual Understanding**: Analyzes code structure and relationships

### 🧠 **Semantic Ontology**
- **Concept Management**: Builds and maintains a knowledge graph of code concepts
- **Relationship Tracking**: Understands how code elements relate to each other
- **Evolution History**: Tracks how concepts change over time

### 📚 **Pattern Learning**
- **Adaptive Patterns**: Learns refactoring patterns from developer actions
- **Confidence Scoring**: Evaluates pattern reliability based on usage
- **Predictive Suggestions**: Suggests likely refactorings based on learned patterns

### 🔄 **Knowledge Propagation**
- **Smart Refactoring**: Automatically suggests related changes across the codebase
- **Rule-based Logic**: Applies architectural patterns (getter/setter sync, test naming, etc.)
- **Confidence-based Application**: Only auto-applies high-confidence suggestions

### ⚡ **Performance Optimized**
- **Layered Architecture**: Fast grep → Tree-sitter → Ontology → Patterns
- **Intelligent Caching**: Multi-level caching with TTL and size limits
- **Incremental Updates**: Only processes changed files

## Architecture

```
┌─────────────────┐
│   IDE/Editor    │
└────────┬────────┘
         │ LSP Protocol
         ↓
┌─────────────────────────────┐
│   ONTOLOGY LSP PROXY        │
│ ┌─────────────────────────┐ │
│ │ Layer 1: Claude Tools   │ │ ← Grep, Glob, LS (5ms)
│ │ Layer 2: Tree-sitter    │ │ ← AST Analysis (50ms)
│ │ Layer 3: Ontology       │ │ ← Concept Management (10ms)
│ │ Layer 4: Patterns       │ │ ← Learning & Prediction (10ms)
│ │ Layer 5: Propagation    │ │ ← Knowledge Spreading (20ms)
│ └─────────────────────────┘ │
└────────┬────────────────────┘
         │ Enhanced Results
         ↓
┌─────────────────┐
│    Your Code    │
└─────────────────┘
```

## Installation

### Prerequisites
- Bun runtime (recommended) or Node.js 18+
- Claude Code environment (optional)
- TypeScript/JavaScript/Python project

### Quick Start with bunx (No Install Required!)

```bash
# Run directly without installing using bunx
bunx ontology-lsp-proxy init
bunx ontology-lsp-proxy start --stdio
bunx ontology-lsp-proxy analyze
bunx ontology-lsp-proxy stats

# Or use the shorter alias after first run
bunx ontology-lsp init
```

### Global Installation

```bash
# Install globally with npm
npm install -g ontology-lsp-proxy

# Or with Bun
bun install -g ontology-lsp-proxy

# Then use directly
ontology-lsp init
ontology-lsp start
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/your-org/ontology-lsp.git
cd ontology-lsp

# Install dependencies (using Bun)
bun install

# Initialize the project
just init

# Start all servers (HTTP API on 7000, MCP SSE on 7001)
just start

# Check server status
just status

# View logs
just logs

# Stop servers when done
just stop
```

### Using with Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "ontology-lsp": {
      "command": "/home/user/.bun/bin/bun",
      "args": ["run", "/path/to/ontology-lsp/mcp-ontology-server/src/stdio.ts"],
      "type": "stdio",
      "description": "Ontology-enhanced LSP with 5-layer architecture"
    },
    "ontology-lsp-sse": {
      "type": "sse",
      "url": "http://localhost:7001/mcp/sse",
      "description": "Ontology-enhanced LSP with SSE transport (requires 'just start')"
    }
  }
}
```

## Configuration

### Port Configuration
The system uses the following default ports (all configurable via environment variables):

| Service | Default Port | Environment Variable | Description |
|---------|-------------|---------------------|-------------|
| HTTP API | 7000 | `HTTP_API_PORT` | REST API for LSP operations |
| MCP SSE | 7001 | `MCP_SSE_PORT` | Model Context Protocol server |
| LSP Server | 7002 | `LSP_SERVER_PORT` | Language Server Protocol |

### Project Configuration

Create `.ontology-lsp-config.yaml` in your project root:

```yaml
version: 1.0.0

# Server configuration (optional - defaults shown)
server:
  ports:
    httpAPI: 7000
    mcpSSE: 7001
    lspServer: 7002

# Layer configuration
layers:
  claude_tools:
    enabled: true
    timeout: 100
    maxResults: 100
    fileTypes: [ts, tsx, js, jsx, py, java, go, rust]
    
  tree_sitter:
    enabled: true
    timeout: 500
    languages: [typescript, javascript, python]
    maxFileSize: 1MB
    
  ontology:
    enabled: true
    dbPath: .ontology/concepts.db
    cacheSize: 1000
    
  patterns:
    enabled: true
    learningThreshold: 3
    confidenceThreshold: 0.7
    maxPatterns: 1000
    
  propagation:
    enabled: true
    maxDepth: 3
    autoApplyThreshold: 0.9

# Performance tuning
performance:
  caching:
    memory:
      maxSize: 500MB
      ttl: 3600
    disk:
      enabled: true
      path: .ontology/cache
      maxSize: 2GB
      
  parallelism:
    workers: 4
    batchSize: 100
    
# Search configuration
search:
  fuzzy:
    editDistanceThreshold: 3
    tokenOverlapThreshold: 0.5
    semanticSimilarityThreshold: 0.7
  
  context:
    windowSize: 3
    includeComments: true
    includeStrings: false

# Pattern learning
patterns:
  synonyms:
    get: [fetch, retrieve, load, obtain]
    set: [update, modify, change, assign]
    create: [make, build, generate, produce]
    delete: [remove, destroy, eliminate]
  
  transformations:
    camelCase: true
    snake_case: true
    PascalCase: true
    kebab-case: true
```

## Usage

### Basic Usage

Once installed and configured, the LSP proxy automatically enhances these operations:

#### Enhanced "Go to Definition" 
```typescript
// Instead of just exact matches, finds:
const getUserData = () => {...}
const fetchUserInfo = () => {...}  // ← Found via fuzzy matching
const loadUser = () => {...}       // ← Found via semantic similarity
```

#### Intelligent Renaming
```typescript
// Rename getUserData → getUser
// Automatically suggests:
// - getUserProfile → getUserProfile  
// - fetchUserData → fetchUser (pattern learned)
// - UserDataService → UserService (propagation)
// - getUserDataTest → getUserTest (test sync)
```

#### Predictive Completion
```typescript
// Type "get" and see predictions based on learned patterns:
// - getUser (high confidence - recently used pattern)
// - fetchUser (medium confidence - synonym pattern)
// - loadUser (low confidence - semantic similarity)
```

### Advanced Usage

#### Custom Propagation Rules
```typescript
// Add custom rules for your architecture
ontology.addPropagationRule(new CustomRule(
    'api_endpoint_sync',
    'Syncs API endpoints with route handlers',
    async (change, context) => {
        if (change.identifier.endsWith('Endpoint')) {
            return [{
                target: change.identifier.replace('Endpoint', 'Handler'),
                suggestion: change.to?.replace('Endpoint', 'Handler'),
                confidence: 0.9,
                reason: 'API endpoint-handler synchronization'
            }];
        }
        return [];
    }
));
```

#### Pattern Analysis
```typescript
// Analyze what patterns the system has learned
const stats = await ontology.getPatternStatistics();
console.log(`Learned ${stats.totalPatterns} patterns`);
console.log(`Top pattern: ${stats.topPatterns[0].description}`);
```

#### Concept Exploration
```typescript
// Explore the concept graph
const concept = await ontology.findConcept('getUserData');
const related = ontology.getRelatedConcepts(concept.id);
console.log(`Found ${related.length} related concepts`);
```

## Integration

### VS Code Extension
Create `.vscode/settings.json`:
```json
{
  "ontologyLSP.enabled": true,
  "ontologyLSP.server.path": "ontology-lsp",
  "ontologyLSP.fuzzyMatching.enabled": true,
  "ontologyLSP.patternLearning.enabled": true,
  "ontologyLSP.propagation.autoApply": false
}
```

### Claude Code Integration
The proxy automatically integrates with Claude Code's tools:
- Uses `Grep` for fast content search
- Uses `Glob` for file pattern matching  
- Uses `LS` for directory structure analysis

### CI/CD Integration
```yaml
# .github/workflows/ontology-check.yml
name: Ontology Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check refactoring suggestions
        run: |
          ontology-lsp analyze --format=github-annotation
          ontology-lsp suggest-renames --confidence=0.9
```

## Development

### Building from Source
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Architecture

The system consists of several key components:

1. **Claude Tools Layer** (`src/layers/claude-tools.ts`)
   - Integrates with Claude Code's Grep, Glob, LS tools
   - Provides fast, initial filtering of search results

2. **Tree-sitter Layer** (`src/layers/tree-sitter.ts`)
   - Parses code into AST for structural understanding
   - Extracts semantic relationships and design patterns

3. **Ontology Engine** (`src/ontology/ontology-engine.ts`)
   - Manages concept lifecycle and relationships
   - Builds and maintains the knowledge graph

4. **Pattern Learner** (`src/patterns/pattern-learner.ts`)
   - Learns from developer refactoring actions
   - Builds confidence-scored pattern library

5. **Knowledge Spreader** (`src/propagation/knowledge-spreader.ts`)
   - Propagates changes across related concepts
   - Applies architectural rules and patterns

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "ontology"
npm test -- --grep "patterns"
npm test -- --grep "propagation"

# Run performance tests
npm run test:perf

# Generate coverage report
npm run test:coverage
```

### Debugging

Enable debug logging:
```bash
export DEBUG=ontology-lsp:*
ontology-lsp start --verbose
```

View internal state:
```bash
# Get statistics
curl http://localhost:7000/stats

# Get concept graph
curl http://localhost:7000/concepts

# Get learned patterns
curl http://localhost:7000/patterns
```

## Performance

### Benchmarks

| Operation | Time | Details |
|-----------|------|---------|
| Find Definition | <200ms | 10K+ file codebase |
| Find References | <500ms | Including fuzzy matches |
| Rename (50 instances) | <1s | With propagation suggestions |
| Pattern Learning | <50ms | Per rename operation |
| Initial Indexing | <30s | 10K files, full analysis |

### Memory Usage

| Component | Memory | Description |
|-----------|--------|-------------|
| Base LSP | ~50MB | Core language server |
| Ontology | ~200MB | Concept graph + cache |
| Patterns | ~100MB | Learned patterns |
| Tree-sitter | ~150MB | AST cache |
| **Total** | **~500MB** | Typical usage |

### Optimization Tips

1. **Configure file types**: Only enable for languages you use
2. **Adjust cache sizes**: Balance memory vs speed
3. **Set confidence thresholds**: Higher = fewer suggestions, better performance
4. **Use incremental mode**: Only processes changed files
5. **Limit search scope**: Use .ontologyignore for large dependencies

## Troubleshooting

### Common Issues

#### Server Won't Start
```bash
# Check if ports are available (default ports: 7000, 7001, 7002)
lsof -i :7000  # HTTP API
lsof -i :7001  # MCP SSE Server
lsof -i :7002  # LSP Server

# Or set custom ports via environment variables
export HTTP_API_PORT=8000
export MCP_SSE_PORT=8001
export LSP_SERVER_PORT=8002
ontology-lsp start

# Check logs
tail -f ~/.ontology-lsp/logs/server.log

# Reset database
rm -rf .ontology/
ontology-lsp init
```

#### Poor Performance
```bash
# Check index size
du -sh .ontology/

# Optimize database
ontology-lsp optimize

# Clear caches
ontology-lsp clear-cache
```

#### No Suggestions
```bash
# Check pattern learning
ontology-lsp stats --patterns

# Check confidence thresholds
ontology-lsp config --show | grep confidence

# Enable debug mode
DEBUG=ontology-lsp:patterns ontology-lsp start
```

### Getting Help

1. Check the [FAQ](docs/FAQ.md)
2. Search [existing issues](https://github.com/your-org/ontology-lsp/issues)
3. Create a [new issue](https://github.com/your-org/ontology-lsp/issues/new)
4. Join our [Discord](https://discord.gg/ontology-lsp)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
git clone https://github.com/your-org/ontology-lsp.git
cd ontology-lsp
npm install
npm run dev
```

### Submitting Changes
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Roadmap

### v2.0 - Multi-Language Support
- Python, Java, Go, Rust support
- Cross-language concept mapping
- Universal naming patterns

### v3.0 - AI Integration  
- LLM-powered semantic analysis
- Natural language refactoring commands
- Code explanation generation

### v4.0 - Team Collaboration
- Shared pattern libraries
- Team-wide refactoring suggestions
- Collaborative concept management

---

**Built with ❤️ for developers who work with LLMs and want smarter code navigation.**