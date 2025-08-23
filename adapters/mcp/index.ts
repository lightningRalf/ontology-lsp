/**
 * MCP Adapter for Claude Code
 * Translates between MCP protocol and unified core
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js'

import { CodeAnalyzer } from '../../core/analyzer.js'
import { CacheService } from '../../core/services/cache.js'
import { DatabaseService } from '../../core/services/database.js'
import { LayerStack } from '../../core/layers/index.js'
import { MCPTranslator } from './translator.js'
import { MCP_TOOLS } from './tools.js'

export class MCPAdapter {
  private server: Server
  private analyzer: CodeAnalyzer
  private translator: MCPTranslator
  private transport: StdioServerTransport
  
  constructor() {
    // Initialize core services
    const cache = new CacheService({ 
      maxSize: 1000, 
      maxAge: 3600,
      persistent: true 
    })
    
    const database = new DatabaseService('.ontology/ontology.db')
    
    // Initialize layer stack
    const layers = new LayerStack()
    
    // Create analyzer
    this.analyzer = new CodeAnalyzer(layers, cache, database)
    
    // Create translator
    this.translator = new MCPTranslator()
    
    // Setup MCP server
    this.setupServer()
  }
  
  private setupServer(): void {
    // Create MCP server
    this.server = new Server(
      {
        name: 'ontology-lsp',
        version: '2.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    
    // Register handlers
    this.registerHandlers()
    
    // Setup transport
    this.transport = new StdioServerTransport()
  }
  
  private registerHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: MCP_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    })
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      
      try {
        // Find the tool definition
        const toolDef = MCP_TOOLS.find(t => t.name === name)
        if (!toolDef) {
          throw new Error(`Unknown tool: ${name}`)
        }
        
        // Execute the tool
        const result = await this.executeTool(name, args)
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' 
                ? result 
                : JSON.stringify(result, null, 2)
            }
          ]
        }
      } catch (error) {
        // Return error in MCP format
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        }
      }
    })
  }
  
  private async executeTool(name: string, args: any): Promise<any> {
    // Map tool name to analyzer method
    switch (name) {
      case 'find_definition':
        return this.handleFindDefinition(args)
      
      case 'find_references':
        return this.handleFindReferences(args)
      
      case 'find_implementations':
        return this.handleFindImplementations(args)
      
      case 'get_hover':
        return this.handleGetHover(args)
      
      case 'get_completions':
        return this.handleGetCompletions(args)
      
      case 'rename_symbol':
        return this.handleRename(args)
      
      case 'get_diagnostics':
        return this.handleGetDiagnostics(args)
      
      case 'learn_pattern':
        return this.handleLearnPattern(args)
      
      case 'provide_feedback':
        return this.handleProvideFeedback(args)
      
      case 'get_concepts':
        return this.handleGetConcepts(args)
      
      case 'get_relationships':
        return this.handleGetRelationships(args)
      
      default:
        throw new Error(`Unhandled tool: ${name}`)
    }
  }
  
  // Tool handlers
  private async handleFindDefinition(args: any): Promise<any> {
    // Translate MCP args to core format
    const coreParams = this.translator.translateFindDefinitionRequest(args)
    
    // Call core analyzer
    const result = await this.analyzer.findDefinition(coreParams)
    
    // Translate result to MCP format
    return this.translator.translateFindDefinitionResponse(result)
  }
  
  private async handleFindReferences(args: any): Promise<any> {
    const coreParams = this.translator.translateFindReferencesRequest(args)
    const result = await this.analyzer.findReferences(coreParams)
    return this.translator.translateFindReferencesResponse(result)
  }
  
  private async handleFindImplementations(args: any): Promise<any> {
    const coreParams = this.translator.translateFindImplementationsRequest(args)
    const result = await this.analyzer.findImplementations(coreParams)
    return this.translator.translateFindImplementationsResponse(result)
  }
  
  private async handleGetHover(args: any): Promise<any> {
    const coreParams = this.translator.translateHoverRequest(args)
    const result = await this.analyzer.getHover(coreParams)
    return this.translator.translateHoverResponse(result)
  }
  
  private async handleGetCompletions(args: any): Promise<any> {
    const coreParams = this.translator.translateCompletionRequest(args)
    const result = await this.analyzer.getCompletions(coreParams)
    return this.translator.translateCompletionResponse(result)
  }
  
  private async handleRename(args: any): Promise<any> {
    const coreParams = this.translator.translateRenameRequest(args)
    const result = await this.analyzer.getRenameEdits(coreParams)
    return this.translator.translateRenameResponse(result)
  }
  
  private async handleGetDiagnostics(args: any): Promise<any> {
    const coreParams = this.translator.translateDiagnosticRequest(args)
    const result = await this.analyzer.getDiagnostics(coreParams)
    return this.translator.translateDiagnosticResponse(result)
  }
  
  private async handleLearnPattern(args: any): Promise<any> {
    const coreParams = this.translator.translatePatternRequest(args)
    await this.analyzer.learnPattern(coreParams)
    return { success: true, message: 'Pattern learned successfully' }
  }
  
  private async handleProvideFeedback(args: any): Promise<any> {
    const coreParams = this.translator.translateFeedbackRequest(args)
    await this.analyzer.provideFeedback(coreParams)
    return { success: true, message: 'Feedback recorded' }
  }
  
  private async handleGetConcepts(args: any): Promise<any> {
    const coreParams = this.translator.translateConceptRequest(args)
    const result = await this.analyzer.getConcepts(coreParams)
    return this.translator.translateConceptResponse(result)
  }
  
  private async handleGetRelationships(args: any): Promise<any> {
    const coreParams = this.translator.translateRelationshipRequest(args)
    const result = await this.analyzer.getRelationships(coreParams)
    return this.translator.translateRelationshipResponse(result)
  }
  
  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    console.error('Starting MCP server...')
    await this.server.connect(this.transport)
    console.error('MCP server started successfully')
  }
  
  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    console.error('Stopping MCP server...')
    await this.transport.close()
    console.error('MCP server stopped')
  }
}

// Main entry point
if (import.meta.main) {
  const adapter = new MCPAdapter()
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    await adapter.stop()
    process.exit(0)
  })
  
  process.on('SIGTERM', async () => {
    await adapter.stop()
    process.exit(0)
  })
  
  // Start the server
  adapter.start().catch(error => {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  })
}