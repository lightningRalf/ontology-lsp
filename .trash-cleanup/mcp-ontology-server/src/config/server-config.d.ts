/**
 * Centralized configuration for all servers and clients
 * This ensures no port conflicts and consistent settings across the system
 */
export interface ServerPorts {
    httpAPI: number;
    mcpSSE: number;
    lspServer: number;
    testAPI: number;
    testMCP: number;
    testLSP: number;
}
export interface ServerConfig {
    ports: ServerPorts;
    host: string;
    timeout: number;
    maxRetries: number;
    cacheEnabled: boolean;
    cacheTTL: number;
    circuitBreakerThreshold: number;
    circuitBreakerResetTimeout: number;
}
/**
 * Default configuration for all servers
 */
export declare const DEFAULT_CONFIG: ServerConfig;
/**
 * Environment-based configuration overrides
 */
export declare function getConfig(): ServerConfig;
/**
 * Test configuration with different ports to avoid conflicts
 */
export declare function getTestConfig(): ServerConfig;
/**
 * Get the appropriate configuration based on environment
 */
export declare function getEnvironmentConfig(): ServerConfig;
/**
 * Validate that ports are available and not conflicting
 */
export declare function validatePorts(config: ServerConfig): void;
/**
 * Get URL for a specific service
 */
export declare function getServiceUrl(service: keyof ServerPorts, config?: ServerConfig): string;
/**
 * Log the current configuration
 */
export declare function logConfig(config: ServerConfig): void;
//# sourceMappingURL=server-config.d.ts.map