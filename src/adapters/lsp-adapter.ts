/**
 * LSP Adapter - Thin wrapper converting LSP protocol to core analyzer calls
 * Target: <200 lines
 * 
 * This adapter handles LSP-specific concerns only:
 * - LSP protocol message formatting
 * - Text document synchronization
 * - LSP capabilities negotiation
 * - Error code mapping
 * 
 * All actual analysis work is delegated to the unified core analyzer.
 */

import type {
  TextDocumentPositionParams,
  DefinitionParams,
  ReferenceParams,
  PrepareRenameParams,
  RenameParams,
  CompletionParams,
  Location,
  CompletionItem,
  WorkspaceEdit,
  ResponseError
} from 'vscode-languageserver';

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import {
  buildFindDefinitionRequest,
  buildFindReferencesRequest,
  buildPrepareRenameRequest,
  buildRenameRequest,
  buildCompletionRequest,
  definitionToLspLocation,
  referenceToLspLocation,
  completionToLspItem,
  workspaceEditToLsp,
  handleAdapterError,
  normalizePosition,
  normalizeUri
} from './utils.js';

export interface LSPAdapterConfig {
  enableDiagnostics?: boolean;
  enableCodeLens?: boolean;
  enableFolding?: boolean;
  maxResults?: number;
  timeout?: number;
}

/**
 * LSP Protocol Adapter - converts LSP messages to core analyzer calls
 */
export class LSPAdapter {
  private coreAnalyzer: CodeAnalyzer;
  private config: LSPAdapterConfig;

  constructor(coreAnalyzer: CodeAnalyzer, config: LSPAdapterConfig = {}) {
    this.coreAnalyzer = coreAnalyzer;
    this.config = {
      enableDiagnostics: true,
      enableCodeLens: true,
      enableFolding: true,
      maxResults: 50,
      timeout: 30000,
      ...config
    };
  }

  /**
   * Get LSP server capabilities based on core analyzer features
   */
  getCapabilities() {
    return {
      textDocumentSync: {
        openClose: true,
        change: 2, // Incremental
        willSave: false,
        willSaveWaitUntil: false,
        save: { includeText: false }
      },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      completionProvider: {
        triggerCharacters: ['.', ':', '(', '<'],
        allCommitCharacters: [' ', '\t', '\n', ';', ',', ')']
      },
      hoverProvider: false, // Not implemented in core yet
      documentSymbolProvider: false, // Not implemented in core yet
      workspaceSymbolProvider: false, // Not implemented in core yet
      codeActionProvider: false, // Not implemented in core yet
      codeLensProvider: this.config.enableCodeLens ? { resolveProvider: false } : undefined,
      documentFormattingProvider: false,
      foldingRangeProvider: this.config.enableFolding ? true : undefined
    };
  }

  /**
   * Handle LSP textDocument/definition request
   */
  async handleDefinition(params: DefinitionParams): Promise<Location[]> {
    try {
      // Extract identifier from document if not provided
      const identifier = this.extractIdentifierAtPosition(params.textDocument.uri, params.position);
      
      const request = buildFindDefinitionRequest({
        uri: params.textDocument.uri,
        position: normalizePosition(params.position),
        identifier,
        maxResults: this.config.maxResults,
        includeDeclaration: true
      });

      const result = await this.coreAnalyzer.findDefinition(request);
      
      return result.data.map(def => definitionToLspLocation(def));
      
    } catch (error) {
      throw this.createLspError(-32603, 'Definition request failed', error);
    }
  }

  /**
   * Handle LSP textDocument/references request  
   */
  async handleReferences(params: ReferenceParams): Promise<Location[]> {
    try {
      const identifier = this.extractIdentifierAtPosition(params.textDocument.uri, params.position);
      
      const request = buildFindReferencesRequest({
        uri: params.textDocument.uri,
        position: normalizePosition(params.position),
        identifier,
        maxResults: this.config.maxResults,
        includeDeclaration: params.context.includeDeclaration
      });

      const result = await this.coreAnalyzer.findReferences(request);
      
      return result.data.map(ref => referenceToLspLocation(ref));
      
    } catch (error) {
      throw this.createLspError(-32603, 'References request failed', error);
    }
  }

  /**
   * Handle LSP textDocument/prepareRename request
   */
  async handlePrepareRename(params: PrepareRenameParams): Promise<{ range: any; placeholder: string } | null> {
    try {
      const identifier = this.extractIdentifierAtPosition(params.textDocument.uri, params.position);
      if (!identifier) {
        return null;
      }
      
      const request = buildPrepareRenameRequest({
        uri: params.textDocument.uri,
        position: normalizePosition(params.position),
        identifier
      });

      const result = await this.coreAnalyzer.prepareRename(request);
      
      return result.data;
      
    } catch (error) {
      // Return null for prepare rename failures (LSP pattern)
      return null;
    }
  }

  /**
   * Handle LSP textDocument/rename request
   */
  async handleRename(params: RenameParams): Promise<WorkspaceEdit> {
    try {
      const identifier = this.extractIdentifierAtPosition(params.textDocument.uri, params.position);
      if (!identifier) {
        throw new Error('Cannot determine identifier to rename');
      }
      
      const request = buildRenameRequest({
        uri: params.textDocument.uri,
        position: normalizePosition(params.position),
        identifier,
        newName: params.newName,
        dryRun: false
      });

      const result = await this.coreAnalyzer.rename(request);
      
      return workspaceEditToLsp(result.data);
      
    } catch (error) {
      throw this.createLspError(-32603, 'Rename request failed', error);
    }
  }

  /**
   * Handle LSP textDocument/completion request
   */
  async handleCompletion(params: CompletionParams): Promise<CompletionItem[]> {
    try {
      const request = buildCompletionRequest({
        uri: params.textDocument.uri,
        position: normalizePosition(params.position),
        triggerCharacter: params.context?.triggerCharacter,
        maxResults: this.config.maxResults
      });

      const result = await this.coreAnalyzer.getCompletions(request);
      
      return result.data.map(comp => completionToLspItem(comp));
      
    } catch (error) {
      throw this.createLspError(-32603, 'Completion request failed', error);
    }
  }

  /**
   * Handle file change notifications for learning
   */
  async handleDidChangeTextDocument(params: { textDocument: { uri: string }; contentChanges: any[] }): Promise<void> {
    try {
      // Notify core analyzer about file changes for learning
      await this.coreAnalyzer.trackFileChange(
        params.textDocument.uri,
        'modified',
        undefined, // We don't have before/after content here
        undefined,
        { timestamp: new Date().toISOString() }
      );
    } catch (error) {
      // Don't throw for tracking failures
      console.warn('Failed to track file change:', error);
    }
  }

  /**
   * Handle file save notifications 
   */
  async handleDidSaveTextDocument(params: { textDocument: { uri: string } }): Promise<void> {
    try {
      // Trigger any post-save processing in core
      await this.coreAnalyzer.trackFileChange(
        params.textDocument.uri,
        'modified',
        undefined,
        undefined,
        { event: 'saved', timestamp: new Date().toISOString() }
      );
    } catch (error) {
      console.warn('Failed to track file save:', error);
    }
  }

  /**
   * Initialize the LSP adapter
   */
  async initialize(): Promise<void> {
    // LSP adapter doesn't need special initialization - just ensure core analyzer is ready
    // Core analyzer is passed in constructor and should already be initialized
  }

  /**
   * Dispose the LSP adapter
   */
  async dispose(): Promise<void> {
    // LSP adapter doesn't hold resources that need cleanup
  }

  /**
   * Get adapter diagnostics and health information
   */
  getDiagnostics(): Record<string, any> {
    return {
      adapter: 'lsp',
      config: this.config,
      coreAnalyzer: this.coreAnalyzer.getDiagnostics(),
      timestamp: Date.now()
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Extract identifier at given position (stub - would need document content)
   * In practice, this would use document content from the LSP server
   */
  private extractIdentifierAtPosition(uri: string, position: any): string {
    // This is a simplified stub. In practice, you'd:
    // 1. Get document content from document manager
    // 2. Extract word at position using regex or tree-sitter
    // 3. Return the identifier
    
    // For testing/fallback, provide a reasonable default identifier
    // Core analyzer will use position-based extraction if identifier is empty
    return `symbol_at_${position.line}_${position.character}`;
  }

  /**
   * Create LSP-compatible error response
   */
  private createLspError(code: number, message: string, cause?: any): ResponseError {
    const error = handleAdapterError(cause, 'lsp');
    return {
      code: error.code || code,
      message: `${message}: ${error.message}`,
      data: error.data
    };
  }
}