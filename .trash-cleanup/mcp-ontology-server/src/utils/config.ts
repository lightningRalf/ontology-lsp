/**
 * Configuration management for MCP-LSP integration
 * 
 * Loads configuration from multiple sources with priority:
 * 1. Environment variables (highest)
 * 2. Config file specified via CONFIG_PATH env var
 * 3. Local config.json
 * 4. Default config (lowest)
 */

import * as fs from 'fs'
import * as path from 'path'

interface LSPConnectionConfig {
  host: string
  port: number
  timeout: number
  maxRetries: number
  retryDelay: number
  circuitBreaker: {
    enabled: boolean
    failureThreshold: number
    resetTimeout: number
  }
}

interface CacheConfig {
  enabled: boolean
  ttl: number
  maxEntries: number
  cleanupInterval: number
}

interface LayerConfig {
  enabled: boolean
  timeout: number
  [key: string]: any
}

export interface Config {
  mcp: {
    server: {
      name: string
      version: string
      description: string
      transport: string
    }
  }
  lsp: {
    connection: LSPConnectionConfig
    cache: CacheConfig
  }
  layers: {
    ontology: LayerConfig
    treeSitter: LayerConfig
    patterns: LayerConfig
    knowledge: LayerConfig
  }
  performance: {
    targets: {
      ontology: string
      treeSitter: string
      patterns: string
      knowledge: string
    }
    monitoring: {
      enabled: boolean
      metricsInterval: number
    }
  }
  logging: {
    level: string
    format: string
    destination: string
  }
}

class ConfigManager {
  private config: Config | null = null
  private configPath: string | null = null

  /**
   * Load configuration from all sources
   */
  load(): Config {
    if (this.config) {
      return this.config
    }

    // Start with default config
    let config = this.loadDefaultConfig()

    // Override with file config if exists
    const fileConfig = this.loadFileConfig()
    if (fileConfig) {
      config = this.deepMerge(config, fileConfig)
    }

    // Override with environment variables
    config = this.applyEnvironmentOverrides(config)

    this.config = config
    return config
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfig(): Config {
    const defaultPath = path.join(__dirname, '../../config/default.json')
    
    try {
      const content = fs.readFileSync(defaultPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.warn('Default config not found, using hardcoded defaults')
      return this.getHardcodedDefaults()
    }
  }

  /**
   * Load configuration from file
   */
  private loadFileConfig(): Partial<Config> | null {
    // Check for config path in environment
    const configPath = process.env.MCP_CONFIG_PATH || 
                      process.env.CONFIG_PATH ||
                      './config.json'

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8')
        this.configPath = configPath
        console.log(`Loaded config from: ${configPath}`)
        return JSON.parse(content)
      }
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error)
    }

    return null
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(config: Config): Config {
    // LSP connection settings
    if (process.env.ONTOLOGY_LSP_HOST) {
      config.lsp.connection.host = process.env.ONTOLOGY_LSP_HOST
    }
    if (process.env.ONTOLOGY_LSP_PORT) {
      config.lsp.connection.port = parseInt(process.env.ONTOLOGY_LSP_PORT)
    }
    if (process.env.LSP_TIMEOUT) {
      config.lsp.connection.timeout = parseInt(process.env.LSP_TIMEOUT)
    }
    if (process.env.LSP_MAX_RETRIES) {
      config.lsp.connection.maxRetries = parseInt(process.env.LSP_MAX_RETRIES)
    }

    // Cache settings
    if (process.env.CACHE_ENABLED) {
      config.lsp.cache.enabled = process.env.CACHE_ENABLED === 'true'
    }
    if (process.env.CACHE_TTL) {
      config.lsp.cache.ttl = parseInt(process.env.CACHE_TTL)
    }

    // Layer settings
    if (process.env.DISABLE_ONTOLOGY) {
      config.layers.ontology.enabled = false
    }
    if (process.env.DISABLE_TREE_SITTER) {
      config.layers.treeSitter.enabled = false
    }
    if (process.env.DISABLE_PATTERNS) {
      config.layers.patterns.enabled = false
    }
    if (process.env.DISABLE_KNOWLEDGE) {
      config.layers.knowledge.enabled = false
    }

    // Logging
    if (process.env.LOG_LEVEL) {
      config.logging.level = process.env.LOG_LEVEL
    }

    return config
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target }

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key])
        } else {
          result[key] = source[key]
        }
      }
    }

    return result
  }

  /**
   * Get hardcoded default configuration
   */
  private getHardcodedDefaults(): Config {
    return {
      mcp: {
        server: {
          name: "ontology-mcp-server",
          version: "1.0.0",
          description: "MCP server for Ontology-Enhanced LSP",
          transport: "stdio"
        }
      },
      lsp: {
        connection: {
          host: "localhost",
          port: 7000,
          timeout: 5000,
          maxRetries: 3,
          retryDelay: 1000,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            resetTimeout: 60000
          }
        },
        cache: {
          enabled: true,
          ttl: 300000,
          maxEntries: 1000,
          cleanupInterval: 60000
        }
      },
      layers: {
        ontology: {
          enabled: true,
          timeout: 1000,
          cache: {
            statsTTL: 60000
          }
        },
        treeSitter: {
          enabled: true,
          timeout: 2000,
          languages: ["typescript", "javascript", "python"]
        },
        patterns: {
          enabled: true,
          timeout: 1000,
          minConfidence: 0.7
        },
        knowledge: {
          enabled: true,
          timeout: 2000,
          propagationDepth: 5
        }
      },
      performance: {
        targets: {
          ontology: "10ms",
          treeSitter: "50ms",
          patterns: "10ms",
          knowledge: "20ms"
        },
        monitoring: {
          enabled: true,
          metricsInterval: 60000
        }
      },
      logging: {
        level: "info",
        format: "json",
        destination: "stdout"
      }
    }
  }

  /**
   * Get configuration value by path
   */
  get<T = any>(path: string): T | undefined {
    const config = this.load()
    const keys = path.split('.')
    let value: any = config

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        return undefined
      }
    }

    return value as T
  }

  /**
   * Get LSP client configuration
   */
  getLSPClientConfig() {
    const config = this.load()
    return {
      host: config.lsp.connection.host,
      port: config.lsp.connection.port,
      timeout: config.lsp.connection.timeout,
      maxRetries: config.lsp.connection.maxRetries,
      cacheEnabled: config.lsp.cache.enabled,
      cacheTTL: config.lsp.cache.ttl
    }
  }

  /**
   * Check if a layer is enabled
   */
  isLayerEnabled(layer: 'ontology' | 'treeSitter' | 'patterns' | 'knowledge'): boolean {
    const config = this.load()
    return config.layers[layer]?.enabled ?? true
  }

  /**
   * Get performance target for a layer
   */
  getPerformanceTarget(layer: 'ontology' | 'treeSitter' | 'patterns' | 'knowledge'): string {
    const config = this.load()
    return config.performance.targets[layer]
  }

  /**
   * Reload configuration
   */
  reload(): Config {
    this.config = null
    return this.load()
  }
}

// Export singleton instance
export const configManager = new ConfigManager()

// Export convenience function
export function getConfig(): Config {
  return configManager.load()
}

// Export LSP client config helper
export function getLSPClientConfig() {
  return configManager.getLSPClientConfig()
}