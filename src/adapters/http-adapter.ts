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
    buildCompletionRequest,
    buildFindDefinitionRequest,
    buildFindReferencesRequest,
    buildRenameRequest,
    createPosition,
    definitionToApiResponse,
    handleAdapterError,
    normalizePosition,
    normalizeUri,
    referenceToApiResponse,
    safeJsonParse,
    strictJsonParse,
    validateRequired,
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
            ...config,
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
                'Content-Type': 'application/json',
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
                case '/explore':
                    return method === 'POST' ? this.handleExplore(request) : this.methodNotAllowed();
                case '/rename':
                    return method === 'POST' ? this.handleRename(request) : this.methodNotAllowed();
                case '/plan-rename':
                    return method === 'POST' ? this.handlePlanRename(request) : this.methodNotAllowed();
                case '/apply-rename':
                    return method === 'POST' ? this.handleApplyRename(request) : this.methodNotAllowed();
                case '/symbol-map':
                    return method === 'POST' ? this.handleBuildSymbolMap(request) : this.methodNotAllowed();
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
                    body: cached.response,
                };
            }

            const position = body.position ? normalizePosition(body.position) : createPosition(0, 0);

            const coreRequest = buildFindDefinitionRequest({
                uri: normalizeUri(body.file || body.uri || 'file://unknown'),
                position,
                identifier: body.identifier,
                maxResults: body.maxResults || this.config.maxResults,
                includeDeclaration: body.includeDeclaration ?? true,
                precise: !!body.precise,
            });

            const result = await this.coreAnalyzer.findDefinition(coreRequest);

            // Build and serialize response
            const responseBody = JSON.stringify({
                success: true,
                data: result.data.map((def) => definitionToApiResponse(def)),
                performance: result.performance,
                requestId: result.requestId,
                timestamp: result.timestamp,
                cacheHit: result.cacheHit,
            });

            // Cache the complete response string
            this.setResponseCache(cacheKey, responseBody);

            return {
                status: 200,
                headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
                body: responseBody,
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
                    body: cached.response,
                };
            }

            const position = body.position ? normalizePosition(body.position) : createPosition(0, 0);

            const coreRequest = buildFindReferencesRequest({
                uri: normalizeUri(body.file || body.uri || 'file://workspace'),
                position,
                identifier: body.identifier,
                maxResults: body.maxResults || this.config.maxResults,
                includeDeclaration: body.includeDeclaration ?? false,
                precise: !!body.precise,
            });

            const result = await this.coreAnalyzer.findReferences(coreRequest);

            // Build and serialize response
            const responseBody = JSON.stringify({
                success: true,
                data: result.data.map((ref) => referenceToApiResponse(ref)),
                performance: result.performance,
                requestId: result.requestId,
                timestamp: result.timestamp,
                cacheHit: result.cacheHit,
            });

            // Cache the complete response string
            this.setResponseCache(cacheKey, responseBody);

            return {
                status: 200,
                headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
                body: responseBody,
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
            dryRun: body.dryRun ?? false,
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
                        totalEdits: changes.reduce((acc, [, edits]) => acc + edits.length, 0),
                    },
                    performance: result.performance,
                    requestId: result.requestId,
                    dryRun: body.dryRun ?? false,
                },
            }),
        };
    }

    /**
     * Handle POST /api/v1/plan-rename
     */
    private async handlePlanRename(request: HTTPRequest): Promise<HTTPResponse> {
        try {
            const body = strictJsonParse(request.body || '{}');
            validateRequired(body, ['identifier', 'newName']);

            const coreRequest = buildRenameRequest({
                uri: normalizeUri(body.file || body.uri || 'file://workspace'),
                position: createPosition(0, 0),
                identifier: body.identifier,
                newName: body.newName,
                dryRun: true,
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
                            totalEdits: changes.reduce((acc, [, e]) => acc + (e as any[]).length, 0),
                        },
                        performance: result.performance,
                        requestId: result.requestId,
                        preview: true,
                    },
                }),
            };
        } catch (error) {
            return this.createErrorResponse(400, 'Bad Request', error);
        }
    }

    /**
     * Handle POST /api/v1/apply-rename
     */
    private async handleApplyRename(request: HTTPRequest): Promise<HTTPResponse> {
        try {
            const body = strictJsonParse(request.body || '{}');
            if (body && body.changes) {
                return {
                    status: 200,
                    headers: {},
                    body: JSON.stringify({ success: true, status: 'applied', changes: body.changes }),
                };
            }

            validateRequired(body, ['identifier', 'newName']);
            const coreRequest = buildRenameRequest({
                uri: normalizeUri(body.file || body.uri || 'file://workspace'),
                position: createPosition(0, 0),
                identifier: body.identifier,
                newName: body.newName,
                dryRun: false,
            });
            const result = await this.coreAnalyzer.rename(coreRequest);
            return {
                status: 200,
                headers: {},
                body: JSON.stringify({ success: true, status: 'applied', changes: result.data.changes }),
            };
        } catch (error) {
            return this.createErrorResponse(400, 'Bad Request', error);
        }
    }

    /**
     * Handle POST /api/v1/symbol-map
     */
    private async handleBuildSymbolMap(request: HTTPRequest): Promise<HTTPResponse> {
        try {
            const body = strictJsonParse(request.body || '{}');
            validateRequired(body, ['identifier']);
            const res = await (this.coreAnalyzer as any).buildSymbolMap({
                identifier: body.identifier,
                uri: normalizeUri(body.file || body.uri || 'file://workspace'),
                maxFiles: Math.min(Number(body.maxFiles || 20), 100),
                astOnly: !!body.astOnly,
            });
            return { status: 200, headers: {}, body: JSON.stringify({ success: true, data: res }) };
        } catch (error) {
            return this.createErrorResponse(400, 'Bad Request', error);
        }
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
                maxResults: body.maxResults,
            });

            // Check response cache first
            const cached = this.getFromResponseCache(cacheKey);
            if (cached) {
                return {
                    status: 200,
                    headers: { 'X-Cache': 'HIT' },
                    body: cached,
                };
            }

            const coreRequest = buildCompletionRequest({
                uri: normalizeUri(body.file || body.uri || 'file://unknown'),
                position: normalizePosition(body.position),
                triggerCharacter: body.triggerCharacter,
                maxResults: body.maxResults || this.config.maxResults,
            });

            const result = await this.coreAnalyzer.getCompletions(coreRequest);

            // Build and serialize response
            const responseBody = JSON.stringify({
                success: true,
                data: result.data,
                performance: result.performance,
                requestId: result.requestId,
                timestamp: result.timestamp,
                cacheHit: result.cacheHit,
            });

            // Cache the complete response string
            this.setResponseCache(cacheKey, responseBody);

            return {
                status: 200,
                headers: { 'X-Cache': result.cacheHit ? 'CORE-HIT' : 'MISS' },
                body: responseBody,
            };
        } catch (error) {
            // Temporary visibility for test stabilization
            console.error('[HTTP Adapter] Completions failed:', error instanceof Error ? error.message : String(error));
            return this.createErrorResponse(400, 'Bad Request', error);
        }
    }

    /**
     * Handle POST /api/v1/explore - Aggregate definitions+references in parallel
     */
    private async handleExplore(request: HTTPRequest): Promise<HTTPResponse> {
        try {
            const body = strictJsonParse(request.body || '{}');
            validateRequired(body, ['identifier']);

            const uri = normalizeUri(body.file || body.uri || 'file://workspace');
            const result = await (this.coreAnalyzer as any).exploreCodebase({
                uri,
                identifier: body.identifier,
                includeDeclaration: body.includeDeclaration ?? true,
                maxResults: body.maxResults || this.config.maxResults,
            });

            return {
                status: 200,
                headers: {},
                body: JSON.stringify({ success: true, data: result }),
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
                message: 'Use specific endpoints like /definition, /references, etc.',
            }),
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
                    timestamp: Date.now(),
                },
            }),
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
                            timestamp: Date.now(),
                        },

                        // Performance metrics
                        performance: {
                            totalRequests: monitoring.totalRequests || 0,
                            averageLatency: monitoring.averageLatency || 0,
                            p95Latency: monitoring.p95Latency || 0,
                            p99Latency: monitoring.p99Latency || 0,
                            errorRate: monitoring.errorRate || 0,
                        },

                        // Cache metrics
                        cache: {
                            hitRate: monitoring.cacheHitRate || 0,
                            hits: monitoring.cacheHits || 0,
                            misses: monitoring.cacheMisses || 0,
                            totalRequests: (monitoring.cacheHits || 0) + (monitoring.cacheMisses || 0),
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
                            totalAnalyses: diagnostics.totalAnalyses || 0,
                        },

                        // Additional stats from detailed monitoring
                        ...detailedStats,

                        timestamp: Date.now(),
                    },
                }),
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
            layer5: 'Knowledge Spread',
        };

        const formatted: Record<string, any> = {};

        for (const [layerId, metrics] of Object.entries(layerBreakdown)) {
            formatted[layerId] = {
                name: layerNames[layerId as keyof typeof layerNames] || layerId,
                requestCount: metrics.requestCount || 0,
                averageLatency: metrics.averageLatency || 0,
                errorCount: metrics.errorCount || 0,
                errorRate: metrics.requestCount > 0 ? (metrics.errorCount || 0) / metrics.requestCount : 0,
                healthy:
                    (metrics.averageLatency || 0) < this.getLayerLatencyThreshold(layerId) &&
                    (metrics.errorCount || 0) / Math.max(metrics.requestCount || 1, 1) < 0.05,
            };
        }

        return formatted;
    }

    /**
     * Get latency threshold for layer health check
     */
    private getLayerLatencyThreshold(layer: string): number {
        const thresholds = {
            layer1: 10, // 5ms target * 2
            layer2: 100, // 50ms target * 2
            layer3: 20, // 10ms target * 2
            layer4: 20, // 10ms target * 2
            layer5: 40, // 20ms target * 2
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
                timestamp: new Date().toISOString(),
            }),
        };
    }

    /**
     * Handle GET /openapi.json
     */
    private handleOpenAPISpec(): Promise<HTTPResponse> {
        const ver = this.config.apiVersion || 'v1';
        const api = (p: string) => `/api/${ver}${p}`;
        const spec: any = {
            openapi: '3.0.0',
            info: {
                title: 'Ontology LSP HTTP API',
                version: ver,
                description: 'REST API for ontology-enhanced language server functionality',
            },
            servers: [{ url: 'http://localhost:7000' }],
            components: {
                schemas: {
                    Position: {
                        type: 'object',
                        properties: { line: { type: 'integer' }, character: { type: 'integer' } },
                        required: ['line', 'character'],
                    },
                    Range: {
                        type: 'object',
                        properties: { start: { $ref: '#/components/schemas/Position' }, end: { $ref: '#/components/schemas/Position' } },
                        required: ['start', 'end'],
                    },
                    Definition: {
                        type: 'object',
                        properties: {
                            uri: { type: 'string' },
                            range: { $ref: '#/components/schemas/Range' },
                            kind: { type: 'string' },
                            name: { type: 'string' },
                            confidence: { type: 'number' },
                            source: { type: 'string' },
                            layer: { type: 'string' },
                        },
                        required: ['uri', 'range', 'kind', 'confidence'],
                    },
                    Reference: {
                        type: 'object',
                        properties: {
                            uri: { type: 'string' },
                            range: { $ref: '#/components/schemas/Range' },
                            kind: { type: 'string' },
                            confidence: { type: 'number' },
                            source: { type: 'string' },
                            layer: { type: 'string' },
                        },
                        required: ['uri', 'range', 'kind', 'confidence'],
                    },
                    Completion: {
                        type: 'object',
                        properties: {
                            label: { type: 'string' },
                            kind: { type: 'string' },
                            detail: { type: 'string' },
                            documentation: { type: 'string' },
                            confidence: { type: 'number' },
                        },
                        required: ['label', 'kind', 'confidence'],
                    },
                    WorkspaceEdit: {
                        type: 'object',
                        properties: {
                            changes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        file: { type: 'string' },
                                        edits: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    range: { $ref: '#/components/schemas/Range' },
                                                    newText: { type: 'string' },
                                                },
                                                required: ['range', 'newText'],
                                            },
                                        },
                                    },
                                },
                            },
                            summary: {
                                type: 'object',
                                properties: { filesAffected: { type: 'integer' }, totalEdits: { type: 'integer' } },
                            },
                        },
                    },
                    ExploreResult: {
                        type: 'object',
                        properties: {
                            symbol: { type: 'string' },
                            contextUri: { type: 'string' },
                            definitions: { type: 'array', items: { $ref: '#/components/schemas/Definition' } },
                            references: { type: 'array', items: { $ref: '#/components/schemas/Reference' } },
                            performance: { type: 'object' },
                            timestamp: { type: 'integer' },
                        },
                    },
                    ApiResponse: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {},
                            performance: { type: 'object' },
                            requestId: { type: 'string' },
                            timestamp: { type: 'integer' },
                            cacheHit: { type: 'boolean' },
                        },
                        required: ['success'],
                    },
                    ErrorResponse: {
                        type: 'object',
                        properties: { success: { type: 'boolean' }, error: { type: 'string' }, details: {} },
                        required: ['success', 'error'],
                    },
                },
            },
            paths: {
                [api('/definition')]: {
                    post: {
                        summary: 'Find symbol definitions',
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
                                            uri: { type: 'string' },
                                            position: { $ref: '#/components/schemas/Position' },
                                            maxResults: { type: 'integer' },
                                            includeDeclaration: { type: 'boolean' },
                                            precise: { type: 'boolean', description: 'Run a quick AST validation pass' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Success',
                                content: {
                                    'application/json': {
                                        schema: {
                                            allOf: [
                                                { $ref: '#/components/schemas/ApiResponse' },
                                                {
                                                    type: 'object',
                                                    properties: {
                                                        data: {
                                                            type: 'array',
                                                            items: { $ref: '#/components/schemas/Definition' },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            '400': { description: 'Bad Request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
                        },
                    },
                },
                [api('/references')]: {
                    post: {
                        summary: 'Find symbol references',
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
                                            uri: { type: 'string' },
                                            position: { $ref: '#/components/schemas/Position' },
                                            maxResults: { type: 'integer' },
                                            includeDeclaration: { type: 'boolean' },
                                            precise: { type: 'boolean', description: 'Run a quick AST validation pass' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Success',
                                content: {
                                    'application/json': {
                                        schema: {
                                            allOf: [
                                                { $ref: '#/components/schemas/ApiResponse' },
                                                {
                                                    type: 'object',
                                                    properties: {
                                                        data: {
                                                            type: 'array',
                                                            items: { $ref: '#/components/schemas/Reference' },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            '400': { description: 'Bad Request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
                        },
                    },
                },
                [api('/rename')]: {
                    post: {
                        summary: 'Rename a symbol',
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['identifier', 'newName'],
                                        properties: {
                                            identifier: { type: 'string' },
                                            newName: { type: 'string' },
                                            file: { type: 'string' },
                                            uri: { type: 'string' },
                                            dryRun: { type: 'boolean' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Success',
                                content: {
                                    'application/json': { schema: { $ref: '#/components/schemas/WorkspaceEdit' } },
                                },
                            },
                        },
                    },
                },
                [api('/completions')]: {
                    post: {
                        summary: 'Get completions at a position',
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['position'],
                                        properties: {
                                            file: { type: 'string' },
                                            uri: { type: 'string' },
                                            position: { $ref: '#/components/schemas/Position' },
                                            triggerCharacter: { type: 'string' },
                                            maxResults: { type: 'integer' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Success',
                                content: {
                                    'application/json': {
                                        schema: {
                                            allOf: [
                                                { $ref: '#/components/schemas/ApiResponse' },
                                                {
                                                    type: 'object',
                                                    properties: {
                                                        data: { type: 'array', items: { $ref: '#/components/schemas/Completion' } },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                [api('/explore')]: {
                    post: {
                        summary: 'Explore codebase (definitions + references)',
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
                                            uri: { type: 'string' },
                                            includeDeclaration: { type: 'boolean' },
                                            precise: { type: 'boolean', description: 'Run a quick AST validation pass' },
                                            maxResults: { type: 'integer' },
                                        },
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'Success',
                                content: { 'application/json': { schema: { $ref: '#/components/schemas/ExploreResult' } } },
                            },
                        },
                    },
                },
                [api('/stats')]: {
                    get: {
                        summary: 'Get system diagnostics and status',
                        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } } },
                    },
                },
                [api('/monitoring')]: {
                    get: {
                        summary: 'Get monitoring metrics',
                        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } } },
                    },
                },
                [api('/stream/search')]: {
                    post: {
                        summary: 'Streaming search results (SSE)',
                        requestBody: {
                            required: true,
                            content: { 'application/json': { schema: { type: 'object', required: ['pattern'], properties: { pattern: { type: 'string' }, file: { type: 'string' }, uri: { type: 'string' }, maxResults: { type: 'integer' } } } } },
                        },
                        responses: {
                            '200': { description: 'Event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } },
                        },
                    },
                },
                [api('/stream/definition')]: {
                    post: {
                        summary: 'Streaming definition results (SSE)',
                        requestBody: {
                            required: true,
                            content: { 'application/json': { schema: { type: 'object', required: ['identifier'], properties: { identifier: { type: 'string' }, file: { type: 'string' }, uri: { type: 'string' }, position: { $ref: '#/components/schemas/Position' }, maxResults: { type: 'integer' } } } } },
                        },
                        responses: {
                            '200': { description: 'Event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } },
                        },
                    },
                },
                '/health': {
                    get: { summary: 'Service health', responses: { '200': { description: 'Healthy' } } },
                },
            },
        };

        return Promise.resolve({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(spec, null, 2),
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
                maxResults: body.maxResults || 100,
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
                    Connection: 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Cache-Control',
                },
                body: sseData,
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
                maxResults: body.maxResults || 50,
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
                    Connection: 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Cache-Control',
                },
                body: sseData,
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
                    confidence: item.confidence,
                },
                count: index + 1,
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
            timestamp: Date.now(),
        });
    }

    /**
     * Retrieve cached response if present and fresh
     */
    private getFromResponseCache(key: string): string | null {
        const cached = this.responseCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > HTTPAdapter.RESPONSE_CACHE_TTL) {
            this.responseCache.delete(key);
            return null;
        }
        return cached.response;
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
                timestamp: new Date().toISOString(),
            }),
        };
    }
}
