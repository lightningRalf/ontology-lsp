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
  safeJsonParse
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
    const body = safeJsonParse(request.body || '{}', {});
    validateRequired(body, ['identifier']);

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
    
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        success: true,
        data: {
          definitions: result.data.map(def => definitionToApiResponse(def)),
          count: result.data.length,
          performance: result.performance,
          requestId: result.requestId,
          timestamp: result.timestamp,
          cacheHit: result.cacheHit
        }
      })
    };
  }

  /**
   * Handle POST /api/v1/references
   */
  private async handleFindReferences(request: HTTPRequest): Promise<HTTPResponse> {
    const body = safeJsonParse(request.body || '{}', {});
    validateRequired(body, ['identifier']);

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
    
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        success: true,
        data: {
          references: result.data.map(ref => referenceToApiResponse(ref)),
          count: result.data.length,
          performance: result.performance,
          requestId: result.requestId,
          timestamp: result.timestamp,
          cacheHit: result.cacheHit
        }
      })
    };
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
    const body = safeJsonParse(request.body || '{}', {});
    validateRequired(body, ['file', 'position']);

    const coreRequest = buildCompletionRequest({
      uri: normalizeUri(body.file),
      position: normalizePosition(body.position),
      triggerCharacter: body.triggerCharacter,
      maxResults: body.maxResults || this.config.maxResults
    });

    const result = await this.coreAnalyzer.getCompletions(coreRequest);
    
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({
        success: true,
        data: {
          completions: result.data,
          count: result.data.length,
          performance: result.performance,
          requestId: result.requestId
        }
      })
    };
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