# NEXT_STEPS.md - What to Do Next

> **Purpose**: Forward-looking action items. For completed work, see PROJECT_STATUS.md

## 🎯 Priority 1: Production Validation (TODAY)

### 1. Run REAL Integration Tests
The current tests use mocks. Run the real integration tests for production confidence:
```bash
cd mcp-ontology-server && ~/.bun/bin/bun test test/integration/mcp-lsp-real.test.ts
```
**Why Critical**: Mocks bypass circuit breakers, retries, and real network behavior.

### 2. Test VS Code Extension 
```bash
# Install extension
just install-extension
# Or: code --install-extension vscode-client/ontology-lsp-1.0.0.vsix

# Test in VS Code:
# 1. Open a TypeScript file
# 2. Check Output panel for "Ontology Language Server"
# 3. Test F12 (Go to Definition), Shift+F12 (Find References)
# 4. Test F2 (Rename), Ctrl+. (Code Actions)
```
**Known Issue**: Activation events may not trigger in VS Code OSS

### 3. Verify Claude Desktop Integration
```bash
# Start servers
./.claude/hooks/session-start.sh

# Copy config
cp claude-desktop-config.json ~/.config/claude/claude_desktop_config.json

# Restart Claude Desktop and ask: "What tools do you have available?"
```

## 🚀 Priority 2: Deployment Ready (THIS WEEK)

### 1. Build & Test Docker Container
```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install
EXPOSE 7000 7001
CMD ["bun", "run", ".claude/hooks/session-start.sh"]
```
```bash
docker build -t ontology-lsp .
docker run -p 7000:7000 -p 7001:7001 ontology-lsp
```

### 2. Publish to NPM
```bash
npm version minor  # We added significant features
npm publish
# Users can then: bunx ontology-lsp start
```

### 3. Performance Baseline
Run benchmarks to establish performance metrics:
```bash
# Create benchmark script
cd mcp-ontology-server
bun test test/benchmarks/performance.test.ts
```
Target metrics:
- Find definition: <200ms for 10K files
- Circuit breaker: Opens after 5 failures
- Cache hit rate: >80% in typical usage

## 🔧 Priority 3: Production Hardening (NEXT SPRINT)

### 1. Replace Mocks with Test Fixtures
Current timeout tests use mocks. Replace with:
- Test containers for isolated servers
- Network simulation tools
- Chaos engineering tests

### 2. Add Observability
```typescript
// OpenTelemetry integration
import { trace } from '@opentelemetry/api'
const tracer = trace.getTracer('ontology-lsp')
```

### 3. Security Audit
- Add rate limiting to HTTP API
- Implement API key authentication
- Sanitize file paths in .ontologyignore
- Add CORS configuration options

### 4. Multi-Language Support
Currently supports TS/JS/Python. Add:
- Rust (high demand)
- Go (growing ecosystem)  
- Java (enterprise needs)

## 🧪 Priority 4: Advanced Features (FUTURE)

### 1. Distributed Ontology
- Share concepts across team/organization
- Federated learning from multiple codebases
- Conflict resolution strategies

### 2. AI-Enhanced Refactoring
Leverage the intelligent `inferConcept`:
- Suggest architectural improvements
- Detect anti-patterns using learned patterns
- Auto-generate documentation from inferred relationships

### 3. Real-time Collaboration
- WebSocket-based live concept sharing
- Conflict-free replicated data types (CRDTs)
- Team learning analytics

## ⚠️ Known Issues to Address

### Critical
1. **Mock Tests**: Integration tests use mocks that bypass real behavior
2. **VS Code OSS**: Extension may not activate properly
3. **Circuit Breaker**: Thresholds need tuning for production

### Important
1. **Memory Usage**: SQLite in-memory DB has no size limits
2. **Cache Invalidation**: No strategy for stale concept cache
3. **Error Recovery**: Missing graceful degradation

### Nice to Have
1. **Telemetry**: No usage analytics
2. **Migrations**: No DB schema migration strategy
3. **Backup**: No concept database backup/restore

## 📊 Success Metrics

Track these to validate production readiness:

### Technical
- [ ] Real integration tests pass (no mocks)
- [ ] VS Code extension activates reliably
- [ ] Docker container runs for 24h without issues
- [ ] Memory usage stays under 1GB with 10K concepts

### User Experience  
- [ ] Find definition responds in <200ms (p95)
- [ ] Zero false positives in fuzzy matching
- [ ] Rename propagation completes in <1s
- [ ] Circuit breaker prevents cascade failures

### Adoption
- [ ] NPM package has >10 downloads/week
- [ ] GitHub repo has >10 stars
- [ ] At least 1 user reports success
- [ ] Claude Desktop integration confirmed working

## 🎬 Quick Start for Next Session

```bash
# 1. Start where we left off
cd ~/programming/ontology-lsp
source ~/.bun/bin/bun  # Ensure Bun is in PATH

# 2. Check everything still works
cd mcp-ontology-server && bun test  # Should show 26/26 passing

# 3. Run REAL integration tests (priority!)
bun test test/integration/mcp-lsp-real.test.ts

# 4. Start servers
./.claude/hooks/session-start.sh

# 5. Test with Claude
# Ask: "What tools do you have available?"
```

---

**Remember**: The `inferConcept` feature is not a bug—it's the system's intelligence. Preserve it!