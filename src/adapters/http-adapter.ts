/**
 * HTTP Adapter - REST endpoints to core analyzer with OpenAPI compatibility
 * Target: <150 lines
 * 
 * This adapter handles HTTP-specific concerns only:
 * - REST endpoint routing
 * - Request/response JSON formatting
 * - HTTP status codes
 * - CORS handling
 * - OpenAPI documentation
 * 
 * All actual analysis work is delegated to the unified core analyzer.
 */

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import type { SearchStream } from '../layers/enhanced-search-tools-async.js';
import {
  buildFindDefinitionRequest,
  buildFindReferencesRequest,
  buildRenameRequest,
  buildCompletionRequest,
  definitionToApiResponse,
  referenceToApiResponse,
  handleAdapterError,
  validateRequired,
  normalizePosition,
  createPosition,
  normalizeUri,
  safeJsonParse,
  strictJsonParse
} from './utils.js';

export interface HTTPAdapterConfig {
  maxResults?: number;
  timeout?: number;
  enableCors?: boolean;
  enableOpenAPI?: boolean;
  apiVersion?: string;
}

export interface HTTPRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
}

export interface HTTPResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * HTTP REST API Adapter - converts HTTP requests to core analyzer calls
 */
export class HTTPAdapter {
  private coreAnalyzer: CodeAnalyzer;
  private config: HTTPAdapterConfig;
  private responseCache = new Map<string, { response: string; timestamp: number }>();
  private static readonly RESPONSE_CACHE_TTL = 30000; // 30 seconds
  private static readonly RESPONSE_CACHE_SIZE = 500; // Smaller cache for better performance

  constructor(coreAnalyzer: CodeAnalyzer, config: HTTPAdapterConfig = {}) {
    this.coreAnalyzer = coreAnalyzer;
    this.config = {
      maxResults: 100,
      timeout: 30000,
      enableCors: true,
      enableOpenAPI: true,
      apiVersion: 'v1',
      ...config
    };
  }

  /**
   * Handle HTTP request and route to appropriate handler
   */
  async handleRequest(request: HTTPRequest): Promise<HTTPResponse> {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method.toUpperCase();

      // Add CORS headers if enabled
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.enableCors) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      }

      // Handle preflight requests
      if (method === 'OPTIONS') {
        return { status: 200, headers, body: '' };
      }

      // Route requests
      const response = await this.routeRequest(path, method, request);
      return { ...response, headers: { ...headers, ...response.headers } };

    } catch (error) {
      return this.createErrorResponse(500, 'Internal server error', error);
    }
  }

  /**
   * Route requests to appropriate handlers
   */
  private async routeRequest(path: string, method: string, request: HTTPRequest): Promise<HTTPResponse> {
    // OpenAPI documentation endpoint
    if (path === '/openapi.json' && method === 'GET') {
      return this.handleOpenAPISpec();
    }

    // Health check endpoint
    if (path === '/health' && method === 'GET') {
      return this.handleHealthCheck();
    }

    // Analysis endpoints
    const apiPrefix = `/api/${this.config.apiVersion}`;
    
    if (path.startsWith(apiPrefix)) {
      const endpoint = path.slice(apiPrefix.length);
      console.log('[DEBUG] API path:', path, 'Endpoint:', endpoint, 'Method:', method);
      
      switch (endpoint) {
        case '/definition':
          return method === 'POST' ? this.handleFindDefinition(request) : this.methodNotAllowed();
        case '/references':
          return method === 'POST' ? this.handleFindReferences(request) : this.methodNotAllowed();
        case '/rename':
          return method === 'POST' ? this.handleRename(request) : this.methodNotAllowed();
        case '/completions':
          return method === 'POST' ? this.handleCompletions(request) : this.methodNotAllowed();
        case '/analyze':
          return method === 'POST' ? this.handleAnalyze(request) : this.methodNotAllowed();
        case '/stats':
          return method === 'GET' ? this.handleStats() : this.methodNotAllowed();
        case '/monitoring':
          return method === 'GET' ? this.handleMonitoring() : this.methodNotAllowed();
        // New streaming endpoints
        case '/stream/search':
          return method === 'POST' ? this.handleStreamSearch(request) : this.methodNotAllowed();
        case '/stream/definition':
          return method === 'POST' ? this.handleStreamDefinition(request) : this.methodNotAllowed();
        default:
          return this.notFound();
      }
    }

    return this.notFound();
  }

  /**
   * Handle POST /api/v1/definition
   */
  private async handleFindDefinition(request: HTTPRequest): Promise<HTTPResponse> {
    try {
      const body = strictJsonParse(request.body || '{}');
      validateRequired(body, ['identifier']);

      // Simple cache key for HTTP responses
      const cacheKey = `def:${body.identifier}:${body.file || ''}:${JSON.stringify(body.position || {})}`;

      // Check for cached response - fast path
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < HTTPAdapter.RESPONSE_CACHE_TTL) {
        return {
          status: 200,
          headers: { 'X-Cache': 'HIT' },
          body: cached.response
        };
      }

      const position = body.position ? 
        normalizePosition(body.position) : 
        createPosition(0, 0);

      const coreRequest = buildFindDefinitionRequest({
        uri: normalizeUri(body.file || body.uri || 'file://unknown'),
        position,
        identifier: body.identifier,
        maxResults: body.maxResults || this.config.maxResults,
        includeDeclaration: body.includeDeclaration ?? true
      });

      const result = await this.coreAnalyzer.findDefinition(coreRequest);
      
      // Build and serialize response
      const responseBody = JSON.stringify({
        success: true,
        data: result.data.map(def => definitionToApiResponse(def)),
        performance: result.performance,
        requestId: result.requestId,
        timestamp: result.timestamp,
        cacheHit: result.cacheHit
      });
      
      // Cache the complete response string
      this.setResponseCache(cacheKey, responseBody);
      
      return {
        status: 200,
        headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
        body: responseBody
      };
    } catch (error) {
      return this.createErrorResponse(400, 'Bad Request', error);
    }
  }

  /**
   * Handle POST /api/v1/references
   */
  private async handleFindReferences(request: HTTPRequest): Promise<HTTPResponse> {
    try {
      const body = strictJsonParse(request.body || '{}');
      validateRequired(body, ['identifier']);

      // Simple cache key for HTTP responses
      const cacheKey = `ref:${body.identifier}:${body.file || ''}:${body.position?.line || 0}:${body.position?.character || 0}`;

      // Check for cached response
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < HTTPAdapter.RESPONSE_CACHE_TTL) {
        return {
          status: 200,
          headers: { 'X-Cache': 'HIT' },
          body: cached.response
        };
      }

      const position = body.position ? 
        normalizePosition(body.position) : 
        createPosition(0, 0);

      const coreRequest = buildFindReferencesRequest({
        uri: normalizeUri(body.file || body.uri || 'file://workspace'),
        position,
        identifier: body.identifier,
        maxResults: body.maxResults || this.config.maxResults,
        includeDeclaration: body.includeDeclaration ?? false
      });

      const result = await this.coreAnalyzer.findReferences(coreRequest);
      
      // Build and serialize response
      const responseBody = JSON.stringify({
        success: true,
        data: result.data.map(ref => referenceToApiResponse(ref)),
        performance: result.performance,
        requestId: result.requestId,
        timestamp: result.timestamp,
        cacheHit: result.cacheHit
      });
      
      // Cache the complete response string
      this.setResponseCache(cacheKey, responseBody);
      
      return {
        status: 200,
        headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
        body: responseBody
      };
    } catch (error) {
      return this.createErrorResponse(400, 'Bad Request', error);
    }
  }

  /**
   * Handle POST /api/v1/rename
   */
  private async handleRename(request: HTTPRequest): Promise<HTTPResponse> {
    const body = safeJsonParse(request.body || '{}', {});
    validateRequired(body, ['identifier', 'newName']);

    const coreRequest = buildRenameRequest({
      uri: normalizeUri(body.file || body.uri || 'file://workspace'),
      position: createPosition(0, 0),
      identifier: body.identifier,
      newName: body.newName,
      dryRun: body.dryRun ?? false
    });

    const result = await this.coreAnalyzer.rename(coreRequest);
    
    const changes = Object.entries(result.data.changes || {});
    
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        success: true,
        data: {
          changes: changes.map(([uri, edits]) => ({ file: uri, edits })),
          summary: {
            filesAffected: changes.length,
            totalEdits: changes.reduce((acc, [, edits]) => acc + edits.length, 0)
          },
          performance: result.performance,
          requestId: result.requestId,
          dryRun: body.dryRun ?? false
        }
      })
    };
  }

  /**
   * Handle POST /api/v1/completions
   */
  private async handleCompletions(request: HTTPRequest): Promise<HTTPResponse> {
    try {
      const body = strictJsonParse(request.body || '{}');
      validateRequired(body, ['position']);

      // Create cache key from request essentials
      const cacheKey = this.createCacheKey('completions', {
        file: body.file || body.uri,
        position: body.position,
        triggerCharacter: body.triggerCharacter,
        maxResults: body.maxResults
      });

      // Check response cache first
      const cached = this.getFromResponseCache(cacheKey);
      if (cached) {
        return {
          status: 200,
          headers: { 'X-Cache': 'HIT' },
          body: cached
        };
      }

      const coreRequest = buildCompletionRequest({
        uri: normalizeUri(body.file || body.uri || 'file://unknown'),
        position: normalizePosition(body.position),
        triggerCharacter: body.triggerCharacter,
        maxResults: body.maxResults || this.config.maxResults
      });

      const result = await this.coreAnalyzer.getCompletions(coreRequest);
      
      // Build and serialize response
      const responseBody = JSON.stringify({
        success: true,
        data: result.data,
        performance: result.performance,
        requestId: result.requestId,
        timestamp: result.timestamp,
        cacheHit: result.cacheHit
      });
      
      // Cache the complete response string
      this.setResponseCache(cacheKey, responseBody);
      
      return {
        status: 200,
        headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
        body: responseBody
      };
    } catch (error) {
      return this.createErrorResponse(400, 'Bad Request', error);
    }
  }

  /**
   * Handle POST /api/v1/analyze (placeholder)
   */
  private async handleAnalyze(request: HTTPRequest): Promise<HTTPResponse> {
    return {
      status: 501,
      headers: {},
      body: JSON.stringify({
        success: false,
        error: 'Analysis endpoint not yet implemented',
        message: 'Use specific endpoints like /definition, /references, etc.'
      })
    };
  }

  /**
   * Handle GET /api/v1/stats
   */
  private async handleStats(): Promise<HTTPResponse> {
    const diagnostics = this.coreAnalyzer.getDiagnostics();
    
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        success: true,
        data: {
          adapter: 'http',
          config: this.config,
          coreAnalyzer: diagnostics,
          timestamp: Date.now()
        }
      })
    };
  }

  /**
   * Handle GET /api/v1/monitoring - Enhanced monitoring data for dashboard
   */
  private async handleMonitoring(): Promise<HTTPResponse> {
    try {
      const diagnostics = this.coreAnalyzer.getDiagnostics();
      const monitoring = diagnostics.monitoring || {};
      
      // Get detailed monitoring stats if available
      let detailedStats = {};
      if (this.coreAnalyzer.getDetailedStats) {
        detailedStats = await this.coreAnalyzer.getDetailedStats();
      }
      
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          success: true,
          data: {
            // System health
            systemHealth: {
              status: monitoring.healthy ? 'healthy' : 'degraded',
              uptime: monitoring.uptime || 0,
              timestamp: Date.now()
            },
            
            // Performance metrics
            performance: {
              totalRequests: monitoring.totalRequests || 0,
              averageLatency: monitoring.averageLatency || 0,
              p95Latency: monitoring.p95Latency || 0,
              p99Latency: monitoring.p99Latency || 0,
              errorRate: monitoring.errorRate || 0
            },
            
            // Cache metrics
            cache: {
              hitRate: monitoring.cacheHitRate || 0,
              hits: monitoring.cacheHits || 0,
              misses: monitoring.cacheMisses || 0,
              totalRequests: (monitoring.cacheHits || 0) + (monitoring.cacheMisses || 0)
            },
            
            // Layer performance breakdown
            layers: this.formatLayerBreakdown(monitoring.layerBreakdown || {}),
            
            // Recent errors
            recentErrors: monitoring.recentErrors || [],
            
            // Learning statistics
            learning: {
              patternsLearned: diagnostics.patternsCount || 0,
              conceptsTracked: diagnostics.conceptsCount || 0,
              learningAccuracy: diagnostics.learningAccuracy || 0,
              totalAnalyses: diagnostics.totalAnalyses || 0
            },
            
            // Additional stats from detailed monitoring
            ...detailedStats,
            
            timestamp: Date.now()
          }
        })
      };
    } catch (error) {
      return this.createErrorResponse(500, 'Failed to get monitoring data', error);
    }
  }

  /**
   * Format layer breakdown data for dashboard consumption
   */
  private formatLayerBreakdown(layerBreakdown: Record<string, any>): Record<string, any> {
    const layerNames = {
      layer1: 'Fast Search',
      layer2: 'AST Analysis',
      layer3: 'Semantic Graph',
      layer4: 'Pattern Mining', 
      layer5: 'Knowledge Spread'
    };
    
    const formatted: Record<string, any> = {};
    
    for (const [layerId, metrics] of Object.entries(layerBreakdown)) {
      formatted[layerId] = {
        name: layerNames[layerId as keyof typeof layerNames] || layerId,
        requestCount: metrics.requestCount || 0,
        averageLatency: metrics.averageLatency || 0,
        errorCount: metrics.errorCount || 0,
        errorRate: metrics.requestCount > 0 ? 
          (metrics.errorCount || 0) / metrics.requestCount : 0,
        healthy: (metrics.averageLatency || 0) < this.getLayerLatencyThreshold(layerId) &&
                 ((metrics.errorCount || 0) / Math.max(metrics.requestCount || 1, 1)) < 0.05
      };
    }
    
    return formatted;
  }

  /**
   * Get latency threshold for layer health check
   */
  private getLayerLatencyThreshold(layer: string): number {
    const thresholds = {
      layer1: 10,   // 5ms target * 2
      layer2: 100,  // 50ms target * 2
      layer3: 20,   // 10ms target * 2
      layer4: 20,   // 10ms target * 2
      layer5: 40    // 20ms target * 2
    };
    
    return thresholds[layer as keyof typeof thresholds] || 100;
  }

  /**
   * Handle GET /health
   */
  private async handleHealthCheck(): Promise<HTTPResponse> {
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        status: 'healthy',
        adapter: 'http',
        timestamp: new Date().toISOString()
      })
    };
  }

  /**
   * Handle GET /openapi.json
   */
  private handleOpenAPISpec(): Promise<HTTPResponse> {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Ontology LSP HTTP API',
        version: this.config.apiVersion || 'v1',
        description: 'REST API for ontology-enhanced language server functionality'
      },
      paths: {
        '/api/v1/definition': {
          post: {
            summary: 'Find symbol definition',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['identifier'],
                    properties: {
                      identifier: { type: 'string' },
                      file: { type: 'string' },
                      position: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          character: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        // Additional endpoints would be documented here
      }
    };

    return Promise.resolve({
      status: 200,
      headers: {},
      body: JSON.stringify(spec, null, 2)
    });
  }

  // Helper methods for common responses
  private methodNotAllowed(): HTTPResponse {
    return { status: 405, headers: {}, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  private notFound(): HTTPResponse {
    return { status: 404, headers: {}, body: JSON.stringify({ error: 'Not found' }) };
  }

  /**
   * Initialize the HTTP adapter
   */
  async initialize(): Promise<void> {
    // HTTP adapter doesn't need special initialization - just ensure core analyzer is ready
    // Core analyzer is passed in constructor and should already be initialized
  }

  /**
   * Dispose the HTTP adapter
   */
  async dispose(): Promise<void> {
    // HTTP adapter doesn't hold resources that need cleanup
  }

  /**
   * Handle POST /api/v1/stream/search - Streaming search results via SSE
   */
  private async handleStreamSearch(request: HTTPRequest): Promise<HTTPResponse> {
    try {
      const body = strictJsonParse(request.body || '{}');
      validateRequired(body, ['pattern']);

      // Create async search request
      const searchRequest = {
        identifier: body.pattern,
        uri: normalizeUri(body.file || body.uri || 'file://search'),
        position: createPosition(0, 0),
        maxResults: body.maxResults || 100
      };
      
      // Use the new async search method from unified analyzer
      const result = await this.coreAnalyzer.findDefinitionAsync(searchRequest);
      
      // Convert to SSE format (simplified for now)
      const sseData = this.formatAsSSE(result, 'search');
      
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        },
        body: sseData
      };
    } catch (error) {
      return this.createErrorResponse(400, 'Bad Request', error);
    }
  }

  /**
   * Handle POST /api/v1/stream/definition - Streaming definition search via SSE
   */
  private async handleStreamDefinition(request: HTTPRequest): Promise<HTTPResponse> {
    console.log('[DEBUG] handleStreamDefinition called with:', request.url);
    try {
      const body = strictJsonParse(request.body || '{}');
      console.log('[DEBUG] Body parsed:', body);
      validateRequired(body, ['identifier']);

      // Create definition search request
      const searchRequest = {
        identifier: body.identifier,
        uri: normalizeUri(body.file || body.uri || 'file://definition'),
        position: normalizePosition(body.position) || createPosition(0, 0),
        maxResults: body.maxResults || 50
      };
      
      // Use the new async definition search method
      const result = await this.coreAnalyzer.findDefinitionAsync(searchRequest);
      
      // Convert to SSE format (simplified for now)
      const sseData = this.formatAsSSE(result, 'definition');
      
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        },
        body: sseData
      };
    } catch (error) {
      return this.createErrorResponse(400, 'Bad Request', error);
    }
  }

  /**
   * Convert search result to SSE format (simplified version)
   */
  private formatAsSSE(result: any, eventType: string): string {
    const chunks: string[] = [];
    
    // Send start event
    chunks.push(`event: ${eventType}-start\n`);
    chunks.push(`data: {"type":"start","message":"Search started"}\n\n`);
    
    // Send results
    result.data.forEach((item: any, index: number) => {
      const data = {
        type: 'result',
        data: {
          uri: item.uri,
          range: item.range,
          kind: item.kind,
          name: item.name,
          confidence: item.confidence
        },
        count: index + 1
      };
      
      chunks.push(`event: ${eventType}-data\n`);
      chunks.push(`data: ${JSON.stringify(data)}\n\n`);
    });
    
    // Send completion event
    chunks.push(`event: ${eventType}-end\n`);
    chunks.push(`data: {"type":"end","message":"Search completed","totalResults":${result.data.length}}\n\n`);
    
    return chunks.join('');
  }

  /**
   * Create simple cache key for request parameters
   */
  private createCacheKey(operation: string, params: any): string {
    return `${operation}:${params.identifier || ''}:${params.file || ''}:${params.position?.line || 0}:${params.position?.character || 0}`;
  }

  /**
   * Cache response string for fast retrieval
   */
  private setResponseCache(key: string, response: string): void {
    // Maintain cache size limit
    if (this.responseCache.size >= HTTPAdapter.RESPONSE_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.responseCache.keys().next().value;
      if (firstKey) {
        this.responseCache.delete(firstKey);
      }
    }
    
    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }


  private createErrorResponse(status: number, message: string, cause?: any): HTTPResponse {
    const error = handleAdapterError(cause, 'http');
    return {
      status,
      headers: {},
      body: JSON.stringify({
        success: false,
        error: message,
        details: error,
        timestamp: new Date().toISOString()
      })
    };
  }
}