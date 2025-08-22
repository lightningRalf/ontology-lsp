/**
 * HTTP Client for communicating with the Ontology LSP Server
 * 
 * Provides a resilient connection to the LSP server's HTTP API with:
 * - Connection pooling for efficiency
 * - Exponential backoff retry logic
 * - Circuit breaker pattern for fault tolerance
 * - Response caching to reduce redundant calls
 * - Timeout handling
 */

interface LSPClientConfig {
  host: string
  port: number
  timeout?: number
  maxRetries?: number
  cacheEnabled?: boolean
  cacheTTL?: number
}

interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
}

enum CircuitState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open"
}

export class LSPClient {
  private baseUrl: string
  private timeout: number
  private maxRetries: number
  private cache: Map<string, CacheEntry>
  private cacheEnabled: boolean
  private cacheTTL: number
  
  // Circuit breaker state
  private circuitState: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private failureThreshold: number = 5
  private lastFailureTime: number = 0
  private circuitResetTimeout: number = 60000 // 1 minute
  
  constructor(config: LSPClientConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`
    this.timeout = config.timeout || 5000
    this.maxRetries = config.maxRetries || 3
    this.cacheEnabled = config.cacheEnabled ?? true
    this.cacheTTL = config.cacheTTL || 300000 // 5 minutes default
    this.cache = new Map()
    
    // Start cache cleanup interval
    if (this.cacheEnabled) {
      setInterval(() => this.cleanupCache(), 60000) // Cleanup every minute
    }
  }
  
  /**
   * Check if circuit breaker should allow request
   */
  private checkCircuitBreaker(): boolean {
    const now = Date.now()
    
    switch (this.circuitState) {
      case CircuitState.CLOSED:
        return true
        
      case CircuitState.OPEN:
        // Check if enough time has passed to try again
        if (now - this.lastFailureTime > this.circuitResetTimeout) {
          this.circuitState = CircuitState.HALF_OPEN
          return true
        }
        return false
        
      case CircuitState.HALF_OPEN:
        return true
    }
  }
  
  /**
   * Record successful request for circuit breaker
   */
  private recordSuccess(): void {
    this.failureCount = 0
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED
    }
  }
  
  /**
   * Record failed request for circuit breaker
   */
  private recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = CircuitState.OPEN
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }
  
  /**
   * Get cache key for request
   */
  private getCacheKey(endpoint: string, params?: any): string {
    return `${endpoint}:${JSON.stringify(params || {})}`
  }
  
  /**
   * Check cache for valid entry
   */
  private checkCache(key: string): any | null {
    if (!this.cacheEnabled) return null
    
    const entry = this.cache.get(key)
    if (!entry) return null
    
    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }
  
  /**
   * Store response in cache
   */
  private storeInCache(key: string, data: any, ttl?: number): void {
    if (!this.cacheEnabled) return
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.cacheTTL
    })
  }
  
  /**
   * Execute HTTP request with retry logic
   */
  private async executeRequest(
    method: string,
    endpoint: string,
    body?: any,
    retryCount: number = 0
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      this.recordSuccess()
      return data
      
    } catch (error: any) {
      this.recordFailure()
      
      // Retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.executeRequest(method, endpoint, body, retryCount + 1)
      }
      
      throw error
    }
  }
  
  /**
   * GET request with caching
   */
  async get(endpoint: string, params?: any): Promise<any> {
    if (!this.checkCircuitBreaker()) {
      throw new Error('Circuit breaker is open - LSP server is unavailable')
    }
    
    const cacheKey = this.getCacheKey(endpoint, params)
    const cached = this.checkCache(cacheKey)
    if (cached) return cached
    
    const queryString = params ? 
      '?' + new URLSearchParams(params).toString() : ''
    
    const data = await this.executeRequest('GET', endpoint + queryString)
    this.storeInCache(cacheKey, data)
    return data
  }
  
  /**
   * POST request (no caching)
   */
  async post(endpoint: string, body: any): Promise<any> {
    if (!this.checkCircuitBreaker()) {
      throw new Error('Circuit breaker is open - LSP server is unavailable')
    }
    
    return this.executeRequest('POST', endpoint, body)
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get('/health')
      return response.status === 'healthy'
    } catch {
      return false
    }
  }
  
  // Specific API methods for ontology operations
  
  async getConcept(identifier: string): Promise<any> {
    return this.get('/concepts', { identifier })
  }
  
  async getStats(): Promise<any> {
    return this.get('/stats')
  }
  
  async getPatterns(): Promise<any> {
    return this.get('/patterns')
  }
  
  async findSymbol(identifier: string, options?: {
    fuzzy?: boolean
    semantic?: boolean
  }): Promise<any> {
    return this.post('/find', {
      identifier,
      ...options
    })
  }
  
  async getSuggestions(identifier: string): Promise<any> {
    return this.post('/suggest', { identifier })
  }
  
  async analyzeWorkspace(path?: string): Promise<any> {
    return this.post('/analyze', { path })
  }
  
  async exportOntology(): Promise<any> {
    return this.get('/export')
  }
  
  async importOntology(data: any): Promise<any> {
    return this.post('/import', { data })
  }
}

import { getLSPClientConfig } from './config.js'

// Singleton instance for shared use
let sharedClient: LSPClient | null = null

export function getSharedLSPClient(config?: LSPClientConfig): LSPClient {
  if (!sharedClient) {
    sharedClient = new LSPClient(config || getLSPClientConfig())
  }
  return sharedClient
}