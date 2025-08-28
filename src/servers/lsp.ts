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
    DidChangeConfigurationNotification,
    type InitializeParams,
    type InitializeResult,
    ProposedFeatures,
    RequestType,
    TextDocumentSyncKind,
    TextDocuments,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { LSPAdapter } from '../adapters/lsp-adapter.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { createCodeAnalyzer } from '../core/index.js';
import type { CodeAnalyzer } from '../core/unified-analyzer.js';

export class LSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents = new TextDocuments(TextDocument);
    private hasConfigurationCapability = false;
    private coreAnalyzer!: CodeAnalyzer;
    private lspAdapter!: LSPAdapter;
    private initialized = false;

    constructor() {
        this.setupConnection();
    }

    private setupConnection(): void {
        const log = (...args: any[]) => {
            // Use stderr for logs to avoid contaminating LSP stdio channel
            try {
                console.error(...args);
            } catch {}
        };
        // Initialize request
        this.connection.onInitialize(async (params: InitializeParams) => {
            this.hasConfigurationCapability = !!params.capabilities.workspace?.configuration;

            // Initialize core analyzer
            const config = createDefaultCoreConfig();
            const workspaceRoot = params.rootPath || params.workspaceFolders?.[0]?.uri || process.cwd();

            this.coreAnalyzer = await createCodeAnalyzer({
                ...config,
                workspaceRoot,
            });

            await this.coreAnalyzer.initialize();

            // Create LSP adapter
            this.lspAdapter = new LSPAdapter(this.coreAnalyzer);

            this.initialized = true;

            const result: InitializeResult = {
                capabilities: this.lspAdapter.getCapabilities(),
            };

            return result;
        });

        // Initialized notification
        this.connection.onInitialized(() => {
            if (this.hasConfigurationCapability) {
                this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
            }
            log('Ontology LSP Server initialized');
        });

        // Document sync
        this.documents.onDidOpen((e) => {
            log(`Document opened: ${e.document.uri}`);
        });

        this.documents.onDidChangeContent((change) => {
            this.lspAdapter.handleDidChangeTextDocument({
                textDocument: { uri: change.document.uri },
                contentChanges: [], // Would contain actual changes in real implementation
            });
        });

        this.documents.onDidSave((e) => {
            this.lspAdapter.handleDidSaveTextDocument({
                textDocument: { uri: e.document.uri },
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

        // Custom ontology requests (lightweight stubs for integration tests)
        const OntologyStatsRequest = new RequestType<{}, { ontology: any; patterns: any }, void>(
            'ontology/getStatistics'
        );
        this.connection.onRequest(OntologyStatsRequest, async () => {
            return {
                ontology: { concepts: 0, relations: 0 },
                patterns: { total: 0, strong: 0, weak: 0 },
            };
        });

        const OntologyGraphRequest = new RequestType<{}, { nodes: any[]; edges: any[] }, void>(
            'ontology/getConceptGraph'
        );
        this.connection.onRequest(OntologyGraphRequest, async () => {
            return {
                nodes: [],
                edges: [],
            };
        });

        // Configuration changes
        this.connection.onDidChangeConfiguration(() => {
            log('Configuration changed - reloading...');
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
        // Avoid stdout logging in stdio mode
        console.error('Starting Ontology LSP Server...');
        // Connection starts listening automatically
    }

    /**
     * Shutdown the server
     */
    async shutdown(): Promise<void> {
        if (this.coreAnalyzer) {
            await this.coreAnalyzer.dispose();
        }
        console.error('Ontology LSP Server shut down');
    }
}

// Export singleton instance for compatibility
export const server = new LSPServer();

// Start server if run directly
if (import.meta.main) {
    server.start().catch(console.error);
}
