"use strict";
/**
 * Centralized configuration for all servers and clients
 * This ensures no port conflicts and consistent settings across the system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.getConfig = getConfig;
exports.getTestConfig = getTestConfig;
exports.getEnvironmentConfig = getEnvironmentConfig;
exports.validatePorts = validatePorts;
exports.getServiceUrl = getServiceUrl;
exports.logConfig = logConfig;
/**
 * Default configuration for all servers
 */
exports.DEFAULT_CONFIG = {
    ports: {
        httpAPI: 7000, // Main HTTP API server
        mcpSSE: 7001, // MCP SSE server
        lspServer: 7002, // LSP server (can run TCP or stdio)
        testAPI: 7010, // Test HTTP API server
        testMCP: 7011, // Test MCP server
        testLSP: 7012, // Test LSP server
    },
    host: 'localhost',
    timeout: 5000,
    maxRetries: 3,
    cacheEnabled: true,
    cacheTTL: 300000, // 5 minutes
    circuitBreakerThreshold: 5,
    circuitBreakerResetTimeout: 30000, // 30 seconds
};
/**
 * Environment-based configuration overrides
 */
function getConfig() {
    const config = { ...exports.DEFAULT_CONFIG };
    // Allow environment variables to override defaults
    if (process.env.HTTP_API_PORT) {
        config.ports.httpAPI = parseInt(process.env.HTTP_API_PORT);
    }
    if (process.env.MCP_SSE_PORT) {
        config.ports.mcpSSE = parseInt(process.env.MCP_SSE_PORT);
    }
    if (process.env.LSP_SERVER_PORT) {
        config.ports.lspServer = parseInt(process.env.LSP_SERVER_PORT);
    }
    if (process.env.LSP_TIMEOUT) {
        config.timeout = parseInt(process.env.LSP_TIMEOUT);
    }
    if (process.env.LSP_MAX_RETRIES) {
        config.maxRetries = parseInt(process.env.LSP_MAX_RETRIES);
    }
    if (process.env.LSP_CACHE_ENABLED) {
        config.cacheEnabled = process.env.LSP_CACHE_ENABLED === 'true';
    }
    if (process.env.LSP_CACHE_TTL) {
        config.cacheTTL = parseInt(process.env.LSP_CACHE_TTL);
    }
    return config;
}
/**
 * Test configuration with different ports to avoid conflicts
 */
function getTestConfig() {
    return {
        ...exports.DEFAULT_CONFIG,
        ports: {
            httpAPI: 7010, // Test instance of HTTP API
            mcpSSE: 7011, // Test instance of MCP SSE
            lspServer: 7012, // Test instance of LSP
            testAPI: 7020, // Isolated test target API
            testMCP: 7021, // Isolated test target MCP
            testLSP: 7022, // Isolated test target LSP
        },
        timeout: 1000, // Shorter timeout for tests
        maxRetries: 1, // Fewer retries for tests
        cacheEnabled: false, // Disable cache for tests
    };
}
/**
 * Get the appropriate configuration based on environment
 */
function getEnvironmentConfig() {
    const isTest = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
    return isTest ? getTestConfig() : getConfig();
}
/**
 * Validate that ports are available and not conflicting
 */
function validatePorts(config) {
    const ports = Object.values(config.ports);
    const uniquePorts = new Set(ports);
    if (ports.length !== uniquePorts.size) {
        throw new Error('Port conflict detected in configuration');
    }
    // Check if ports are in valid range
    for (const port of ports) {
        if (port < 1024 || port > 65535) {
            throw new Error(`Invalid port number: ${port}. Must be between 1024 and 65535`);
        }
    }
}
/**
 * Get URL for a specific service
 */
function getServiceUrl(service, config) {
    const cfg = config || getEnvironmentConfig();
    const port = cfg.ports[service];
    return `http://${cfg.host}:${port}`;
}
/**
 * Log the current configuration
 */
function logConfig(config) {
    console.log('Server Configuration:');
    console.log('=====================');
    console.log(`HTTP API Server: ${config.host}:${config.ports.httpAPI}`);
    console.log(`MCP SSE Server:  ${config.host}:${config.ports.mcpSSE}`);
    console.log(`LSP Server:      ${config.host}:${config.ports.lspServer} (or stdio)`);
    console.log(`Test Servers:    ${config.host}:${config.ports.testAPI} (API), ${config.host}:${config.ports.testMCP} (MCP), ${config.host}:${config.ports.testLSP} (LSP)`);
    console.log(`Timeout:         ${config.timeout}ms`);
    console.log(`Max Retries:     ${config.maxRetries}`);
    console.log(`Cache:           ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`);
    if (config.cacheEnabled) {
        console.log(`Cache TTL:       ${config.cacheTTL}ms`);
    }
    console.log('=====================');
}
//# sourceMappingURL=server-config.js.map