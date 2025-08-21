# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Ontology-Enhanced LSP (Language Server Protocol) proxy that provides intelligent code navigation, refactoring, and pattern learning capabilities. It's designed to handle LLM-generated code with fuzzy matching and adaptive learning. The project uses Bun runtime (not Node.js) for better performance and native SQLite support.

## Development Commands

### Building & Running
```bash
# Build LSP server (uses Bun bundler)
just build
# or directly: ~/.bun/bin/bun build ./src/server.ts --target=bun --outdir=dist --format=esm

# Run server in development mode
just dev
# or: ~/.bun/bin/bun run src/server.ts --stdio

# Start compiled server
just start
# or: ~/.bun/bin/bun run dist/server.js --stdio

# Build everything (server + VS Code extension)
just build-all
```

### Testing
```bash
# Run all tests with Bun test runner (NOT Jest)
just test
# or: ~/.bun/bin/bun test tests/step*.test.ts tests/integration.test.ts

# Run specific test suites
just test-unit       # Unit tests only
just test-integration # Integration tests only
just test-perf       # Performance tests
just test-coverage   # With coverage report
just test-watch      # Watch mode

# Test a single file
~/.bun/bin/bun test tests/step1_similarity.test.ts
```

### Code Quality
```bash
# Lint with Biome (NOT ESLint)
just lint
# or: ~/.bun/bin/bun run lint
# or: bunx @biomejs/biome check --write .

# Format code
npm run format
# or: bunx @biomejs/biome format --write .
```

### VS Code Extension
```bash
# Build and install VS Code extension
just install-extension

# Build extension only
just build-extension

# Package extension
just package-extension

# Development mode for extension
just dev-extension  # Opens VS Code with extension project
```

### CLI Tool
```bash
# CLI is available at dist/cli/index.js after build
ontology-lsp init      # Initialize configuration
ontology-lsp start     # Start LSP server
ontology-lsp analyze   # Analyze codebase
ontology-lsp stats     # Show statistics
ontology-lsp find <identifier>  # Find with fuzzy matching
ontology-lsp suggest   # Get refactoring suggestions
```

## Architecture

### Layered System (Performance-Optimized)
The system uses a 5-layer architecture, each progressively more sophisticated:

1. **Claude Tools Layer** (`src/layers/claude-tools.ts`)
   - Fast initial search using Grep, Glob, LS tools
   - ~5ms response time
   - First line of defense for file/content searches

2. **Tree-sitter Layer** (`src/layers/tree-sitter.ts`)
   - AST-based code analysis
   - ~50ms response time
   - Structural understanding of code

3. **Ontology Engine** (`src/ontology/ontology-engine.ts`)
   - Concept management and knowledge graph
   - ~10ms response time
   - Tracks relationships between code elements

4. **Pattern Learner** (`src/patterns/pattern-learner.ts`)
   - Learns from developer refactoring actions
   - ~10ms response time
   - Builds confidence-scored pattern library

5. **Knowledge Spreader** (`src/propagation/knowledge-spreader.ts`)
   - Propagates changes across related concepts
   - ~20ms response time
   - Applies architectural rules

### Key Components

- **LSP Server** (`src/server.ts`): Main server implementing LSP protocol
- **CLI Interface** (`src/cli/index.ts`): Command-line tool
- **HTTP API** (`src/api/http-server.ts`): REST API on port 7000
- **VS Code Extension** (`vscode-client/src/extension.ts`): IDE integration
- **Storage** (`src/ontology/storage.ts`): Bun's native SQLite for persistence

### Database Schema
Uses Bun's built-in SQLite (no better-sqlite3):
- `concepts` table: Code concepts and metadata
- `relationships` table: Concept relationships
- `patterns` table: Learned refactoring patterns
- `history` table: Evolution tracking

## Technology Stack

- **Runtime**: Bun v1.2.20+ (NOT Node.js)
- **Database**: Bun's native SQLite (NOT better-sqlite3)
- **Linter**: Biome (NOT ESLint)
- **Testing**: Bun test (NOT Jest)
- **Language Parsing**: Tree-sitter for TS/JS/Python
- **LSP Libraries**: vscode-languageserver
- **Bundle Format**: ESM for server, CJS for some tools

## Important Notes

### Bun-Specific Requirements
- All build/test commands use Bun (check ~/.bun/bin/bun path)
- SQLite is built into Bun (no native module compilation)
- Tree-sitter packages are trusted dependencies
- Use `bun:test` imports in test files, not `jest`

### File Patterns
- `.ontology/` - Local database and cache
- `.ontologyignore` - Files to exclude from analysis
- `.ontology-lsp-config.yaml` - Project configuration

### Performance Targets
- Find Definition: <200ms for 10K+ files
- Find References: <500ms with fuzzy matching
- Rename: <1s for 50 instances with propagation
- Memory: ~500MB typical usage

### Common Issues & Solutions

1. **Server won't start**: Ensure Bun is installed and path is correct
2. **Native module errors**: Use Bun runtime, not Node.js
3. **Test failures**: Run with `bun test`, not `npm test`
4. **Extension not activating**: Check VS Code output panel for "Ontology Language Server"
5. **Performance issues**: Check cache settings in config, run `ontology-lsp optimize`

## Testing Strategy

The project has comprehensive test coverage across multiple layers:
- Unit tests for each component (step*.test.ts)
- Integration tests for LSP server
- Performance benchmarks
- VS Code extension tests

When adding new features:
1. Write unit tests for core logic
2. Add integration tests for LSP methods
3. Test performance with large codebases
4. Verify VS Code extension functionality