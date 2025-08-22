# MCP-LSP Integration Documentation

This document describes how the MCP server integrates with the Ontology-Enhanced LSP server to provide intelligent code understanding capabilities.

## Overview

The MCP server acts as a bridge between AI assistants and the LSP server, translating MCP protocol requests into HTTP API calls to the LSP server.

## Architecture

```
┌─────────────────┐
│   AI Assistant  │
│    (Claude)     │
└────────┬────────┘
         │ MCP Protocol (stdio/SSE)
         ↓
┌─────────────────┐
│   MCP Server    │
│  (TypeScript)   │
├─────────────────┤
│   HTTP Client   │
│  - Retry Logic  │
│  - Circuit      │
│    Breaker      │
│  - Caching      │
└────────┬────────┘
         │ HTTP/REST
         ↓
┌─────────────────┐
│ LSP API Server  │
│   (Port 7000)   │
├─────────────────┤
│ Ontology Engine │
│ Pattern Learner │
│ Tree-sitter     │
│ Knowledge       │
│   Spreader      │
└─────────────────┘
```

## Integration Points

### 1. Ontology Layer → `/concepts` Endpoint

**MCP Request:**
```typescript
{
  tool: "ontology_find",
  arguments: {
    concept: "UserService",
    depth: 2
  }
}
```

**LSP API Call:**
```http
GET /concepts?identifier=UserService
```

**Response Flow:**
```
MCP Server → LSP Client → HTTP GET → LSP Server → Ontology Engine
```

### 2. Tree-Sitter Layer → `/find` Endpoint

**MCP Request:**
```typescript
{
  tool: "find_symbol",
  arguments: {
    symbol: "calculateTotal",
    semantic: true
  }
}
```

**LSP API Call:**
```http
POST /find
{
  "identifier": "calculateTotal",
  "semantic": true,
  "fuzzy": false
}
```

### 3. Pattern Layer → `/patterns` and `/suggest` Endpoints

**MCP Request:**
```typescript
{
  tool: "suggest_refactoring",
  arguments: {
    identifier: "oldMethodName"
  }
}
```

**LSP API Calls:**
```http
GET /patterns
POST /suggest
{
  "identifier": "oldMethodName"
}
```

### 4. Knowledge Layer → `/analyze` Endpoint

**MCP Request:**
```typescript
{
  tool: "analyze_architecture",
  arguments: {
    directory: "./src"
  }
}
```

**LSP API Call:**
```http
POST /analyze
{
  "path": "./src"
}
```

## Connection Management

### Configuration

The connection is configured through:

1. **Environment Variables**:
```bash
ONTOLOGY_LSP_HOST=localhost
ONTOLOGY_LSP_PORT=7000
LSP_TIMEOUT=5000
LSP_MAX_RETRIES=3
```

2. **Config File** (`config.json`):
```json
{
  "lsp": {
    "connection": {
      "host": "localhost",
      "port": 7000,
      "timeout": 5000,
      "maxRetries": 3
    }
  }
}
```

### Health Monitoring

The MCP server continuously monitors LSP server health:

```typescript
// Health check endpoint
GET /health → { "status": "healthy" }

// Periodic health checks
setInterval(() => lspClient.healthCheck(), 30000)
```

## Error Handling

### Circuit Breaker Pattern

Prevents cascading failures when LSP server is down:

```typescript
class CircuitBreaker {
  states = { CLOSED, OPEN, HALF_OPEN }
  failureThreshold = 5
  resetTimeout = 60000 // 1 minute
  
  // After 5 failures → OPEN state
  // After 1 minute → HALF_OPEN state
  // After success → CLOSED state
}
```

### Retry Mechanism

Exponential backoff for transient failures:

```typescript
retryDelays = [1000, 2000, 4000, 8000] // ms
maxRetries = 3

// Retry sequence:
// Attempt 1 → Fail → Wait 1s
// Attempt 2 → Fail → Wait 2s  
// Attempt 3 → Fail → Wait 4s
// Attempt 4 → Fail → Give up
```

### Caching Strategy

Reduces load on LSP server:

```typescript
cache = {
  ttl: 300000,        // 5 minutes
  maxEntries: 1000,   // Maximum cached items
  strategy: "LRU"     // Least Recently Used
}

// Cacheable endpoints:
// GET /stats
// GET /concepts
// GET /patterns

// Non-cacheable endpoints:
// POST /find (dynamic search)
// POST /suggest (context-dependent)
// POST /analyze (may change)
```

## Performance Optimization

### Connection Pooling

Reuses HTTP connections:

```typescript
const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  keepAliveMsecs: 60000
})
```

### Request Batching

Groups multiple requests when possible:

```typescript
// Instead of:
await getConcept("A")
await getConcept("B")
await getConcept("C")

// Use:
await Promise.all([
  getConcept("A"),
  getConcept("B"),
  getConcept("C")
])
```

### Response Compression

Reduces network overhead:

```http
Accept-Encoding: gzip, deflate
Content-Encoding: gzip
```

## Monitoring

### Metrics Collected

- **Request Rate**: Requests per second to LSP
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: Failed requests percentage
- **Cache Hit Rate**: Percentage served from cache
- **Circuit State**: Current circuit breaker state

### Logging

```typescript
// Log levels
LOG_LEVEL=debug  // All requests/responses
LOG_LEVEL=info   // Important events
LOG_LEVEL=warn   // Warnings and retries
LOG_LEVEL=error  // Errors only

// Example logs:
[INFO] Connected to LSP server at localhost:7000
[WARN] LSP request failed, retrying (attempt 2/3)
[ERROR] Circuit breaker opened after 5 failures
[DEBUG] Cache hit for /concepts?identifier=UserService
```

## Deployment Scenarios

### 1. Local Development

Both servers on same machine:

```bash
# Terminal 1: Start LSP server
cd ontology-lsp
bun run src/api/http-server.ts

# Terminal 2: Start MCP server
cd mcp-ontology-server
bun run src/index.ts
```

### 2. Docker Deployment

Using Docker Compose:

```yaml
version: '3.8'
services:
  lsp-server:
    build: ./ontology-lsp
    ports:
      - "7000:7000"
    
  mcp-server:
    build: ./mcp-ontology-server
    environment:
      - ONTOLOGY_LSP_HOST=lsp-server
      - ONTOLOGY_LSP_PORT=7000
    depends_on:
      - lsp-server
```

### 3. Distributed Deployment

MCP and LSP on different machines:

```bash
# Machine A: LSP Server
ONTOLOGY_API_HOST=0.0.0.0 bun run src/api/http-server.ts

# Machine B: MCP Server
ONTOLOGY_LSP_HOST=machine-a.network.local \
ONTOLOGY_LSP_PORT=7000 \
bun run src/index.ts
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check LSP server is running
   - Verify host/port configuration
   - Check firewall rules

2. **Timeouts**
   - Increase `LSP_TIMEOUT`
   - Check network latency
   - Verify LSP server performance

3. **Circuit Breaker Open**
   - Check LSP server health
   - Review error logs
   - Wait for reset or restart MCP

4. **High Memory Usage**
   - Reduce cache size
   - Check for memory leaks
   - Monitor cache cleanup

### Debug Commands

```bash
# Test LSP connectivity
curl http://localhost:7000/health

# Check MCP server status
curl http://localhost:3000/status

# Monitor real-time logs
tail -f mcp-server.log | grep ERROR

# Test specific endpoint
curl -X POST http://localhost:7000/find \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test"}'
```

## Security Considerations

### Authentication

Currently not implemented. For production:

```typescript
// Add API key authentication
headers: {
  'Authorization': `Bearer ${API_KEY}`
}
```

### Rate Limiting

Prevent abuse:

```typescript
const rateLimiter = {
  windowMs: 60000,     // 1 minute
  maxRequests: 100,    // 100 requests per minute
  message: "Too many requests"
}
```

### Input Validation

Sanitize all inputs:

```typescript
// Validate identifier format
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
  throw new Error("Invalid identifier format")
}
```

## Future Enhancements

1. **WebSocket Support**: Real-time updates
2. **GraphQL Interface**: More flexible queries
3. **Distributed Caching**: Redis/Valkey integration
4. **Metrics Dashboard**: Grafana integration
5. **Load Balancing**: Multiple LSP server support
6. **Event Streaming**: Server-sent events for live updates
7. **Authentication**: OAuth2/JWT support
8. **Request Prioritization**: QoS for different request types