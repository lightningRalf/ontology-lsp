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

        // Custom requests (lightweight stubs for integration tests)
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

        // New: Build Symbol Map (Layer 3 targeted map)
        const BuildSymbolMapRequest = new RequestType<
            { symbol: string; uri?: string; maxFiles?: number; astOnly?: boolean },
            { identifier: string; files: number; declarations: any[]; references: any[]; imports: any[]; exports: any[] },
            void
        >('symbol/buildSymbolMap');
        this.connection.onRequest(BuildSymbolMapRequest, async (params) => {
            const res = await (this.coreAnalyzer as any).buildSymbolMap({
                identifier: params.symbol,
                uri: params.uri,
                maxFiles: params.maxFiles ?? 10,
                astOnly: params.astOnly ?? true,
            });
            return res;
        });

        // New: Plan Rename (preview WorkspaceEdit)
        const PlanRenameRequest = new RequestType<
            { oldName: string; newName: string; uri?: string },
            { changes: Record<string, any[]>; summary?: { filesAffected: number; totalEdits: number } },
            void
        >('refactor/planRename');
        this.connection.onRequest(PlanRenameRequest, async (params) => {
            const result = await this.coreAnalyzer.rename({
                uri: params.uri || (this.coreAnalyzer as any)?.config?.workspaceRoot || 'file://workspace',
                position: { line: 0, character: 0 },
                identifier: params.oldName,
                newName: params.newName,
                dryRun: true,
            } as any);
            const changes = result.data.changes || {};
            const files = Object.keys(changes).length;
            const total = Object.values(changes).reduce((acc: number, arr: any) => acc + (arr as any[]).length, 0);
            return { changes, summary: { filesAffected: files, totalEdits: total } } as any;
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
        // Custom precise references request
        const PreciseReferencesRequest = new RequestType<
            { uri: string; position?: { line: number; character: number }; symbol?: string; maxResults?: number; includeDeclaration?: boolean },
            { locations: Location[]; count: number },
            void
        >('ontology/preciseReferences');

        this.connection.onRequest(PreciseReferencesRequest, async (params) => {
            if (!this.initialized) throw new Error('Server not initialized');
            const uri = params.uri;
            const position = params.position || { line: 0, character: 0 };
            const identifier = params.symbol || this.lspAdapter.extractIdentifierAtPosition(uri, position);
            const req = buildFindReferencesRequest({
                uri,
                position,
                identifier,
                maxResults: params.maxResults ?? this.lspAdapter['config'].maxResults,
                includeDeclaration: params.includeDeclaration ?? false,
                precise: true,
            } as any);
            const result = await (this.coreAnalyzer as any).findReferencesAsync(req);
            return { locations: result.data.map((r:any)=> referenceToLspLocation(r)), count: result.data.length };
        });

        // Custom precise definition request
        const PreciseDefinitionRequest = new RequestType<
            { uri: string; position?: { line: number; character: number }; symbol?: string; maxResults?: number },
            { locations: Location[]; count: number },
            void
        >('ontology/preciseDefinition');

        this.connection.onRequest(PreciseDefinitionRequest, async (params) => {
            if (!this.initialized) throw new Error('Server not initialized');
            const uri = params.uri;
            const position = params.position || { line: 0, character: 0 };
            const identifier = params.symbol || this.lspAdapter.extractIdentifierAtPosition(uri, position);
            const req = buildFindDefinitionRequest({
                uri,
                position,
                identifier,
                maxResults: params.maxResults ?? this.lspAdapter['config'].maxResults,
                includeDeclaration: true,
                precise: true,
            } as any);
            const result = await (this.coreAnalyzer as any).findDefinitionAsync(req);
            return { locations: result.data.map((d:any)=> definitionToLspLocation(d)), count: result.data.length };
        });
