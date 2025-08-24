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
import { CodeAnalyzer } from '../core/unified-analyzer';
import { createCodeAnalyzer } from '../core/index';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { getEnvironmentConfig, type ServerConfig } from '../core/config/server-config.js';

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
      ...config
    };
  }

  async initialize(): Promise<void> {
    console.log(`[HTTP Server] Initializing at ${this.config.host}:${this.config.port}`);
    console.log(`[HTTP Server] Workspace root: ${this.config.workspaceRoot}`);

    // Initialize core analyzer
    const coreConfig = createDefaultCoreConfig();
    
    this.coreAnalyzer = await createCodeAnalyzer({
      ...coreConfig,
      workspaceRoot: this.config.workspaceRoot!
    });
    
    await this.coreAnalyzer.initialize();

    // Create HTTP adapter
    this.httpAdapter = new HTTPAdapter(this.coreAnalyzer, {
      enableCors: this.config.enableCors,
      enableOpenAPI: this.config.enableOpenAPI,
      maxResults: 100,
      timeout: 30000
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
          // Convert Bun request to our HTTPRequest format
          const httpRequest: HTTPRequest = {
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries()),
            body: await this.getRequestBody(request),
            query: this.extractQuery(request.url)
          };

          // Handle request through adapter
          const response = await this.httpAdapter.handleRequest(httpRequest);

          // Convert back to Response object
          return new Response(response.body, {
            status: response.status,
            headers: response.headers
          });

        } catch (error) {
          console.error('[HTTP Server] Request failed:', error);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Internal server error',
              message: error instanceof Error ? error.message : String(error)
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }
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
      timestamp: Date.now()
    };
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