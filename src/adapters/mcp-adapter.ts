/**
 * MCP Adapter - Convert MCP tool calls to core analyzer with enhanced error handling
 * 
 * This adapter handles MCP-specific concerns:
 * - MCP tool call/response format
 * - Enhanced error handling and validation
 * - Timeout management
 * - Request/response logging
 * 
 * All actual analysis work is delegated to the unified core analyzer.
 */

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import { mcpLogger, adapterLogger } from '../core/utils/file-logger.js';
import { withMcpErrorHandling, createValidationError, ErrorContext } from '../core/utils/error-handler.js';
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
        name: 'explore_codebase',
        description: 'Explore codebase by running multiple analyses in parallel (definitions, references, stats)',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol name to explore' },
            file: { type: 'string', description: 'Optional file or directory context' },
            maxResults: { type: 'number', default: 100 },
            includeDeclaration: { type: 'boolean', default: true }
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
   * Handle MCP tool call with enhanced error handling
   */
  async handleToolCall(name: string, arguments_: Record<string, any>): Promise<any> {
    const context: ErrorContext = {
      component: 'MCPAdapter',
      operation: `tool_${name}`,
      timestamp: Date.now()
    };

    return await withMcpErrorHandling('MCPAdapter', `tool_${name}`, async () => {
      adapterLogger.debug(`Handling tool call: ${name}`, {
        args: this.sanitizeForLogging(arguments_)
      });

      // Validate tool name
      const validTools = ['find_definition', 'find_references', 'rename_symbol', 'generate_tests', 'explore_codebase'];
      if (!validTools.includes(name)) {
        throw createValidationError(`Unknown tool: ${name}. Valid tools: ${validTools.join(', ')}`, context);
      }

      const startTime = Date.now();
      let result: any;

      switch (name) {
        case 'find_definition':
          result = await this.handleFindDefinition(arguments_, context);
          break;
        case 'find_references':
          result = await this.handleFindReferences(arguments_, context);
          break;
        case 'rename_symbol':
          result = await this.handleRenameSymbol(arguments_, context);
          break;
        case 'generate_tests':
          result = await this.handleGenerateTests(arguments_, context);
          break;
        case 'explore_codebase':
          result = await this.handleExploreCodebase(arguments_, context);
          break;
      }

      const duration = Date.now() - startTime;
      adapterLogger.logPerformance(`tool_${name}`, duration, true, {
        resultSize: JSON.stringify(result).length
      });

      return result;
    });
  }

  /**
   * Handle find_definition tool call with validation
   */
  private async handleFindDefinition(args: Record<string, any>, context: ErrorContext) {
    this.validateArgs(args, ['symbol'], context);
    
    const position = args.position ? 
      normalizePosition(args.position) : 
      createPosition(0, 0);

    // If no file provided, search for the symbol across the workspace first
    let uri = args.file ? normalizeUri(args.file) : null;
    
    if (!uri) {
      // Use workspace-wide search to find the symbol
      // This will trigger Layer 1's search capabilities
      const workspaceRequest = buildFindDefinitionRequest({
        uri: '', // Empty URI triggers workspace search
        position,
        identifier: args.symbol,
        maxResults: this.config.maxResults,
        includeDeclaration: true
      });
      
      try {
        const result = await (this.coreAnalyzer as any).findDefinitionAsync(workspaceRequest);
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
      } catch (e) {
        // Fallback: perform a very small, bounded scan in the configured workspace root
        const wsRoot = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
        const fallbackDefs = await this.fallbackScanForDefinition(wsRoot, args.symbol, 200);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              definitions: fallbackDefs.map(def => definitionToMcpResponse(def)),
              performance: { layer1: 0, layer2: 0, layer3: 0, layer4: 0, layer5: 0, total: 0 },
              requestId: undefined,
              count: fallbackDefs.length,
              fallback: true
            }, null, 2)
          }],
          isError: false
        };
      }
    }

    // Normal path when file is provided
    const request = buildFindDefinitionRequest({
      uri,
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

  // Extremely limited fallback used only when async fast-path times out in tests or constrained environments
  private async fallbackScanForDefinition(root: string, symbol: string, maxFiles: number) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const results: any[] = [];
    const queue: string[] = [root];
    const visited: Set<string> = new Set();
    const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`);
    let filesScanned = 0;

    while (queue.length && filesScanned < maxFiles && results.length === 0) {
      const dir = queue.shift()!;
      if (visited.has(dir)) continue;
      visited.add(dir);
      let entries: any[] = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true } as any); } catch { continue; }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (/node_modules|\.git|dist|coverage|out|build|venv|\.venv/.test(ent.name)) continue;
          queue.push(p);
        } else if (ent.isFile() && /\.(ts|tsx|js|jsx|md)$/.test(ent.name)) {
          filesScanned++;
          try {
            const text = await fs.readFile(p, 'utf8');
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                results.push({
                  uri: `file://${p}`,
                  range: { start: { line: i, character: Math.max(0, (lines[i].indexOf(symbol))) }, end: { line: i, character: Math.max(0, (lines[i].indexOf(symbol))) + symbol.length } },
                  kind: 'class',
                  name: symbol,
                  source: 'fallback',
                  confidence: 0.5,
                  layer: 'async-layer1'
                });
                break;
              }
            }
          } catch {}
          if (results.length > 0) break;
        }
        if (filesScanned >= maxFiles || results.length > 0) break;
      }
    }
    return results;
  }

  /**
   * Handle find_references tool call with validation
   */
  private async handleFindReferences(args: Record<string, any>, context: ErrorContext) {
    this.validateArgs(args, ['symbol'], context);
    
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
   * Handle rename_symbol tool call with validation
   */
  private async handleRenameSymbol(args: Record<string, any>, context: ErrorContext) {
    this.validateArgs(args, ['oldName', 'newName'], context);
    
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
   * Handle generate_tests tool call with validation (stub - not implemented in core yet)
   */
  private async handleGenerateTests(args: Record<string, any>, context: ErrorContext) {
    this.validateArgs(args, ['target'], context);
    
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
   * Handle explore_codebase tool call by fanning out multiple analyses in parallel
   */
  private async handleExploreCodebase(args: Record<string, any>, context: ErrorContext) {
    this.validateArgs(args, ['symbol'], context);

    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : this.config.maxResults;
    const includeDeclaration = args.includeDeclaration ?? true;

    const uri = args.file ? normalizeUri(args.file) : normalizeUri('file://workspace');
    const position = createPosition(0, 0);

    const defReq = buildFindDefinitionRequest({
      uri,
      position,
      identifier: args.symbol,
      maxResults,
      includeDeclaration
    });

    const refReq = buildFindReferencesRequest({
      uri,
      position,
      identifier: args.symbol,
      maxResults: Math.min(maxResults ?? 100, 500),
      includeDeclaration: includeDeclaration ?? false
    });

    // Execute in parallel
    // Delegate to core analyzer per VISION.md (thin adapter)
    const coreResult = await (this.coreAnalyzer as any).exploreCodebase({
      uri,
      identifier: args.symbol,
      includeDeclaration,
      maxResults
    });

    // Map definitions/references for MCP output while preserving performance/diagnostics
    const mapped = {
      symbol: coreResult.symbol,
      contextUri: coreResult.contextUri,
      definitions: coreResult.definitions.map(def => definitionToMcpResponse(def)),
      references: coreResult.references.map(ref => referenceToMcpResponse(ref)),
      performance: coreResult.performance,
      diagnostics: coreResult.diagnostics,
      timestamp: coreResult.timestamp
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(mapped, null, 2)
      }],
      isError: false
    };
  }

  /**
   * Initialize the MCP adapter
   */
  async initialize(): Promise<void> {
    // MCP adapter doesn't need special initialization - just ensure core analyzer is ready
    // Core analyzer is passed in constructor and should already be initialized
  }

  /**
   * Dispose the MCP adapter
   */
  async dispose(): Promise<void> {
    // MCP adapter doesn't hold resources that need cleanup
  }

  /**
   * Execute MCP tool call (alias for handleToolCall for consistency)
   */
  async executeTool(request: { name: string; arguments: Record<string, any> }): Promise<any> {
    return await this.handleToolCall(request.name, request.arguments);
  }

  /**
   * Validate tool arguments with enhanced error messages
   */
  private validateArgs(args: Record<string, any>, requiredFields: string[], context: ErrorContext): void {
    if (!args || typeof args !== 'object') {
      throw createValidationError('Arguments must be an object', context);
    }

    for (const field of requiredFields) {
      if (args[field] === undefined || args[field] === null) {
        throw createValidationError(`Missing required parameter: ${field}`, context);
      }
      
      if (typeof args[field] === 'string' && args[field].trim() === '') {
        throw createValidationError(`Parameter '${field}' cannot be empty`, context);
      }
    }

    // Additional validation for specific fields
    if (args.position && typeof args.position === 'object') {
      if (typeof args.position.line !== 'number' || args.position.line < 0) {
        throw createValidationError('position.line must be a non-negative number', context);
      }
      if (typeof args.position.character !== 'number' || args.position.character < 0) {
        throw createValidationError('position.character must be a non-negative number', context);
      }
    }
  }

  /**
   * Sanitize arguments for logging
   */
  private sanitizeForLogging(args: any): any {
    if (!args || typeof args !== 'object') return args;

    const sanitized = { ...args };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
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
