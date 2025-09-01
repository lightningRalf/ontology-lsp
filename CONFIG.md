# Configuration Guide

## Overview

The Ontology LSP system uses a centralized configuration approach to prevent port conflicts and ensure consistent settings across all components.

## Configuration File

The main configuration is defined in `mcp-ontology-server/src/config/server-config.ts`.

## Port Allocation

| Service | Default Port | Environment Variable | Purpose |
|---------|-------------|---------------------|---------|
| **Production** | | | |
| HTTP API Server | 7000 | `HTTP_API_PORT` | Main REST API for ontology operations |
| MCP HTTP Server | 7001 | `MCP_HTTP_PORT` | MCP protocol over Streamable HTTP |
| LSP Server | 7002 (or stdio) | `LSP_SERVER_PORT` | Language Server Protocol (TCP or stdio mode) |
| **Test Instances** | | | |
| Test HTTP API | 7010 | - | Test instance of HTTP API server |
| Test MCP HTTP | 7011 | - | Test instance of MCP server |
| Test LSP | 7012 | - | Test instance of LSP server |
| **Test Targets** | | | |
| Test Target API | 7020 | `TEST_API_PORT` | Isolated server for tests to connect to |
| Test Target MCP | 7021 | `TEST_MCP_PORT` | Isolated MCP for tests to connect to |
| Test Target LSP | 7022 | `TEST_LSP_PORT` | Isolated LSP for tests to connect to |

## Configuration Sources

Settings are loaded in this priority order:
1. Environment variables (highest priority)
2. `.env` file (if present)
3. Default configuration in `server-config.ts`

## Environment Variables

### Server Configuration
- `HTTP_API_PORT` - HTTP API server port (default: 7000)
- `MCP_HTTP_PORT` - MCP HTTP server port (default: 7001)
- `LSP_SERVER_PORT` - LSP server port for TCP mode (default: 7002)
- `LSP_HOST` - Server host (default: localhost)

### Performance Settings
- `LSP_TIMEOUT` - Request timeout in milliseconds (default: 5000)
- `LSP_MAX_RETRIES` - Maximum retry attempts (default: 3)
- `LSP_CACHE_ENABLED` - Enable response caching (default: true)
- `LSP_CACHE_TTL` - Cache time-to-live in milliseconds (default: 300000)

### Circuit Breaker
- `CIRCUIT_BREAKER_THRESHOLD` - Failures before opening circuit (default: 5)
- `CIRCUIT_BREAKER_RESET_TIMEOUT` - Reset timeout in milliseconds (default: 30000)

### Environment Mode
- `NODE_ENV` - Set to 'test' for test configuration
- `BUN_ENV` - Alternative to NODE_ENV for Bun runtime

## Usage Examples

### Starting Servers with Custom Ports

```bash
# Using environment variables
HTTP_API_PORT=8000 MCP_HTTP_PORT=8001 bun run start

# Using .env file
cp .env.sample .env
# Edit .env file with your settings
bun run start
```

### Running Tests

Tests automatically use the test configuration to avoid port conflicts:

```bash
# Tests will use ports 7010-7012 for test instances
# and 7020-7022 for isolated test targets
bun test

# Or explicitly set test environment
BUN_ENV=test bun test
```

### Programmatic Usage

```typescript
import { getEnvironmentConfig, getServiceUrl } from './config/server-config'

// Get current configuration
const config = getEnvironmentConfig()
console.log(`API server: ${config.host}:${config.ports.httpAPI}`)

// Get service URL
const apiUrl = getServiceUrl('httpAPI')
const mcpUrl = getServiceUrl('mcpHTTP')
```

## Configuration Validation

The configuration module includes validation to ensure:
- No port conflicts between services
- Ports are in valid range (1024-65535)
- Required settings are present

## Development vs Production

### Development (default)
- Verbose logging
- CORS enabled with permissive settings
- Shorter cache TTL
- More retries

### Production
```bash
NODE_ENV=production bun run start
```
- Optimized performance settings
- Stricter CORS settings
- Longer cache TTL
- Authentication required

### Test Environment
```bash
BUN_ENV=test bun test
```
- Isolated ports (7010-7012 for instances, 7020-7022 for targets)
- In-memory database
- Disabled caching
- Shorter timeouts

## Troubleshooting

### Port Already in Use

If you see "EADDRINUSE" errors:

1. Check running processes:
```bash
lsof -i :7000
lsof -i :7001
```

2. Kill existing processes:
```bash
./.claude/hooks/session-stop.sh
```

3. Use different ports:
```bash
HTTP_API_PORT=8000 MCP_HTTP_PORT=8001 bun run start
```

### Configuration Not Loading

1. Check environment variables:
```bash
env | grep -E "LSP_|MCP_|HTTP_API"
```

2. Verify .env file location:
```bash
ls -la .env
```

3. Enable debug logging:
```bash
LOG_LEVEL=debug bun run start
```

## Best Practices

1. **Never commit .env files** - Use .env.sample as template
2. **Use environment-specific configs** - Set NODE_ENV/BUN_ENV appropriately
3. **Validate ports before starting** - Check for conflicts
4. **Monitor circuit breaker** - Adjust thresholds based on network conditions
5. **Tune cache settings** - Balance freshness vs performance

## Layer 4 StoragePort (Ontology) Configuration

Layer 4 persists concepts and relations through a pluggable StoragePort. Select the backend via config or environment.

- Adapter selection (default: sqlite):
  - `layers.layer4.adapter: 'sqlite' | 'postgres' | 'triplestore'`

- SQLite options:
  - `layers.layer4.dbPath`: path to the SQLite DB file (default: `.ontology/ontology.db`)

- Postgres options:
  - Install the `pg` package in your environment.
  - Provide a connection string using one of:
    - `ONTOLOGY_PG_URL`
    - `DATABASE_URL`
    - `PG_URL` or `PGURL`
  - Example:
    - `export ONTOLOGY_PG_URL=postgres://user:pass@localhost:5432/ontology`
  - Set adapter:
    - `layers.layer4.adapter: postgres`

- Triple Store options:
  - Adapter is scaffolded but CRUD is not implemented yet.

Notes:
- If Postgres is not configured, the adapter’s `initialize()` will no-op and related tests are skipped.
- For production deployments, use managed Postgres with pooling and SSL; configure timeouts and budgets per SLOs.

### Metrics & Dashboards

- HTTP metrics endpoints:
  - JSON: `GET /metrics` → consolidated metrics for L1, L2, and L4.
    - L1 (Fast Search): `{ searches, cacheHits, fallbacks, timeouts, avgResponseTime, asyncTools: { processPoolSize, defaultTimeout } }`
    - L2 (AST Parser): `{ count, errors, p50, p95, p99 }`
    - L4 (Storage): `{ startedAt, updatedAt, operations: { op -> { count, errors, p50, p95, p99 } }, extras: { skippedRepresentationsSave, skippedRepresentationsLoad } }`
  - Prometheus: `GET /metrics?format=prometheus` → text exposition format with series for L1/L2/L4.
    - L1: `ontology_l1_timeouts_total`, `ontology_l1_fallbacks_total`, `ontology_l1_avg_response_ms`
    - L2: `ontology_l2_parse_count`, `ontology_l2_parse_errors`, `ontology_l2_parse_duration_ms{quantile="p50|p95|p99"}`
    - L4: `ontology_l4_operation_count{op}`, `ontology_l4_operation_errors{op}`, `ontology_l4_operation_duration_ms{op,quantile="p50|p95|p99"}`, `ontology_l4_started_at_seconds`, `ontology_l4_updated_at_seconds`

- Prometheus scrape config is provided at `config/prometheus/prometheus.yml` (HTTP job at port 7000, path `/metrics`).

- Grafana dashboard: see `config/grafana/dashboards/layer4-storage-metrics.json` (basic timeseries panels for counts, errors, p95/p99).

## Performance Testing Overrides (Perf Suite)

These environment variables are used to tune and stabilize perf tests
on different hosts. Defaults target typical developer machines; CI may
override as needed.

- Async search timeout override:
  - `ENHANCED_GREP_DEFAULT_TIMEOUT_MS` (number, optional)
  - `ENHANCED_GREP_MAX_PROCESSES` (number, optional) — align async process pool with host cores or override explicitly

- Perf thresholds (consumed by perf tests):
  - `PERF_P95_TARGET_MS` (default 150)
  - `PERF_P99_TARGET_MS` (default 200)
  - `PERF_CONCURRENCY_P95_TARGET_MS` (default 200)

Guidance:
- Run a warm‑up iteration in perf tests to pre‑warm caches and minimize
  cold‑start noise.
- Prefer deterministic, synthetic fixtures for “large codebase”
  scenarios to reduce I/O variance.

## CLI Stats

- `ontology-lsp stats` prints a concise per-layer metrics summary:
  - L1 searches/cache hits/fallbacks/timeouts/average latency, plus async pool size and default timeout
  - L2 parse counts/errors and p50/p95
  - L4 storage operation counts/errors and duration quantiles


## Configuration API Reference

### `getEnvironmentConfig()`
Returns the current configuration based on environment.

### `getTestConfig()`
Returns configuration optimized for testing.

### `getServiceUrl(service: string)`
Returns the full URL for a service.

### `validatePorts(config: ServerConfig)`
Validates port configuration for conflicts.

### `logConfig(config: ServerConfig)`
Logs the current configuration for debugging.
