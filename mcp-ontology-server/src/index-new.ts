/**
 * New MCP Server using MCP Adapter - Thin wrapper around unified core
 * 
 * This server only handles MCP protocol concerns:
 * - MCP server setup and transport
 * - Tool registration
 * - Request/response formatting
 * 
 * All analysis work is delegated to the MCP adapter and core analyzer.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { MCPAdapter } from "../../src/adapters/mcp-adapter.js";
import { CodeAnalyzer } from "../../src/core/unified-analyzer";
import { createCodeAnalyzer } from "../../src/core/index";
import { createDefaultCoreConfig } from "../../src/adapters/utils.js";

export class SimpleMCPServer {
  private server: Server;
  private coreAnalyzer!: CodeAnalyzer;
  private mcpAdapter!: MCPAdapter;

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
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.mcpAdapter) {
        throw new McpError(ErrorCode.InternalError, "Server not initialized");
      }

      return {
        tools: this.mcpAdapter.getTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.mcpAdapter) {
        throw new McpError(ErrorCode.InternalError, "Server not initialized");
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

  async initialize(): Promise<void> {
    // Initialize core analyzer
    const config = createDefaultCoreConfig();
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
    
    this.coreAnalyzer = await createCodeAnalyzer({
      ...config,
      workspaceRoot
    });
    
    await this.coreAnalyzer.initialize();
    
    // Create MCP adapter
    this.mcpAdapter = new MCPAdapter(this.coreAnalyzer);
    
    console.error("Ontology MCP Server initialized");
  }

  async run(): Promise<void> {
    // Initialize first
    await this.initialize();
    
    // Set up transport
    const transport = new StdioServerTransport();
    
    // Connect and listen
    await this.server.connect(transport);
    console.error("Ontology MCP Server running on stdio");
  }

  async shutdown(): Promise<void> {
    if (this.coreAnalyzer) {
      await this.coreAnalyzer.dispose();
    }
    console.error("Ontology MCP Server shut down");
  }
}

// Create and run server
const server = new SimpleMCPServer();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});

// Start server
server.run().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});