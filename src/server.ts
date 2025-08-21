// Ontology-Enhanced LSP Server - Main entry point
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    RenameParams,
    WorkspaceEdit,
    Location,
    Position,
    DefinitionParams,
    ReferenceParams,
    PrepareRenameParams,
    Range
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Import our layers and systems
import { ClaudeToolsLayer } from './layers/claude-tools.js';
import { TreeSitterLayer } from './layers/tree-sitter.js';
import { OntologyEngine } from './ontology/ontology-engine.js';
import { PatternLearner } from './patterns/pattern-learner.js';
import { KnowledgeSpreader } from './propagation/knowledge-spreader.js';

// Import types
import { 
    SearchQuery, EnhancedMatches, RequestContext, RefactorResult,
    Change, Config
} from './types/core.js';

import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export class OntologyLSPServer {
    private connection = createConnection(ProposedFeatures.all);
    private documents = new TextDocuments(TextDocument);
    private hasConfigurationCapability = false;
    private hasWorkspaceFolderCapability = false;
    private hasDiagnosticRelatedInformationCapability = false;
    
    // Our enhanced layers
    private claudeTools!: ClaudeToolsLayer;
    private treeSitter!: TreeSitterLayer;
    private ontology!: OntologyEngine;
    private patternLearner!: PatternLearner;
    private knowledgeSpreader!: KnowledgeSpreader;
    
    // Configuration
    private globalSettings: Config = this.getDefaultSettings();
    private documentSettings = new Map<string, Thenable<Config>>();
    
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
    
    constructor() {
        this.setupServer();
        this.initializeLayers();
    }
    
    private setupServer(): void {
        // Make the text document manager listen on the connection
        this.documents.listen(this.connection);
        
        // Setup event handlers
        this.connection.onInitialize(this.onInitialize.bind(this));
        this.connection.onInitialized(this.onInitialized.bind(this));
        this.connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
        
        // LSP method handlers
        this.connection.onDefinition(this.onDefinition.bind(this));
        this.connection.onReferences(this.onReferences.bind(this));
        this.connection.onPrepareRename(this.onPrepareRename.bind(this));
        this.connection.onRenameRequest(this.onRename.bind(this));
        this.connection.onCompletion(this.onCompletion.bind(this));
        
        // Custom method handlers
        this.connection.onRequest('ontology/findConcept', this.onFindConcept.bind(this));
        this.connection.onRequest('ontology/suggestRefactor', this.onSuggestRefactor.bind(this));
        this.connection.onRequest('ontology/getStatistics', this.onGetStatistics.bind(this));
        this.connection.onRequest('ontology/learnPattern', this.onLearnPattern.bind(this));
        
        // Document change handlers
        this.documents.onDidChangeContent(this.onDocumentChange.bind(this));
        this.documents.onDidClose(this.onDocumentClose.bind(this));
    }
    
    private async initializeLayers(): Promise<void> {
        const workspaceFolder = this.getWorkspaceFolder();
        const dbPath = path.join(workspaceFolder, '.ontology', 'ontology.db');
        
        // Initialize layers
        const claudeToolsConfig = {
            grep: {
                defaultTimeout: this.globalSettings.layers.claude_tools.timeout,
                maxResults: this.globalSettings.layers.claude_tools.maxResults,
                caseSensitive: false,
                includeContext: true,
                contextLines: 3
            },
            glob: {
                defaultTimeout: this.globalSettings.layers.claude_tools.timeout,
                maxFiles: 1000,
                ignorePatterns: ['node_modules/**', '.git/**']
            },
            ls: {
                defaultTimeout: this.globalSettings.layers.claude_tools.timeout,
                maxDepth: 10,
                followSymlinks: false,
                includeDotfiles: false
            },
            optimization: {
                bloomFilter: true,
                frequencyCache: true,
                recentSearches: true,
                negativeLookup: true
            },
            caching: {
                enabled: true,
                ttl: 3600,
                maxEntries: 1000
            }
        };
        
        this.claudeTools = new ClaudeToolsLayer(claudeToolsConfig);
        this.treeSitter = new TreeSitterLayer(this.globalSettings.layers.tree_sitter);
        this.ontology = new OntologyEngine(dbPath);
        this.patternLearner = new PatternLearner(dbPath, {
            learningThreshold: this.globalSettings.layers.patterns.learningThreshold,
            confidenceThreshold: this.globalSettings.layers.patterns.confidenceThreshold
        });
        this.knowledgeSpreader = new KnowledgeSpreader(this.ontology, this.patternLearner);
        
        // Setup event listeners
        this.patternLearner.on('patternCreated', (pattern) => {
            this.connection.console.log(`New pattern learned: ${pattern.id}`);
        });
        
        this.knowledgeSpreader.on('propagationCompleted', (result) => {
            this.connection.console.log(`Propagated change to ${result.suggestions.length} concepts`);
        });
    }
    
    private onInitialize(params: InitializeParams): InitializeResult {
        const capabilities = params.capabilities;
        
        // Does the client support the `workspace/configuration` request?
        this.hasConfigurationCapability = !!(
            capabilities.workspace && !!capabilities.workspace.configuration
        );
        this.hasWorkspaceFolderCapability = !!(
            capabilities.workspace && !!capabilities.workspace.workspaceFolders
        );
        this.hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );
        
        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                
                // Enhanced definition with fuzzy matching
                definitionProvider: true,
                
                // Enhanced references with conceptual links
                referencesProvider: true,
                
                // Smart rename with pattern learning and propagation
                renameProvider: {
                    prepareProvider: true
                },
                
                // Predictive completion
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ['.', '"', "'", '/', '@', '<']
                }
            }
        };
        
        if (this.hasWorkspaceFolderCapability) {
            result.capabilities.workspace = {
                workspaceFolders: {
                    supported: true
                }
            };
        }
        
        return result;
    }
    
    private async onInitialized(): Promise<void> {
        if (this.hasConfigurationCapability) {
            // Register for all configuration changes
            this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
        }
        
        if (this.hasWorkspaceFolderCapability) {
            this.connection.workspace.onDidChangeWorkspaceFolders(_event => {
                this.connection.console.log('Workspace folder change event received.');
            });
        }
        
        this.connection.console.log('Ontology LSP Server initialized');
    }
    
    private async onDidChangeConfiguration(change: any): Promise<void> {
        if (this.hasConfigurationCapability) {
            // Reset all cached document settings
            this.documentSettings.clear();
        } else {
            this.globalSettings = <Config>(
                (change.settings.ontologyLSP || this.getDefaultSettings())
            );
        }
        
        // Revalidate all open text documents
        this.documents.all().forEach(this.validateTextDocument.bind(this));
    }
    
    private getDocumentSettings(resource: string): Thenable<Config> {
        if (!this.hasConfigurationCapability) {
            return Promise.resolve(this.globalSettings);
        }
        
        let result = this.documentSettings.get(resource);
        if (!result) {
            result = this.connection.workspace.getConfiguration({
                scopeUri: resource,
                section: 'ontologyLSP'
            });
            this.documentSettings.set(resource, result);
        }
        
        return result;
    }
    
    // Enhanced LSP method implementations
    
    private async onDefinition(params: DefinitionParams): Promise<Location[] | null> {
        const context = this.createRequestContext('textDocument/definition', params);
        
        try {
            const document = this.documents.get(params.textDocument.uri);
            if (!document) return null;
            
            const symbol = this.getSymbolAtPosition(document, params.position);
            if (!symbol) return null;
            
            // Layer 1: Fast grep search
            const searchQuery: SearchQuery = {
                identifier: symbol,
                searchPath: this.getWorkspaceFolder(),
                fileTypes: ['ts', 'tsx', 'js', 'jsx']
            };
            
            const grepResults = await this.claudeTools.process(searchQuery);
            context.grepResults = grepResults.exact.concat(grepResults.fuzzy);
            
            // Layer 2: Tree-sitter analysis for precise context
            const treeResults = await this.treeSitter.process(grepResults);
            context.astNodes = treeResults.nodes;
            
            // Layer 3: Ontology concept lookup
            const concept = await this.ontology.findConcept(symbol);
            context.concept = concept;
            
            // Build enhanced definition results
            const locations: Location[] = [];
            
            // Add exact matches with high confidence
            for (const match of grepResults.exact) {
                locations.push({
                    uri: `file://${match.file}`,
                    range: {
                        start: { line: match.line - 1, character: match.column },
                        end: { line: match.line - 1, character: match.column + match.length }
                    }
                });
            }
            
            // Add fuzzy matches if no exact matches found
            if (locations.length === 0) {
                for (const match of grepResults.fuzzy.slice(0, 5)) {
                    locations.push({
                        uri: `file://${match.file}`,
                        range: {
                            start: { line: match.line - 1, character: match.column },
                            end: { line: match.line - 1, character: match.column + match.length }
                        }
                    });
                }
            }
            
            // Add related concept definitions
            if (concept) {
                const related = this.ontology.getRelatedConcepts(concept.id, 1);
                for (const rel of related.slice(0, 3)) { // Limit to top 3
                    for (const [name, rep] of rel.concept.representations) {
                        locations.push({
                            uri: rep.location.uri,
                            range: rep.location.range
                        });
                    }
                }
            }
            
            return locations.length > 0 ? locations : null;
            
        } catch (error) {
            this.connection.console.error(`Definition failed: ${this.getErrorMessage(error)}`);
            return null;
        }
    }
    
    private async onReferences(params: ReferenceParams): Promise<Location[] | null> {
        const context = this.createRequestContext('textDocument/references', params);
        
        try {
            const document = this.documents.get(params.textDocument.uri);
            if (!document) return null;
            
            const symbol = this.getSymbolAtPosition(document, params.position);
            if (!symbol) return null;
            
            // Use all layers to find comprehensive references
            const searchQuery: SearchQuery = {
                identifier: symbol,
                searchPath: this.getWorkspaceFolder(),
                fileTypes: ['ts', 'tsx', 'js', 'jsx'],
                includeTests: true
            };
            
            const grepResults = await this.claudeTools.process(searchQuery);
            const treeResults = await this.treeSitter.process(grepResults);
            const concept = await this.ontology.findConcept(symbol);
            
            const locations: Location[] = [];
            
            // Add all matches with confidence ranking
            const allMatches = [
                ...grepResults.exact.map(m => ({ ...m, priority: 3 })),
                ...grepResults.fuzzy.map(m => ({ ...m, priority: 2 })),
                ...grepResults.conceptual.map(m => ({ ...m, priority: 1 }))
            ];
            
            // Sort by priority and confidence
            allMatches.sort((a, b) => {
                if (a.priority !== b.priority) return b.priority - a.priority;
                return b.confidence - a.confidence;
            });
            
            for (const match of allMatches.slice(0, 50)) { // Limit results
                locations.push({
                    uri: `file://${match.file}`,
                    range: {
                        start: { line: match.line - 1, character: match.column },
                        end: { line: match.line - 1, character: match.column + match.length }
                    }
                });
            }
            
            return locations;
            
        } catch (error) {
            this.connection.console.error(`References failed: ${this.getErrorMessage(error)}`);
            return null;
        }
    }
    
    private async onPrepareRename(params: PrepareRenameParams): Promise<Range | { range: Range; placeholder: string } | null> {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) return null;
        
        const symbol = this.getSymbolAtPosition(document, params.position);
        if (!symbol) return null;
        
        // Check if symbol exists in ontology or can be found
        const concept = await this.ontology.findConcept(symbol);
        if (!concept) {
            // Try a quick search to see if it exists
            const searchQuery: SearchQuery = {
                identifier: symbol,
                searchPath: this.getWorkspaceFolder()
            };
            
            const results = await this.claudeTools.process(searchQuery);
            if (results.exact.length === 0 && results.fuzzy.length === 0) {
                return null; // Symbol not found
            }
        }
        
        // Create range for the symbol
        const line = params.position.line;
        const start = Math.max(0, params.position.character - symbol.length);
        const end = params.position.character + symbol.length;
        
        return {
            range: {
                start: { line, character: start },
                end: { line, character: end }
            },
            placeholder: symbol
        };
    }
    
    private async onRename(params: RenameParams): Promise<WorkspaceEdit | null> {
        const context = this.createRequestContext('textDocument/rename', params);
        
        try {
            const document = this.documents.get(params.textDocument.uri);
            if (!document) return null;
            
            const oldSymbol = this.getSymbolAtPosition(document, params.position);
            if (!oldSymbol) return null;
            
            const newSymbol = params.newName;
            
            // Find all instances to rename using our enhanced search
            const searchQuery: SearchQuery = {
                identifier: oldSymbol,
                searchPath: this.getWorkspaceFolder(),
                fileTypes: ['ts', 'tsx', 'js', 'jsx'],
                includeTests: true
            };
            
            const grepResults = await this.claudeTools.process(searchQuery);
            const treeResults = await this.treeSitter.process(grepResults);
            const concept = await this.ontology.findConcept(oldSymbol);
            
            // Learn from this rename
            const renameContext = {
                file: params.textDocument.uri,
                concept,
                surroundingSymbols: await this.getSurroundingSymbols(document, params.position),
                timestamp: new Date()
            };
            
            await this.patternLearner.learnFromRename(oldSymbol, newSymbol, renameContext);
            
            // Generate workspace edit
            const edit: WorkspaceEdit = { changes: {} };
            
            // Add all instances to rename
            const allInstances = [
                ...grepResults.exact,
                ...grepResults.fuzzy.filter(m => m.confidence > 0.7),
                ...grepResults.conceptual.filter(m => m.confidence > 0.5)
            ];
            
            for (const instance of allInstances) {
                const uri = `file://${instance.file}`;
                
                if (!edit.changes![uri]) {
                    edit.changes![uri] = [];
                }
                
                edit.changes![uri].push({
                    range: {
                        start: { line: instance.line - 1, character: instance.column },
                        end: { line: instance.line - 1, character: instance.column + instance.length }
                    },
                    newText: newSymbol
                });
            }
            
            // Propagate change to related concepts
            const change: Change = {
                type: 'rename',
                identifier: oldSymbol,
                from: oldSymbol,
                to: newSymbol,
                location: params.textDocument.uri,
                source: 'user_action',
                timestamp: new Date()
            };
            
            const suggestions = await this.knowledgeSpreader.propagateChange(change);
            
            // Add high-confidence suggestions as additional changes
            for (const suggestion of suggestions) {
                if (suggestion.autoApply && suggestion.confidence > 0.8) {
                    // Find instances of the target to rename
                    const targetQuery: SearchQuery = {
                        identifier: suggestion.target,
                        searchPath: this.getWorkspaceFolder()
                    };
                    
                    const targetResults = await this.claudeTools.process(targetQuery);
                    
                    for (const targetMatch of targetResults.exact) {
                        const targetUri = `file://${targetMatch.file}`;
                        
                        if (!edit.changes![targetUri]) {
                            edit.changes![targetUri] = [];
                        }
                        
                        edit.changes![targetUri].push({
                            range: {
                                start: { line: targetMatch.line - 1, character: targetMatch.column },
                                end: { line: targetMatch.line - 1, character: targetMatch.column + targetMatch.length }
                            },
                            newText: suggestion.suggestion
                        });
                    }
                }
            }
            
            // Show suggestions to user for manual review
            if (suggestions.length > 0) {
                this.connection.window.showInformationMessage(
                    `Found ${suggestions.length} related concepts that might need renaming. Check the Problems panel for details.`
                );
                
                // Send suggestions as diagnostics
                for (const suggestion of suggestions.filter(s => !s.autoApply)) {
                    this.showSuggestionDiagnostic(suggestion);
                }
            }
            
            return edit;
            
        } catch (error) {
            this.connection.console.error(`Rename failed: ${this.getErrorMessage(error)}`);
            return null;
        }
    }
    
    private async onCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
        const document = this.documents.get(params.textDocument.uri);
        if (!document) return null;
        
        const context = this.getCompletionContext(document, params.position);
        
        // Get pattern-based predictions
        const predictions = await this.patternLearner.predictNextRename(context.currentWord, {
            recentRenames: await this.getRecentRenames()
        });
        
        const completions: CompletionItem[] = [];
        
        for (const prediction of predictions.slice(0, 10)) {
            completions.push({
                label: prediction.suggested,
                kind: CompletionItemKind.Text,
                detail: prediction.reason,
                documentation: `Confidence: ${(prediction.confidence * 100).toFixed(0)}%`,
                sortText: `${1 - prediction.confidence}${prediction.suggested}` // Higher confidence = earlier sort
            });
        }
        
        return completions;
    }
    
    // Custom method implementations
    
    private async onFindConcept(params: { identifier: string }): Promise<any> {
        const concept = await this.ontology.findConcept(params.identifier);
        
        if (concept) {
            return {
                id: concept.id,
                canonicalName: concept.canonicalName,
                representations: Array.from(concept.representations.keys()),
                relations: Array.from(concept.relations.keys()),
                confidence: concept.confidence,
                metadata: concept.metadata
            };
        }
        
        return null;
    }
    
    private async onSuggestRefactor(params: { identifier: string }): Promise<any> {
        const predictions = await this.patternLearner.predictNextRename(params.identifier);
        
        return predictions.map(p => ({
            original: p.original,
            suggested: p.suggested,
            confidence: p.confidence,
            reason: p.reason,
            patternId: p.pattern.id
        }));
    }
    
    private async onGetStatistics(): Promise<any> {
        const ontologyStats = this.ontology.getStatistics();
        const patternStats = await this.patternLearner.getStatistics();
        const propagationStats = this.knowledgeSpreader.getStatistics();
        
        return {
            ontology: ontologyStats,
            patterns: patternStats,
            propagation: propagationStats,
            timestamp: new Date().toISOString()
        };
    }
    
    private async onLearnPattern(params: { 
        oldName: string; 
        newName: string; 
        context: any 
    }): Promise<any> {
        const result = await this.patternLearner.learnFromRename(
            params.oldName,
            params.newName,
            params.context
        );
        
        return {
            learned: !!result.pattern,
            strengthened: result.strengthened,
            newCandidate: result.newCandidate,
            patternId: result.pattern?.id
        };
    }
    
    // Document event handlers
    
    private async onDocumentChange(change: any): Promise<void> {
        // Validate the document
        await this.validateTextDocument(change.document);
        
        // Update ontology with any new concepts
        // This would be done in the background
    }
    
    private async onDocumentClose(event: any): Promise<void> {
        this.documentSettings.delete(event.document.uri);
    }
    
    // Utility methods
    
    private createRequestContext(method: string, params: any): RequestContext {
        return {
            id: uuidv4(),
            timestamp: new Date(),
            method,
            params
        };
    }
    
    private getSymbolAtPosition(document: TextDocument, position: Position): string | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line + 1, character: 0 }
        });
        
        const match = line.match(/\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\b/g);
        if (!match) return null;
        
        // Find the symbol at the position
        let currentPos = 0;
        for (const symbol of match) {
            const symbolStart = line.indexOf(symbol, currentPos);
            const symbolEnd = symbolStart + symbol.length;
            
            if (symbolStart <= position.character && position.character <= symbolEnd) {
                return symbol;
            }
            
            currentPos = symbolEnd;
        }
        
        return null;
    }
    
    private async getSurroundingSymbols(document: TextDocument, position: Position): Promise<string[]> {
        const surrounding: string[] = [];
        
        // Get a few lines around the position
        const startLine = Math.max(0, position.line - 2);
        const endLine = Math.min(document.lineCount, position.line + 3);
        
        for (let i = startLine; i < endLine; i++) {
            const line = document.getText({
                start: { line: i, character: 0 },
                end: { line: i + 1, character: 0 }
            });
            
            const symbols = line.match(/\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\b/g);
            if (symbols) {
                surrounding.push(...symbols);
            }
        }
        
        return [...new Set(surrounding)]; // Remove duplicates
    }
    
    private getCompletionContext(document: TextDocument, position: Position): {
        currentWord: string;
        previousWord: string | null;
        context: string;
    } {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: position.character }
        });
        
        const words = line.match(/\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\b/g) || [];
        const currentWord = words[words.length - 1] || '';
        const previousWord = words.length > 1 ? words[words.length - 2] : null;
        
        return {
            currentWord,
            previousWord,
            context: line.trim()
        };
    }
    
    private async getRecentRenames(): Promise<Array<{ from: string; to: string; timestamp: Date }>> {
        // This would get recent renames from history
        return [];
    }
    
    private getWorkspaceFolder(): string {
        // Get the workspace folder path
        return process.cwd();
    }
    
    private async validateTextDocument(textDocument: TextDocument): Promise<void> {
        // Document validation logic would go here
        // For now, just send empty diagnostics
        this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    }
    
    private showSuggestionDiagnostic(suggestion: any): void {
        // Show suggestion as diagnostic
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Information,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 }
            },
            message: `Suggestion: Rename '${suggestion.target}' to '${suggestion.suggestion}' (${suggestion.reason})`,
            source: 'ontology-lsp'
        };
        
        // Would need to track diagnostics per document
        // this.connection.sendDiagnostics({ uri: documentUri, diagnostics: [diagnostic] });
    }
    
    private getDefaultSettings(): Config {
        return {
            layers: {
                claude_tools: {
                    enabled: true,
                    timeout: 100,
                    maxResults: 100,
                    fileTypes: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rust']
                },
                tree_sitter: {
                    enabled: true,
                    timeout: 500,
                    languages: ['typescript', 'javascript', 'python'],
                    maxFileSize: '1MB'
                },
                ontology: {
                    enabled: true,
                    dbPath: '.ontology/ontology.db',
                    cacheSize: 1000
                },
                patterns: {
                    enabled: true,
                    learningThreshold: 3,
                    confidenceThreshold: 0.7,
                    maxPatterns: 1000
                },
                propagation: {
                    enabled: true,
                    maxDepth: 3,
                    autoApplyThreshold: 0.9
                }
            },
            performance: {
                caching: {
                    memory: { maxSize: '500MB', ttl: 3600 },
                    disk: { enabled: true, path: '.ontology/cache', maxSize: '2GB' }
                },
                parallelism: { workers: 4, batchSize: 100 },
                indexing: { incremental: true, watchDebounce: 500 }
            },
            search: {
                fuzzy: {
                    editDistanceThreshold: 3,
                    tokenOverlapThreshold: 0.5,
                    semanticSimilarityThreshold: 0.7
                },
                context: {
                    windowSize: 3,
                    includeComments: true,
                    includeStrings: false
                }
            },
            patterns: {
                synonyms: {
                    get: ['fetch', 'retrieve', 'load', 'obtain'],
                    set: ['update', 'modify', 'change', 'assign'],
                    create: ['make', 'build', 'generate', 'produce'],
                    delete: ['remove', 'destroy', 'eliminate']
                },
                transformations: {
                    camelCase: true,
                    snake_case: true,
                    PascalCase: true,
                    'kebab-case': true
                }
            },
            monitoring: {
                metrics: { enabled: true },
                logging: { level: 'info', format: 'json' }
            }
        };
    }
    
    start(): void {
        // Listen on the connection
        this.connection.listen();
    }
}

// Create and start server
const server = new OntologyLSPServer();
server.start();