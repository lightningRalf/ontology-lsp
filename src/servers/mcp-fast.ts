/**
 * Fast MCP Server - Optimized for quick startup
 * 
 * This server delays heavy initialization until first tool call
 * to prevent timeout issues with MCP clients like Claude.
 */

// CRITICAL: Set silent mode BEFORE any imports to prevent stdio pollution
process.env.SILENT_MODE = 'true';
process.env.STDIO_MODE = 'true';

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { MCPAdapter } from "../adapters/mcp-adapter.js";
import { CodeAnalyzer } from "../core/unified-analyzer";
import { createCodeAnalyzer } from "../core/index";
import { createDefaultCoreConfig } from "../adapters/utils.js";

export class FastMCPServer {
  private server: Server;
  private coreAnalyzer?: CodeAnalyzer;
  private mcpAdapter?: MCPAdapter;
  private initPromise?: Promise<void>;
  private initialized = false;

  constructor() {
    this.server = new Server(
      {
        name: "ontology-lsp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools - return immediately without initialization
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Return tools without initializing the core
      return {
        tools: [
          {
            name: "find_definition",
            description: "Find symbol definition with fuzzy matching and semantic understanding",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Symbol name to find (supports fuzzy matching)"
                },
                file: {
                  type: "string", 
                  description: "Current file context"
                },
                position: {
                  type: "object",
                  properties: {
                    line: { type: "number" },
                    character: { type: "number" }
                  }
                }
              },
              required: ["symbol"]
            }
          },
          {
            name: "find_references",
            description: "Find all references to a symbol across the codebase",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Symbol to find references for"
                },
                includeDeclaration: {
                  type: "boolean",
                  default: false,
                  description: "Include the declaration in results"
                },
                scope: {
                  type: "string",
                  enum: ["workspace", "file", "function"],
                  default: "workspace",
                  description: "Search scope"
                }
              },
              required: ["symbol"]
            }
          },
          {
            name: "rename_symbol",
            description: "Rename symbol with intelligent propagation across related concepts",
            inputSchema: {
              type: "object",
              properties: {
                oldName: {
                  type: "string",
                  description: "Current symbol name"
                },
                newName: {
                  type: "string",
                  description: "New symbol name"
                },
                preview: {
                  type: "boolean",
                  default: true,
                  description: "Preview changes without applying"
                },
                scope: {
                  type: "string",
                  enum: ["exact", "related", "similar"],
                  default: "exact",
                  description: "Propagation scope"
                }
              },
              required: ["oldName", "newName"]
            }
          },
          {
            name: "generate_tests",
            description: "Generate tests based on code understanding and patterns",
            inputSchema: {
              type: "object",
              properties: {
                target: {
                  type: "string",
                  description: "File or function to generate tests for"
                },
                framework: {
                  type: "string",
                  enum: ["bun", "jest", "vitest", "mocha", "auto"],
                  default: "auto",
                  description: "Test framework to use"
                },
                coverage: {
                  type: "string",
                  enum: ["basic", "comprehensive", "edge-cases"],
                  default: "comprehensive",
                  description: "Test coverage level"
                }
              },
              required: ["target"]
            }
          }
        ]
      };
    });

    // Handle tool calls - initialize on demand
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Ensure initialization before handling tool call
      await this.ensureInitialized();

      if (!this.mcpAdapter) {
        throw new McpError(ErrorCode.InternalError, "Server initialization failed");
      }

      const { name, arguments: args } = request.params;
      
      try {
        const result = await this.mcpAdapter.handleToolCall(name, args || {});
        return result;
      } catch (error) {
        console.error(`Tool call failed: ${name}`, error);
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
      // Initialize core analyzer with optimized config
      const config = createDefaultCoreConfig();
      const workspaceRoot = process.env.ONTOLOGY_WORKSPACE || process.env.WORKSPACE_ROOT || process.cwd();
      
      // Disable cache warming and other slow startup operations
      config.optimization = {
        ...config.optimization,
        cacheWarming: false,
        preloadParsers: false
      };
      
      this.coreAnalyzer = await createCodeAnalyzer({
        ...config,
        workspaceRoot
      });
      
      await this.coreAnalyzer.initialize();
      
      // Create MCP adapter
      this.mcpAdapter = new MCPAdapter(this.coreAnalyzer);
      
      this.initialized = true;
      // Only log in debug mode, never in stdio mode
      if (process.env.DEBUG && !process.env.STDIO_MODE) {
        console.error("Ontology MCP Server core initialized");
      }
    } catch (error) {
      // Only log errors in debug mode or non-stdio mode
      if (process.env.DEBUG || !process.env.STDIO_MODE) {
        console.error("Failed to initialize core:", error);
      }
      throw error;
    }
  }

  async run(): Promise<void> {
    // Set up transport without initializing core
    const transport = new StdioServerTransport();
    
    // Connect and listen immediately
    await this.server.connect(transport);
    // Only log in debug mode, never in stdio mode to prevent protocol pollution
    if (process.env.DEBUG && !process.env.STDIO_MODE) {
      console.error("Ontology Fast MCP Server running on stdio");
    }
  }

  async shutdown(): Promise<void> {
    if (this.coreAnalyzer) {
      await this.coreAnalyzer.dispose();
    }
    // Only log in debug mode, never in stdio mode
    if (process.env.DEBUG && !process.env.STDIO_MODE) {
      console.error("Ontology MCP Server shut down");
    }
  }
}

// Create and run server
const server = new FastMCPServer();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});

// Start server immediately - no heavy initialization
server.run().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});