/**
 * Centralized configuration for all servers and clients
 * This ensures no port conflicts and consistent settings across the system
 */

export interface ServerPorts {
  httpAPI: number
  mcpSSE: number
  testAPI: number
  testMCP: number
}

export interface ServerConfig {
  ports: ServerPorts
  host: string
  timeout: number
  maxRetries: number
  cacheEnabled: boolean
  cacheTTL: number
  circuitBreakerThreshold: number
  circuitBreakerResetTimeout: number
}

/**
 * Default configuration for all servers
 */
export const DEFAULT_CONFIG: ServerConfig = {
  ports: {
    httpAPI: 7000,      // Main HTTP API server
    mcpSSE: 7001,       // MCP SSE server
    testAPI: 7002,      // Test HTTP API server
    testMCP: 7003,      // Test MCP server
  },
  host: 'localhost',
  timeout: 5000,
  maxRetries: 3,
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutes
  circuitBreakerThreshold: 5,
  circuitBreakerResetTimeout: 30000, // 30 seconds
}

/**
 * Environment-based configuration overrides
 */
export function getConfig(): ServerConfig {
  const config = { ...DEFAULT_CONFIG }
  
  // Allow environment variables to override defaults
  if (process.env.HTTP_API_PORT) {
    config.ports.httpAPI = parseInt(process.env.HTTP_API_PORT)
  }
  if (process.env.MCP_SSE_PORT) {
    config.ports.mcpSSE = parseInt(process.env.MCP_SSE_PORT)
  }
  if (process.env.LSP_TIMEOUT) {
    config.timeout = parseInt(process.env.LSP_TIMEOUT)
  }
  if (process.env.LSP_MAX_RETRIES) {
    config.maxRetries = parseInt(process.env.LSP_MAX_RETRIES)
  }
  if (process.env.LSP_CACHE_ENABLED) {
    config.cacheEnabled = process.env.LSP_CACHE_ENABLED === 'true'
  }
  if (process.env.LSP_CACHE_TTL) {
    config.cacheTTL = parseInt(process.env.LSP_CACHE_TTL)
  }
  
  return config
}

/**
 * Test configuration with different ports to avoid conflicts
 */
export function getTestConfig(): ServerConfig {
  return {
    ...DEFAULT_CONFIG,
    ports: {
      httpAPI: 7002,
      mcpSSE: 7003,
      testAPI: 7002,
      testMCP: 7003,
    },
    timeout: 1000, // Shorter timeout for tests
    maxRetries: 1, // Fewer retries for tests
    cacheEnabled: false, // Disable cache for tests
  }
}

/**
 * Get the appropriate configuration based on environment
 */
export function getEnvironmentConfig(): ServerConfig {
  const isTest = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test'
  return isTest ? getTestConfig() : getConfig()
}

/**
 * Validate that ports are available and not conflicting
 */
export function validatePorts(config: ServerConfig): void {
  const ports = Object.values(config.ports)
  const uniquePorts = new Set(ports)
  
  if (ports.length !== uniquePorts.size) {
    throw new Error('Port conflict detected in configuration')
  }
  
  // Check if ports are in valid range
  for (const port of ports) {
    if (port < 1024 || port > 65535) {
      throw new Error(`Invalid port number: ${port}. Must be between 1024 and 65535`)
    }
  }
}

/**
 * Get URL for a specific service
 */
export function getServiceUrl(service: keyof ServerPorts, config?: ServerConfig): string {
  const cfg = config || getEnvironmentConfig()
  const port = cfg.ports[service]
  return `http://${cfg.host}:${port}`
}

/**
 * Log the current configuration
 */
export function logConfig(config: ServerConfig): void {
  console.log('Server Configuration:')
  console.log('=====================')
  console.log(`HTTP API Server: ${config.host}:${config.ports.httpAPI}`)
  console.log(`MCP SSE Server:  ${config.host}:${config.ports.mcpSSE}`)
  console.log(`Test Servers:    ${config.host}:${config.ports.testAPI}, ${config.host}:${config.ports.testMCP}`)
  console.log(`Timeout:         ${config.timeout}ms`)
  console.log(`Max Retries:     ${config.maxRetries}`)
  console.log(`Cache:           ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`)
  if (config.cacheEnabled) {
    console.log(`Cache TTL:       ${config.cacheTTL}ms`)
  }
  console.log('=====================')
}