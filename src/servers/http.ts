/**
 * HTTP API Server - Thin wrapper around unified core
 *
 * This server only handles HTTP transport concerns:
 * - Request parsing
 * - Response formatting
 * - Server lifecycle
 *
 * All analysis work is delegated to the HTTP adapter and core analyzer.
 */

import { serve } from 'bun';
import { HTTPAdapter, type HTTPRequest } from '../adapters/http-adapter.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { getEnvironmentConfig, type ServerConfig } from '../core/config/server-config.js';
import { createCodeAnalyzer } from '../core/index';
import type { CodeAnalyzer } from '../core/unified-analyzer';
import type { ClaudeToolsLayer } from '../layers/claude-tools.js';
import type { SearchQuery } from '../types/core.js';

interface HTTPServerConfig {
    port?: number;
    host?: string;
    workspaceRoot?: string;
    enableCors?: boolean;
    enableOpenAPI?: boolean;
}

export class HTTPServer {
    private coreAnalyzer!: CodeAnalyzer;
    private httpAdapter!: HTTPAdapter;
    private config: HTTPServerConfig;
    private serverConfig: ServerConfig;
    private server: any = null;

    constructor(config: HTTPServerConfig = {}) {
        this.serverConfig = getEnvironmentConfig();
        this.config = {
            port: config.port ?? this.serverConfig.ports.httpAPI,
            host: config.host ?? this.serverConfig.host,
            workspaceRoot: config.workspaceRoot ?? process.cwd(),
            enableCors: config.enableCors ?? true,
            enableOpenAPI: config.enableOpenAPI ?? true,
            ...config,
        };
    }

    async initialize(): Promise<void> {
        console.log(`[HTTP Server] Initializing at ${this.config.host}:${this.config.port}`);
        console.log(`[HTTP Server] Workspace root: ${this.config.workspaceRoot}`);

        // Initialize core analyzer
        const coreConfig = createDefaultCoreConfig();

        this.coreAnalyzer = await createCodeAnalyzer({
            ...coreConfig,
            workspaceRoot: this.config.workspaceRoot!,
        });

        await this.coreAnalyzer.initialize();

        // Create HTTP adapter
        this.httpAdapter = new HTTPAdapter(this.coreAnalyzer, {
            enableCors: this.config.enableCors,
            enableOpenAPI: this.config.enableOpenAPI,
            maxResults: 100,
            timeout: 30000,
        });

        console.log(`[HTTP Server] Core analyzer and HTTP adapter initialized`);
    }

    async start(): Promise<void> {
        if (!this.coreAnalyzer || !this.httpAdapter) {
            await this.initialize();
        }

        this.server = serve({
            hostname: this.config.host,
            port: this.config.port,
            fetch: async (request) => {
                try {
                    const url = new URL(request.url);

                    // Let adapter handle streaming endpoints for now
                    // TODO: Implement proper server-level SSE streaming
                    // if (url.pathname.includes('/stream/') && request.method === 'POST') {
                    //   return await this.handleSSEStream(request, url.pathname);
                    // }

                    // Convert Bun request to our HTTPRequest format
                    const httpRequest: HTTPRequest = {
                        method: request.method,
                        url: request.url,
                        headers: Object.fromEntries(request.headers.entries()),
                        body: await this.getRequestBody(request),
                        query: this.extractQuery(request.url),
                    };

                    // Handle request through adapter
                    const response = await this.httpAdapter.handleRequest(httpRequest);

                    // Convert back to Response object
                    return new Response(response.body, {
                        status: response.status,
                        headers: response.headers,
                    });
                } catch (error) {
                    console.error('[HTTP Server] Request failed:', error);
                    return new Response(
                        JSON.stringify({
                            success: false,
                            error: 'Internal server error',
                            message: error instanceof Error ? error.message : String(error),
                        }),
                        {
                            status: 500,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    );
                }
            },
        });

        console.log(`[HTTP Server] Started at http://${this.config.host}:${this.config.port}`);
        console.log(`[HTTP Server] OpenAPI spec: http://${this.config.host}:${this.config.port}/openapi.json`);
        console.log(`[HTTP Server] Health check: http://${this.config.host}:${this.config.port}/health`);
    }

    async stop(): Promise<void> {
        if (this.server) {
            this.server.stop();
            this.server = null;
            console.log(`[HTTP Server] Stopped`);
        }

        if (this.coreAnalyzer) {
            await this.coreAnalyzer.dispose();
            console.log(`[HTTP Server] Core analyzer disposed`);
        }
    }

    /**
     * Get server status and diagnostics
     */
    getStatus(): Record<string, any> {
        return {
            running: this.server !== null,
            config: this.config,
            adapter: this.httpAdapter?.getDiagnostics() || null,
            timestamp: Date.now(),
        };
    }

    /**
     * Handle Server-Sent Events streaming for real-time search results
     */
    private async handleSSEStream(request: Request, pathname: string): Promise<Response> {
        const body = await request.text();
        let requestData: any;

        try {
            requestData = JSON.parse(body);
        } catch (error) {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Set up SSE headers
        const headers = new Headers({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        });

        // Create a readable stream for SSE
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();

                const sendSSEMessage = (data: any, eventType = 'data') => {
                    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(message));
                };

                try {
                    // Get the layer manager from the core analyzer to access the ClaudeToolsLayer
                    if (pathname.includes('/stream/search')) {
                        await this.handleStreamSearch(requestData, sendSSEMessage, controller);
                    } else if (pathname.includes('/stream/definition')) {
                        await this.handleStreamDefinition(requestData, sendSSEMessage, controller);
                    }
                } catch (error) {
                    sendSSEMessage({ error: 'Stream processing failed', details: String(error) }, 'error');
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, { headers });
    }

    /**
     * Handle streaming search requests
     */
    private async handleStreamSearch(
        requestData: any,
        sendMessage: (data: any, eventType?: string) => void,
        controller: ReadableStreamDefaultController
    ): Promise<void> {
        const { pattern, path = '.', maxResults = 100, timeout = 20000 } = requestData;

        if (!pattern) {
            sendMessage({ error: 'Pattern is required' }, 'error');
            return;
        }

        // Try to get the ClaudeToolsLayer for streaming
        const layerManager = (this.coreAnalyzer as any).layerManager;
        if (layerManager) {
            const claudeLayer = layerManager.getLayer('layer1') as ClaudeToolsLayer;

            if (claudeLayer && claudeLayer.streamSearch) {
                const searchQuery: SearchQuery = {
                    identifier: pattern,
                    searchPath: path,
                    caseSensitive: false,
                    fileTypes: ['typescript', 'javascript'],
                    includeTests: true,
                };

                try {
                    const searchStream = await claudeLayer.streamSearch(searchQuery);

                    let resultCount = 0;

                    searchStream.on('data', (result) => {
                        if (resultCount >= maxResults) {
                            searchStream.cancel();
                            return;
                        }

                        sendMessage({
                            type: 'match',
                            file: result.file,
                            line: result.line,
                            column: result.column,
                            text: result.text,
                            confidence: result.confidence,
                        });

                        resultCount++;
                    });

                    searchStream.on('progress', (progress) => {
                        sendMessage(
                            {
                                type: 'progress',
                                filesSearched: progress.filesSearched,
                                matchesFound: progress.matchesFound,
                                elapsedMs: progress.elapsedMs,
                            },
                            'progress'
                        );
                    });

                    searchStream.on('end', () => {
                        sendMessage({ type: 'complete', totalResults: resultCount }, 'complete');
                    });

                    searchStream.on('error', (error) => {
                        sendMessage({ error: 'Search failed', details: String(error) }, 'error');
                    });

                    // Set timeout
                    setTimeout(() => {
                        searchStream.cancel();
                        sendMessage({ error: 'Search timeout' }, 'error');
                    }, timeout);
                } catch (error) {
                    sendMessage({ error: 'Failed to start stream search', details: String(error) }, 'error');
                }
            } else {
                sendMessage({ error: 'Streaming search not available' }, 'error');
            }
        } else {
            sendMessage({ error: 'Layer manager not available' }, 'error');
        }
    }

    /**
     * Handle streaming definition search
     */
    private async handleStreamDefinition(
        requestData: any,
        sendMessage: (data: any, eventType?: string) => void,
        controller: ReadableStreamDefaultController
    ): Promise<void> {
        const { identifier, file, maxResults = 50, timeout = 15000 } = requestData;

        if (!identifier) {
            sendMessage({ error: 'Identifier is required' }, 'error');
            return;
        }

        // Use regular definition search for now - could be enhanced with streaming later
        try {
            const result = await (this.coreAnalyzer as any).findDefinitionAsync({
                uri: file || 'file://unknown',
                position: { line: 0, character: 0 },
                identifier,
                maxResults,
            });

            // Stream the results one by one to simulate streaming
            for (let i = 0; i < result.data.length; i++) {
                const definition = result.data[i];
                sendMessage({
                    type: 'definition',
                    uri: definition.uri,
                    range: definition.range,
                    kind: definition.kind,
                    name: definition.name,
                    confidence: definition.confidence,
                    layer: definition.layer,
                });

                // Small delay to simulate streaming
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            sendMessage({ type: 'complete', totalResults: result.data.length }, 'complete');
        } catch (error) {
            sendMessage({ error: 'Definition search failed', details: String(error) }, 'error');
        }
    }

    // ===== PRIVATE HELPERS =====

    private async getRequestBody(request: Request): Promise<string | undefined> {
        if (request.method === 'GET' || request.method === 'HEAD') {
            return undefined;
        }

        try {
            const contentType = request.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return await request.text();
            }
            return undefined;
        } catch (error) {
            console.warn('[HTTP Server] Failed to read request body:', error);
            return undefined;
        }
    }

    private extractQuery(url: string): Record<string, string> {
        try {
            const parsed = new URL(url);
            const query: Record<string, string> = {};

            for (const [key, value] of parsed.searchParams.entries()) {
                query[key] = value;
            }

            return query;
        } catch (error) {
            return {};
        }
    }
}

// Export for use as singleton
export let httpServer: HTTPServer | null = null;

/**
 * Create and start HTTP server
 */
export async function createHTTPServer(config?: HTTPServerConfig): Promise<HTTPServer> {
    if (httpServer) {
        await httpServer.stop();
    }

    httpServer = new HTTPServer(config);
    return httpServer;
}

// Start server if run directly
if (import.meta.main) {
    const server = new HTTPServer();

    // Handle shutdown
    process.on('SIGINT', async () => {
        console.log('\n[HTTP Server] Shutting down...');
        await server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
    });

    server.start().catch((error) => {
        console.error('[HTTP Server] Failed to start:', error);
        process.exit(1);
    });
}
