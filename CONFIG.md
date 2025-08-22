# Configuration Guide

## Overview

The Ontology LSP system uses a centralized configuration approach to prevent port conflicts and ensure consistent settings across all components.

## Configuration File

The main configuration is defined in `mcp-ontology-server/src/config/server-config.ts`.

## Port Allocation

| Service | Default Port | Environment Variable | Purpose |
|---------|-------------|---------------------|---------|
| HTTP API Server | 7000 | `HTTP_API_PORT` | Main REST API for ontology operations |
| MCP SSE Server | 7001 | `MCP_SSE_PORT` | MCP protocol over Server-Sent Events |
| Test API Server | 7002 | `TEST_API_PORT` | Isolated port for integration tests |
| Test MCP Server | 7003 | `TEST_MCP_PORT` | Isolated port for MCP tests |

## Configuration Sources

Settings are loaded in this priority order:
1. Environment variables (highest priority)
2. `.env` file (if present)
3. Default configuration in `server-config.ts`

## Environment Variables

### Server Configuration
- `HTTP_API_PORT` - HTTP API server port (default: 7000)
- `MCP_SSE_PORT` - MCP SSE server port (default: 7001)
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
HTTP_API_PORT=8000 MCP_SSE_PORT=8001 bun run start

# Using .env file
cp .env.sample .env
# Edit .env file with your settings
bun run start
```

### Running Tests

Tests automatically use the test configuration to avoid port conflicts:

```bash
# Tests will use ports 7002 and 7003
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
const mcpUrl = getServiceUrl('mcpSSE')
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
- Isolated ports (7002, 7003)
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
HTTP_API_PORT=8000 MCP_SSE_PORT=8001 bun run start
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