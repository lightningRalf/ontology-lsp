/**
 * LSP Server - Thin wrapper around unified core
 * 
 * This server only handles LSP protocol concerns:
 * - Connection management
 * - Document synchronization
 * - Capability negotiation
 * 
 * All analysis work is delegated to the LSP adapter and core analyzer.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { LSPAdapter } from '../adapters/lsp-adapter.js';
import { CodeAnalyzer } from '../core/unified-analyzer.js';
import { createCodeAnalyzer } from '../core/index.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';

export class LSPServer {
  private connection = createConnection(
    process.stdin,
    process.stdout
  );
  private documents = new TextDocuments(TextDocument);
  private hasConfigurationCapability = false;
  private coreAnalyzer!: CodeAnalyzer;
  private lspAdapter!: LSPAdapter;
  private initialized = false;

  constructor() {
    this.setupConnection();
  }

  private setupConnection(): void {
    // Initialize request
    this.connection.onInitialize(async (params: InitializeParams) => {
      this.hasConfigurationCapability = !!(
        params.capabilities.workspace?.configuration
      );

      // Initialize core analyzer
      const config = createDefaultCoreConfig();
      const workspaceRoot = params.rootPath || params.workspaceFolders?.[0]?.uri || process.cwd();
      
      this.coreAnalyzer = await createCodeAnalyzer({
        ...config,
        workspaceRoot
      });
      
      await this.coreAnalyzer.initialize();
      
      // Create LSP adapter
      this.lspAdapter = new LSPAdapter(this.coreAnalyzer);
      
      this.initialized = true;

      const result: InitializeResult = {
        capabilities: this.lspAdapter.getCapabilities()
      };

      return result;
    });

    // Initialized notification
    this.connection.onInitialized(() => {
      if (this.hasConfigurationCapability) {
        this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
      }
      console.log('Ontology LSP Server initialized');
    });

    // Document sync
    this.documents.onDidOpen((e) => {
      console.log(`Document opened: ${e.document.uri}`);
    });

    this.documents.onDidChangeContent((change) => {
      this.lspAdapter.handleDidChangeTextDocument({
        textDocument: { uri: change.document.uri },
        contentChanges: [] // Would contain actual changes in real implementation
      });
    });

    this.documents.onDidSave((e) => {
      this.lspAdapter.handleDidSaveTextDocument({
        textDocument: { uri: e.document.uri }
      });
    });

    // LSP method handlers - delegate to adapter
    this.connection.onDefinition(async (params) => {
      if (!this.initialized) {
        throw new Error('Server not initialized');
      }
      return await this.lspAdapter.handleDefinition(params);
    });

    this.connection.onReferences(async (params) => {
      if (!this.initialized) {
        throw new Error('Server not initialized');
      }
      return await this.lspAdapter.handleReferences(params);
    });

    this.connection.onPrepareRename(async (params) => {
      if (!this.initialized) {
        return null;
      }
      return await this.lspAdapter.handlePrepareRename(params);
    });

    this.connection.onRenameRequest(async (params) => {
      if (!this.initialized) {
        throw new Error('Server not initialized');
      }
      return await this.lspAdapter.handleRename(params);
    });

    this.connection.onCompletion(async (params) => {
      if (!this.initialized) {
        return [];
      }
      return await this.lspAdapter.handleCompletion(params);
    });

    // Configuration changes
    this.connection.onDidChangeConfiguration(() => {
      console.log('Configuration changed - reloading...');
      // Could reload configuration here
    });

    // Listen on documents
    this.documents.listen(this.connection);
    this.connection.listen();
  }

  /**
   * Start the LSP server
   */
  async start(): Promise<void> {
    console.log('Starting Ontology LSP Server...');
    // Connection starts listening automatically
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    if (this.coreAnalyzer) {
      await this.coreAnalyzer.dispose();
    }
    console.log('Ontology LSP Server shut down');
  }
}

// Export singleton instance for compatibility
export const server = new LSPServer();

// Start server if run directly
if (import.meta.main) {
  server.start().catch(console.error);
}