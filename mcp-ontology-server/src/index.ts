/**
 * Ontology-Enhanced MCP Server
 * 
 * Exposes a 5-layer intelligent code understanding system via MCP:
 * 1. Claude Tools Layer - Fast file operations (5ms)
 * 2. Tree-Sitter Layer - AST analysis (50ms)
 * 3. Ontology Engine - Concept relationships (10ms)
 * 4. Pattern Learner - Usage pattern detection (10ms)
 * 5. Knowledge Spreader - Change propagation (20ms)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js"

import { createTools } from "./tools/index.js"
import { createResources } from "./resources/index.js"
import { createPrompts } from "./prompts/index.js"
import { LayerOrchestrator } from "./layers/orchestrator.js"

export class OntologyMCPServer {
  private server: Server
  private orchestrator: LayerOrchestrator

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
    )

    this.orchestrator = new LayerOrchestrator()
    this.setupHandlers()
  }

  private setupHandlers() {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: createTools(),
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        // Route tool calls through the layer orchestrator
        const result = await this.orchestrator.executeTool(name, args)
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
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

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await createResources(this.orchestrator),
    }))

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      
      try {
        const content = await this.orchestrator.readResource(uri)
        
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(content, null, 2),
            },
          ],
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Resource not found: ${uri}`
        )
      }
    })

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: createPrompts(),
    }))

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      
      const prompts = createPrompts()
      const prompt = prompts.find(p => p.name === name)
      
      if (!prompt) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Prompt not found: ${name}`
        )
      }

      // Generate dynamic prompt based on current ontology state
      const content = await this.orchestrator.generatePrompt(name, args)
      
      return {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: content,
            },
          },
        ],
      }
    })
  }

  async connect(transport: StdioServerTransport) {
    await this.server.connect(transport)
    console.error("Ontology MCP Server connected")
  }
}

// Export for use in stdio and SSE entry points
export { LayerOrchestrator } from "./layers/orchestrator.js"