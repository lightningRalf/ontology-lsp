/**
 * Fast MCP Server - Optimized for quick startup
 *
 * This server delays heavy initialization until first tool call
 * to prevent timeout issues with MCP clients like Claude.
 */

// CRITICAL: Set silent mode BEFORE any imports to prevent stdio pollution
process.env.SILENT_MODE = 'true';
process.env.STDIO_MODE = 'true';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
// IMPORTANT: Avoid importing heavy core modules at top-level.
// Use type-only import to prevent runtime side effects.
import type { CodeAnalyzer } from '../core/unified-analyzer';

export class FastMCPServer {
    private server: Server;
    private coreAnalyzer?: CodeAnalyzer;
    private mcpAdapter?: any;
    private initPromise?: Promise<void>;
    private initialized = false;

    constructor() {
        this.server = new Server(
            {
                name: 'ontology-lsp',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        this.setupStdioCleanup();
    }

    private setupHandlers(): void {
        // List available tools - return immediately without initialization
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            // Return tools without initializing the core
            return {
                tools: [
                    {
                        name: 'find_definition',
                        description: 'Find symbol definition with fuzzy matching and semantic understanding',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                symbol: {
                                    type: 'string',
                                    description: 'Symbol name to find (supports fuzzy matching)',
                                },
                                file: {
                                    type: 'string',
                                    description: 'Current file context',
                                },
                                position: {
                                    type: 'object',
                                    properties: {
                                        line: { type: 'number' },
                                        character: { type: 'number' },
                                    },
                                },
                            },
                            required: ['symbol'],
                        },
                    },
                    {
                        name: 'find_references',
                        description: 'Find all references to a symbol across the codebase',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                symbol: {
                                    type: 'string',
                                    description: 'Symbol to find references for',
                                },
                                includeDeclaration: {
                                    type: 'boolean',
                                    default: false,
                                    description: 'Include the declaration in results',
                                },
                                scope: {
                                    type: 'string',
                                    enum: ['workspace', 'file', 'function'],
                                    default: 'workspace',
                                    description: 'Search scope',
                                },
                            },
                            required: ['symbol'],
                        },
                    },
                    {
                        name: 'rename_symbol',
                        description: 'Rename symbol with intelligent propagation across related concepts',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                oldName: {
                                    type: 'string',
                                    description: 'Current symbol name',
                                },
                                newName: {
                                    type: 'string',
                                    description: 'New symbol name',
                                },
                                preview: {
                                    type: 'boolean',
                                    default: true,
                                    description: 'Preview changes without applying',
                                },
                                scope: {
                                    type: 'string',
                                    enum: ['exact', 'related', 'similar'],
                                    default: 'exact',
                                    description: 'Propagation scope',
                                },
                            },
                            required: ['oldName', 'newName'],
                        },
                    },
                    {
                        name: 'generate_tests',
                        description: 'Generate tests based on code understanding and patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                target: {
                                    type: 'string',
                                    description: 'File or function to generate tests for',
                                },
                                framework: {
                                    type: 'string',
                                    enum: ['bun', 'jest', 'vitest', 'mocha', 'auto'],
                                    default: 'auto',
                                    description: 'Test framework to use',
                                },
                                coverage: {
                                    type: 'string',
                                    enum: ['basic', 'comprehensive', 'edge-cases'],
                                    default: 'comprehensive',
                                    description: 'Test coverage level',
                                },
                            },
                            required: ['target'],
                        },
                    },
                ],
            };
        });

        // Handle tool calls - initialize on demand
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                // Ensure initialization before handling tool call with timeout
                await Promise.race([
                    this.ensureInitialized(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization timeout')), 10000)),
                ]);

                if (!this.mcpAdapter) {
                    throw new McpError(ErrorCode.InternalError, 'Server initialization failed');
                }

                // Execute tool call with timeout
                const result = await Promise.race([
                    this.mcpAdapter.handleToolCall(name, args || {}),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Tool call timeout')), 30000)),
                ]);

                // Force stdout flush after each response
                if (process.stdout && typeof process.stdout.flush === 'function') {
                    process.stdout.flush();
                }

                return result;
            } catch (error) {
                // Send error to stderr in stdio mode to avoid stdout pollution
                if (process.env.STDIO_MODE) {
                    process.stderr.write(
                        `Tool call failed: ${name} - ${error instanceof Error ? error.message : String(error)}\n`
                    );
                } else {
                    console.error(`Tool call failed: ${name}`, error);
                }

                throw new McpError(
                    ErrorCode.InternalError,
                    `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        });
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (!this.initPromise) {
            this.initPromise = this.initializeCore();
        }

        await this.initPromise;
    }

    private async initializeCore(): Promise<void> {
        try {
            // Lazily import heavy modules to avoid startup side effects
            const [coreIndex, adapterUtils, mcpAdapterMod] = await Promise.all([
                import('../core/index'),
                import('../adapters/utils'),
                import('../adapters/mcp-adapter'),
            ]);

            const { createCodeAnalyzer } = coreIndex as any;
            const { createDefaultCoreConfig } = adapterUtils as any;
            const { MCPAdapter } = mcpAdapterMod as any;

            // Initialize core analyzer with optimized config for MCP server
            const config = createDefaultCoreConfig();
            const workspaceRoot = process.env.ONTOLOGY_WORKSPACE || process.env.WORKSPACE_ROOT || process.cwd();

            // Disable slow startup operations and set aggressive timeouts
            if (config.optimization) {
                config.optimization = {
                    ...config.optimization,
                    cacheWarming: false,
                    preloadParsers: false,
                    parallelProcessing: false, // Reduce resource usage
                    maxConcurrentRequests: 2, // Limit concurrent operations
                };
            }

            // Set shorter timeouts to prevent layer timeout issues (keep existing layer config)
            if (config.layers) {
                config.layers.layer1 = { ...config.layers.layer1, timeout: 1000 };
                config.layers.layer2 = {
                    ...config.layers.layer2,
                    timeout: 1500,
                    // Ensure required properties are present
                    enabled: config.layers.layer2?.enabled ?? true,
                    languages: config.layers.layer2?.languages ?? ['typescript', 'javascript', 'python'],
                    maxFileSize: config.layers.layer2?.maxFileSize ?? 1024 * 1024, // 1MB default
                    parseTimeout: config.layers.layer2?.parseTimeout ?? 50,
                };
                config.layers.layer3 = { ...config.layers.layer3, timeout: 2000 };
                config.layers.layer4 = { ...config.layers.layer4, timeout: 2500 };
                config.layers.layer5 = { ...config.layers.layer5, timeout: 3000 };
            }

            this.coreAnalyzer = await createCodeAnalyzer({
                ...config,
                workspaceRoot,
            });

            await this.coreAnalyzer.initialize();

            // Create MCP adapter
            this.mcpAdapter = new MCPAdapter(this.coreAnalyzer);

            this.initialized = true;
            // Only log in debug mode, never in stdio mode
            if (process.env.DEBUG && !process.env.STDIO_MODE) {
                console.error('Ontology MCP Server core initialized');
            }
        } catch (error) {
            // Always send initialization errors to stderr in stdio mode
            if (process.env.STDIO_MODE) {
                process.stderr.write(
                    `Failed to initialize core: ${error instanceof Error ? error.message : String(error)}\n`
                );
            } else {
                console.error('Failed to initialize core:', error);
            }

            // Don't throw during initialization - mark as not initialized and handle gracefully
            this.initialized = false;
            throw error;
        }
    }

    private setupStdioCleanup(): void {
        // Redirect console.log to stderr in stdio mode to prevent stdout pollution
        if (process.env.STDIO_MODE) {
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalInfo = console.info;

            console.log = (...args: any[]) => {
                if (process.env.DEBUG) {
                    process.stderr.write(`[LOG] ${args.join(' ')}\n`);
                }
            };

            console.warn = (...args: any[]) => {
                if (process.env.DEBUG) {
                    process.stderr.write(`[WARN] ${args.join(' ')}\n`);
                }
            };

            console.info = (...args: any[]) => {
                if (process.env.DEBUG) {
                    process.stderr.write(`[INFO] ${args.join(' ')}\n`);
                }
            };
        }
    }

    async run(): Promise<void> {
        try {
            // Set up transport without initializing core
            const transport = new StdioServerTransport();

            // Connect and listen immediately
            await this.server.connect(transport);

            // Force stdout flush to ensure proper MCP protocol communication
            if (process.stdout && typeof process.stdout.flush === 'function') {
                process.stdout.flush();
            }

            // Only log in debug mode, never in stdio mode to prevent protocol pollution
            if (process.env.DEBUG && !process.env.STDIO_MODE) {
                console.error('Ontology Fast MCP Server running on stdio');
            }
        } catch (error) {
            // Ensure errors go to stderr in stdio mode
            process.stderr.write(
                `Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`
            );
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        if (this.coreAnalyzer) {
            await this.coreAnalyzer.dispose();
        }
        // Only log in debug mode, never in stdio mode
        if (process.env.DEBUG && !process.env.STDIO_MODE) {
            console.error('Ontology MCP Server shut down');
        }
    }
}

// Create and run server
const server = new FastMCPServer();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
    try {
        await server.shutdown();
    } catch (error) {
        if (process.env.STDIO_MODE) {
            process.stderr.write(`Shutdown error: ${error instanceof Error ? error.message : String(error)}\n`);
        } else {
            console.error('Shutdown error:', error);
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    try {
        await server.shutdown();
    } catch (error) {
        if (process.env.STDIO_MODE) {
            process.stderr.write(`Shutdown error: ${error instanceof Error ? error.message : String(error)}\n`);
        } else {
            console.error('Shutdown error:', error);
        }
    }
    process.exit(0);
});

// Handle unhandled errors gracefully
process.on('uncaughtException', (error) => {
    if (process.env.STDIO_MODE) {
        process.stderr.write(`Uncaught exception: ${error.message}\n`);
    } else {
        console.error('Uncaught exception:', error);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    if (process.env.STDIO_MODE) {
        process.stderr.write(`Unhandled rejection: ${reason}\n`);
    } else {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);
    }
    process.exit(1);
});

// Start server immediately - no heavy initialization
server.run().catch((error) => {
    if (process.env.STDIO_MODE) {
        process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
    } else {
        console.error('Failed to start MCP server:', error);
    }
    process.exit(1);
});
