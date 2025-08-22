/**
 * Simplified Ontology MCP Server
 * 
 * This MCP server acts as a thin wrapper around the ontology-lsp CLI,
 * exposing its functionality through the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js"
import { CLIBridge } from "./cli-bridge.ts"

export class SimpleMCPServer {
  private server: Server
  private cli: CLIBridge

  constructor() {
    this.server = new Server(
      {
        name: "ontology-lsp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    // Initialize CLI bridge
    this.cli = new CLIBridge("ontology-lsp", 7000)
    this.setupHandlers()
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "find_identifier",
          description: "Find all occurrences of an identifier with fuzzy matching",
          inputSchema: {
            type: "object",
            properties: {
              identifier: { type: "string", description: "The identifier to search for" },
              fuzzy: { type: "boolean", description: "Include fuzzy matches" },
              semantic: { type: "boolean", description: "Include semantic matches" },
            },
            required: ["identifier"],
          },
        },
        {
          name: "suggest_refactoring",
          description: "Get refactoring suggestions for an identifier",
          inputSchema: {
            type: "object",
            properties: {
              identifier: { type: "string", description: "The identifier to get suggestions for" },
              confidence: { type: "number", description: "Minimum confidence threshold (0-1)", default: 0.7 },
            },
            required: ["identifier"],
          },
        },
        {
          name: "analyze_codebase",
          description: "Analyze a codebase and build ontology",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path to analyze", default: "." },
            },
          },
        },
        {
          name: "get_statistics",
          description: "Get ontology and pattern statistics",
          inputSchema: {
            type: "object",
            properties: {
              patterns: { type: "boolean", description: "Include pattern statistics" },
              concepts: { type: "boolean", description: "Include concept statistics" },
            },
          },
        },
        {
          name: "clear_cache",
          description: "Clear all caches",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "optimize_database",
          description: "Optimize the ontology database",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }))

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        // Ensure LSP server is running
        if (!await this.cli.isServerRunning()) {
          console.error("LSP server not running, attempting to start...")
          await this.cli.startServer()
          
          // Wait a bit for server to be ready
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          if (!await this.cli.isServerRunning()) {
            throw new Error("Failed to start LSP server")
          }
        }

        let result: any

        switch (name) {
          case "find_identifier":
            result = await this.cli.find(args.identifier, {
              fuzzy: args.fuzzy,
              semantic: args.semantic,
            })
            break

          case "suggest_refactoring":
            result = await this.cli.suggest(args.identifier, args.confidence || 0.7)
            break

          case "analyze_codebase":
            result = await this.cli.analyze(args.path || ".")
            break

          case "get_statistics":
            result = await this.cli.stats({
              patterns: args.patterns,
              concepts: args.concepts,
            })
            break

          case "clear_cache":
            result = await this.cli.clearCache()
            break

          case "optimize_database":
            result = await this.cli.optimize()
            break

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            )
        }

        if (!result.success) {
          throw new McpError(
            ErrorCode.InternalError,
            result.error || "Command failed"
          )
        }

        return {
          content: [
            {
              type: "text",
              text: typeof result.data === "string" 
                ? result.data 
                : JSON.stringify(result.data, null, 2),
            },
          ],
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  }

  async connect(transport: StdioServerTransport) {
    await this.server.connect(transport)
    console.error("Ontology MCP Server connected (CLI-based)")
  }
}

// Main entry point for stdio mode
async function main() {
  const server = new SimpleMCPServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Failed to start MCP server:", error)
    process.exit(1)
  })
}