/**
 * MCP Adapter - Convert MCP tool calls to core analyzer with SSE transport
 * Target: <150 lines
 * 
 * This adapter handles MCP-specific concerns only:
 * - MCP tool call/response format
 * - SSE transport layer
 * - MCP error handling
 * - Parameter validation
 * 
 * All actual analysis work is delegated to the unified core analyzer.
 */

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import {
  buildFindDefinitionRequest,
  buildFindReferencesRequest,
  buildRenameRequest,
  buildCompletionRequest,
  definitionToMcpResponse,
  referenceToMcpResponse,
  handleAdapterError,
  validateRequired,
  normalizePosition,
  createPosition,
  normalizeUri
} from './utils.js';

export interface MCPAdapterConfig {
  maxResults?: number;
  timeout?: number;
  enableSSE?: boolean;
  ssePort?: number;
}

/**
 * MCP Protocol Adapter - converts MCP tool calls to core analyzer calls
 */
export class MCPAdapter {
  private coreAnalyzer: CodeAnalyzer;
  private config: MCPAdapterConfig;

  constructor(coreAnalyzer: CodeAnalyzer, config: MCPAdapterConfig = {}) {
    this.coreAnalyzer = coreAnalyzer;
    this.config = {
      maxResults: 100,
      timeout: 30000,
      enableSSE: true,
      ssePort: 7001,
      ...config
    };
  }

  /**
   * Get available MCP tools
   */
  getTools() {
    return [
      {
        name: 'find_definition',
        description: 'Find symbol definition with fuzzy matching and semantic understanding',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol name to find (supports fuzzy matching)' },
            file: { type: 'string', description: 'Current file context' },
            position: {
              type: 'object',
              properties: {
                line: { type: 'number' },
                character: { type: 'number' }
              }
            }
          },
          required: ['symbol']
        }
      },
      {
        name: 'find_references',
        description: 'Find all references to a symbol across the codebase',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol to find references for' },
            includeDeclaration: { type: 'boolean', default: false, description: 'Include the declaration in results' },
            scope: { type: 'string', enum: ['workspace', 'file', 'function'], default: 'workspace', description: 'Search scope' }
          },
          required: ['symbol']
        }
      },
      {
        name: 'rename_symbol',
        description: 'Rename symbol with intelligent propagation across related concepts',
        inputSchema: {
          type: 'object',
          properties: {
            oldName: { type: 'string', description: 'Current symbol name' },
            newName: { type: 'string', description: 'New symbol name' },
            preview: { type: 'boolean', default: true, description: 'Preview changes without applying' },
            scope: { type: 'string', enum: ['exact', 'related', 'similar'], default: 'exact', description: 'Propagation scope' }
          },
          required: ['oldName', 'newName']
        }
      },
      {
        name: 'generate_tests',
        description: 'Generate tests based on code understanding and patterns',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'File or function to generate tests for' },
            framework: { type: 'string', enum: ['bun', 'jest', 'vitest', 'mocha', 'auto'], default: 'auto', description: 'Test framework to use' },
            coverage: { type: 'string', enum: ['basic', 'comprehensive', 'edge-cases'], default: 'comprehensive', description: 'Test coverage level' }
          },
          required: ['target']
        }
      }
    ];
  }

  /**
   * Handle MCP tool call
   */
  async handleToolCall(name: string, arguments_: Record<string, any>): Promise<any> {
    try {
      switch (name) {
        case 'find_definition':
          return await this.handleFindDefinition(arguments_);
        case 'find_references':
          return await this.handleFindReferences(arguments_);
        case 'rename_symbol':
          return await this.handleRenameSymbol(arguments_);
        case 'generate_tests':
          return await this.handleGenerateTests(arguments_);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return handleAdapterError(error, 'mcp');
    }
  }

  /**
   * Handle find_definition tool call
   */
  private async handleFindDefinition(args: Record<string, any>) {
    validateRequired(args, ['symbol']);
    
    const position = args.position ? 
      normalizePosition(args.position) : 
      createPosition(0, 0);

    const request = buildFindDefinitionRequest({
      uri: normalizeUri(args.file || 'file://unknown'),
      position,
      identifier: args.symbol,
      maxResults: this.config.maxResults,
      includeDeclaration: true
    });

    const result = await this.coreAnalyzer.findDefinition(request);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          definitions: result.data.map(def => definitionToMcpResponse(def)),
          performance: result.performance,
          requestId: result.requestId,
          count: result.data.length
        }, null, 2)
      }],
      isError: false
    };
  }

  /**
   * Handle find_references tool call
   */
  private async handleFindReferences(args: Record<string, any>) {
    validateRequired(args, ['symbol']);
    
    // For MCP, we don't have exact position, so use symbol-based search
    const request = buildFindReferencesRequest({
      uri: normalizeUri('file://workspace'),
      position: createPosition(0, 0),
      identifier: args.symbol,
      maxResults: this.config.maxResults,
      includeDeclaration: args.includeDeclaration ?? false
    });

    const result = await this.coreAnalyzer.findReferences(request);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          references: result.data.map(ref => referenceToMcpResponse(ref)),
          performance: result.performance,
          requestId: result.requestId,
          count: result.data.length,
          scope: args.scope || 'workspace'
        }, null, 2)
      }],
      isError: false
    };
  }

  /**
   * Handle rename_symbol tool call
   */
  private async handleRenameSymbol(args: Record<string, any>) {
    validateRequired(args, ['oldName', 'newName']);
    
    const request = buildRenameRequest({
      uri: normalizeUri('file://workspace'),
      position: createPosition(0, 0),
      identifier: args.oldName,
      newName: args.newName,
      dryRun: args.preview ?? true
    });

    const result = await this.coreAnalyzer.rename(request);
    
    const changes = Object.entries(result.data.changes || {}).map(([uri, edits]) => ({
      file: uri,
      edits: edits.map((edit: any) => ({
        range: {
          start: { line: edit.range.start.line, character: edit.range.start.character },
          end: { line: edit.range.end.line, character: edit.range.end.character }
        },
        newText: edit.newText
      }))
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          changes,
          performance: result.performance,
          requestId: result.requestId,
          preview: args.preview ?? true,
          scope: args.scope || 'exact',
          summary: `${changes.length} files affected with ${changes.reduce((acc, c) => acc + c.edits.length, 0)} edits`
        }, null, 2)
      }],
      isError: false
    };
  }

  /**
   * Handle generate_tests tool call (stub - not implemented in core yet)
   */
  private async handleGenerateTests(args: Record<string, any>) {
    validateRequired(args, ['target']);
    
    // This is a stub implementation - core analyzer doesn't have test generation yet
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'Test generation not yet implemented in core analyzer',
          target: args.target,
          framework: args.framework || 'auto',
          coverage: args.coverage || 'comprehensive',
          status: 'not_implemented'
        }, null, 2)
      }],
      isError: false
    };
  }

  /**
   * Get adapter diagnostics
   */
  getDiagnostics(): Record<string, any> {
    return {
      adapter: 'mcp',
      config: this.config,
      availableTools: this.getTools().map(t => t.name),
      coreAnalyzer: this.coreAnalyzer.getDiagnostics(),
      timestamp: Date.now()
    };
  }
}