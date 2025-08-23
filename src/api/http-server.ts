// HTTP API Server for Ontology LSP
import { serve } from 'bun';
import { OntologyEngine } from '../ontology/ontology-engine';
import { PatternLearner } from '../patterns/pattern-learner';
import { KnowledgeSpreader } from '../propagation/knowledge-spreader';
import { ClaudeToolsLayer } from '../layers/claude-tools';
import { TreeSitterLayer } from '../layers/tree-sitter';
import { getEnvironmentConfig, type ServerConfig } from '../../mcp-ontology-server/src/config/server-config';
import * as path from 'path';
import * as fs from 'fs';

interface APIConfig {
    port?: number;
    host?: string;
    dbPath: string;
    workspaceRoot: string;
    cors?: boolean;
    useConfigDefaults?: boolean;
}

export class OntologyAPIServer {
    private ontology!: OntologyEngine;
    private patternLearner!: PatternLearner;
    private knowledgeSpreader!: KnowledgeSpreader;
    private claudeTools!: ClaudeToolsLayer;
    private treeSitter!: TreeSitterLayer;
    private config: APIConfig;
    private serverConfig: ServerConfig;
    private server: any = null;
    private initialized: boolean = false;

    constructor(config: APIConfig) {
        this.serverConfig = getEnvironmentConfig();
        this.config = {
            ...config,
            port: config.port ?? this.serverConfig.ports.httpAPI,
            host: config.host ?? this.serverConfig.host
        };
    }

    private async initializeLayers(): Promise<void> {
        try {
            const dbPath = this.config.dbPath || path.join(this.config.workspaceRoot, '.ontology', 'ontology.db');
            
            console.log(`[HTTP API] Initializing database at ${dbPath}`);
            
            // Create instances
            this.ontology = new OntologyEngine(dbPath);
            this.patternLearner = new PatternLearner(dbPath, {
                learningThreshold: 3,
                confidenceThreshold: 0.7
            });
            
            // Ensure async initialization completes
            await this.ontology.ensureInitialized();
            await this.patternLearner.ensureInitialized();
            
            this.knowledgeSpreader = new KnowledgeSpreader(this.ontology, this.patternLearner);
        
        const claudeConfig = {
            grep: {
                defaultTimeout: 100,
                maxResults: 100,
                caseSensitive: false,
                includeContext: true,
                contextLines: 3
            },
            glob: {
                defaultTimeout: 100,
                maxFiles: 1000,
                ignorePatterns: this.loadIgnorePatterns()
            },
            ls: {
                defaultTimeout: 100,
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
        
            this.claudeTools = new ClaudeToolsLayer(claudeConfig);
            this.treeSitter = new TreeSitterLayer({
                enabled: true,
                timeout: 500,
                languages: ['typescript', 'javascript', 'python'],
                maxFileSize: '1MB'
            });
            
            this.initialized = true;
            console.log('[HTTP API] All layers initialized successfully');
        } catch (error) {
            console.error('[HTTP API] Failed to initialize layers:', error);
            throw error;
        }
    }

    private loadIgnorePatterns(): string[] {
        const defaultPatterns = ['node_modules/**', '.git/**', 'dist/**', '*.min.js'];
        
        if (!this.config.workspaceRoot) {
            return defaultPatterns;
        }
        
        const ignoreFile = path.join(this.config.workspaceRoot, '.ontologyignore');
        
        if (!fs.existsSync(ignoreFile)) {
            return defaultPatterns;
        }
        
        try {
            const content = fs.readFileSync(ignoreFile, 'utf-8');
            const patterns = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            
            return [...defaultPatterns, ...patterns];
        } catch (error) {
            console.error('Error reading .ontologyignore:', error);
            return defaultPatterns;
        }
    }

    async start(): Promise<void> {
        try {
            // Initialize layers if not already done
            if (!this.initialized) {
                console.log('[HTTP API] Initializing layers...');
                await this.initializeLayers();
            }

            this.server = serve({
                port: this.config.port,
                hostname: this.config.host,
                fetch: this.handleRequest.bind(this),
                error: (error) => {
                    console.error('[HTTP API] Server error:', error);
                    return new Response('Internal Server Error', { status: 500 });
                },
            });

            console.log(`[HTTP API] Server running at http://${this.config.host}:${this.config.port}`);
            console.log(`[HTTP API] Health check: http://${this.config.host}:${this.config.port}/health`);
        } catch (error) {
            console.error('[HTTP API] Failed to start server:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.server) {
            console.log('[HTTP API] Stopping server...');
            this.server.stop();
            this.server = null;
            console.log('[HTTP API] Server stopped');
        }
    }

    private async handleRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method;
        
        // CORS headers
        const headers = this.config.cors ? {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };

        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers });
        }

        try {
            switch (url.pathname) {
                case '/stats':
                    if (method === 'GET') {
                        return this.handleGetStats(headers);
                    }
                    break;
                    
                case '/concepts':
                    if (method === 'GET') {
                        return this.handleGetConcepts(url, headers);
                    }
                    break;
                    
                case '/patterns':
                    if (method === 'GET') {
                        return this.handleGetPatterns(headers);
                    }
                    break;
                    
                case '/analyze':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleAnalyze(body, headers);
                    }
                    break;
                    
                case '/suggest':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleSuggest(body, headers);
                    }
                    break;
                    
                case '/export':
                    if (method === 'GET') {
                        return this.handleExport(headers);
                    }
                    break;
                    
                case '/import':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleImport(body, headers);
                    }
                    break;
                    
                case '/find':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleFind(body, headers);
                    }
                    break;
                    
                case '/definition':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleFindDefinition(body, headers);
                    }
                    break;
                    
                case '/references':
                    if (method === 'POST') {
                        const body = await request.json();
                        return this.handleFindReferences(body, headers);
                    }
                    break;
                    
                case '/health':
                    if (method === 'GET') {
                        return new Response(JSON.stringify({ status: 'healthy' }), { headers });
                    }
                    break;
                    
                default:
                    return new Response(JSON.stringify({ error: 'Not found' }), { 
                        status: 404, 
                        headers 
                    });
            }
        } catch (error: any) {
            return new Response(JSON.stringify({ error: error.message }), { 
                status: 500, 
                headers 
            });
        }

        return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405, 
            headers 
        });
    }

    private async handleGetStats(headers: any): Promise<Response> {
        const ontologyStats = this.ontology.getStatistics();
        const patternStats = await this.patternLearner.getStatistics();
        const propagationStats = this.knowledgeSpreader.getStatistics();
        
        const stats = {
            ontology: ontologyStats,
            patterns: patternStats,
            propagation: propagationStats,
            timestamp: new Date().toISOString(),
            workspace: this.config.workspaceRoot
        };
        
        return new Response(JSON.stringify(stats), { headers });
    }

    private async handleGetConcepts(url: URL, headers: any): Promise<Response> {
        const identifier = url.searchParams.get('identifier');
        
        if (identifier) {
            // Use strict mode for explicit API lookups - no inference
            const concept = await this.ontology.findConceptStrict(identifier);
            if (concept) {
                const response = {
                    id: concept.id,
                    canonicalName: concept.canonicalName,
                    representations: Array.from(concept.representations.keys()),
                    relations: Array.from(concept.relations.keys()),
                    confidence: concept.confidence,
                    metadata: concept.metadata
                };
                return new Response(JSON.stringify(response), { headers });
            }
            return new Response(JSON.stringify({ error: 'Concept not found' }), { 
                status: 404, 
                headers 
            });
        }
        
        // Return concept graph overview
        const stats = this.ontology.getStatistics();
        const graph = {
            nodes: [
                { id: 'root', label: 'Ontology', type: 'root', size: stats.totalConcepts }
            ],
            edges: [],
            stats: {
                totalConcepts: stats.totalConcepts,
                totalRelations: stats.totalRelations,
                averageConfidence: stats.averageConfidence
            }
        };
        
        return new Response(JSON.stringify(graph), { headers });
    }

    private async handleGetPatterns(headers: any): Promise<Response> {
        const stats = await this.patternLearner.getStatistics();
        
        const patterns = {
            totalPatterns: stats.totalPatterns,
            strongPatterns: stats.strongPatterns,
            recentLearning: stats.recentLearning,
            patterns: [],
            timestamp: new Date().toISOString()
        };
        
        return new Response(JSON.stringify(patterns), { headers });
    }

    private async handleAnalyze(body: any, headers: any): Promise<Response> {
        const { path: analyzePath = this.config.workspaceRoot } = body;
        
        // Analyze TypeScript/JavaScript files
        const tsFiles = await this.claudeTools.process({
            identifier: '',
            searchPath: analyzePath,
            globPattern: '**/*.{ts,tsx,js,jsx}'
        });
        
        // Analyze Python files
        const pyFiles = await this.claudeTools.process({
            identifier: '',
            searchPath: analyzePath,
            globPattern: '**/*.py'
        });
        
        const result = {
            filesAnalyzed: tsFiles.files.length + pyFiles.files.length,
            languages: ['typescript', 'javascript', 'python'],
            path: analyzePath,
            timestamp: new Date().toISOString()
        };
        
        return new Response(JSON.stringify(result), { headers });
    }

    private async handleFind(body: any, headers: any): Promise<Response> {
        const { identifier, fuzzy = false, semantic = false } = body;
        
        if (!identifier) {
            return new Response(JSON.stringify({ error: 'identifier is required' }), { 
                status: 400, 
                headers 
            });
        }
        
        // Use Claude Tools layer for fast initial search
        let claudeResults: any;
        try {
            claudeResults = await this.claudeTools.process({
                identifier,
                searchPath: this.config.workspaceRoot,
                globPattern: '**/*.{ts,tsx,js,jsx,py}'
            });
        } catch (error) {
            console.error('Claude tools error:', error);
            claudeResults = { files: [] };
        }
        
        // Ensure claudeResults has the expected structure
        if (!claudeResults || !Array.isArray(claudeResults.files)) {
            claudeResults = { files: [] };
        }
        
        // Use Tree-sitter for AST-based search if needed
        let astResults: any = { files: [] };
        if (semantic) {
            try {
                astResults = await this.treeSitter.process({
                    identifier,
                    searchPath: this.config.workspaceRoot,
                    globPattern: '**/*.{ts,tsx,js,jsx,py}'
                });
            } catch (error) {
                console.error('Tree-sitter error:', error);
                astResults = { files: [] };
            }
        }
        
        // Ensure astResults has the expected structure
        if (!astResults || !Array.isArray(astResults.files)) {
            astResults = { files: [] };
        }
        
        // Combine results
        const matches = {
            exact: claudeResults.files.map((f: any) => ({
                file: f.filePath || f.path || f,
                line: f.line || 0,
                column: f.column || 0,
                confidence: 1.0
            })),
            fuzzy: fuzzy ? [] : undefined,
            conceptual: semantic ? astResults.files.map((f: any) => ({
                file: f.filePath || f.path || f,
                line: f.line || 0,
                column: f.column || 0,
                confidence: f.confidence || 0.8
            })) : undefined
        };
        
        return new Response(JSON.stringify(matches), { headers });
    }

    private async handleFindDefinition(body: any, headers: any): Promise<Response> {
        const { symbol, fuzzy = true, semantic = true, file } = body;
        
        if (!symbol) {
            return new Response(JSON.stringify({ error: 'symbol is required' }), { 
                status: 400, 
                headers 
            });
        }
        
        const definitions: any[] = [];
        
        // Use Tree-sitter layer for AST-based definition search
        try {
            const astResult = await this.treeSitter.process({
                identifier: symbol,
                searchPath: file || this.config.workspaceRoot,
                operation: 'findDefinition'
            });
            
            if (astResult && astResult.definitions) {
                definitions.push(...astResult.definitions);
            }
        } catch (error) {
            console.error('Tree-sitter definition search error:', error);
        }
        
        // Use ontology for semantic search if enabled
        if (semantic) {
            const concept = this.ontology.getConcept(symbol);
            if (concept && concept.location) {
                definitions.push({
                    uri: concept.location.file,
                    range: {
                        start: { line: concept.location.line - 1, character: concept.location.column },
                        end: { line: concept.location.line - 1, character: concept.location.column + symbol.length }
                    },
                    confidence: 0.9,
                    source: 'ontology'
                });
            }
        }
        
        // Use fuzzy matching if enabled and no exact matches
        if (fuzzy && definitions.length === 0) {
            const fuzzyMatches = this.ontology.findSimilarConcepts(symbol, 0.7);
            for (const match of fuzzyMatches.slice(0, 5)) {
                if (match.location) {
                    definitions.push({
                        uri: match.location.file,
                        range: {
                            start: { line: match.location.line - 1, character: match.location.column },
                            end: { line: match.location.line - 1, character: match.location.column + match.name.length }
                        },
                        confidence: match.similarity,
                        source: 'fuzzy'
                    });
                }
            }
        }
        
        return new Response(JSON.stringify({ 
            definitions,
            layersUsed: ['tree-sitter', 'ontology'],
            executionTime: Date.now(),
            confidence: definitions.length > 0 ? Math.max(...definitions.map(d => d.confidence || 0.5)) : 0
        }), { headers });
    }
    
    private async handleFindReferences(body: any, headers: any): Promise<Response> {
        const { symbol, includeDeclaration = false, scope = 'workspace' } = body;
        
        if (!symbol) {
            return new Response(JSON.stringify({ error: 'symbol is required' }), { 
                status: 400, 
                headers 
            });
        }
        
        const references: any[] = [];
        
        // Use Tree-sitter for AST-based reference search
        try {
            const astResult = await this.treeSitter.process({
                identifier: symbol,
                searchPath: this.config.workspaceRoot,
                operation: 'findReferences',
                includeDeclaration,
                scope
            });
            
            if (astResult && astResult.references) {
                references.push(...astResult.references);
            }
        } catch (error) {
            console.error('Tree-sitter reference search error:', error);
        }
        
        // Use ontology to find concept relationships
        const concept = this.ontology.getConcept(symbol);
        if (concept) {
            const relationships = this.ontology.getRelationships(concept.id);
            
            for (const rel of relationships) {
                if (rel.type === 'references' || rel.type === 'uses') {
                    const targetConcept = this.ontology.getConcept(rel.target);
                    if (targetConcept && targetConcept.location) {
                        references.push({
                            uri: targetConcept.location.file,
                            range: {
                                start: { line: targetConcept.location.line - 1, character: targetConcept.location.column },
                                end: { line: targetConcept.location.line - 1, character: targetConcept.location.column + symbol.length }
                            },
                            kind: rel.type,
                            confidence: 0.85
                        });
                    }
                }
            }
        }
        
        // Remove duplicates based on uri and line
        const uniqueRefs = references.reduce((acc, ref) => {
            const key = `${ref.uri}:${ref.range.start.line}:${ref.range.start.character}`;
            if (!acc.has(key)) {
                acc.set(key, ref);
            }
            return acc;
        }, new Map());
        
        return new Response(JSON.stringify({ 
            references: Array.from(uniqueRefs.values()),
            layersUsed: ['tree-sitter', 'ontology'],
            executionTime: Date.now(),
            confidence: references.length > 0 ? 0.9 : 0
        }), { headers });
    }

    private async handleSuggest(body: any, headers: any): Promise<Response> {
        const { identifier } = body;
        
        if (!identifier) {
            return new Response(JSON.stringify({ error: 'identifier is required' }), { 
                status: 400, 
                headers 
            });
        }
        
        const predictions = await this.patternLearner.predictNextRename(identifier);
        
        const suggestions = predictions.map(p => ({
            original: p.original,
            suggested: p.suggested,
            confidence: p.confidence,
            reason: p.reason,
            patternId: p.pattern.id
        }));
        
        return new Response(JSON.stringify({ suggestions }), { headers });
    }

    private async handleExport(headers: any): Promise<Response> {
        const stats = this.ontology.getStatistics();
        const patternStats = await this.patternLearner.getStatistics();
        
        // Export full ontology data
        const exportData = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            workspace: this.config.workspaceRoot,
            statistics: {
                ontology: stats,
                patterns: patternStats
            },
            concepts: await this.exportConcepts(),
            patterns: await this.exportPatterns(),
            configuration: {
                ignorePatterns: this.loadIgnorePatterns()
            }
        };
        
        return new Response(JSON.stringify(exportData), { headers });
    }

    private async handleImport(body: any, headers: any): Promise<Response> {
        const { data } = body;
        
        if (!data || !data.version) {
            return new Response(JSON.stringify({ error: 'Invalid import data' }), { 
                status: 400, 
                headers 
            });
        }
        
        try {
            // Import concepts
            if (data.concepts && Array.isArray(data.concepts)) {
                for (const concept of data.concepts) {
                    await this.ontology.importConcept(concept);
                }
            }
            
            // Import patterns
            if (data.patterns && Array.isArray(data.patterns)) {
                for (const pattern of data.patterns) {
                    await this.patternLearner.importPattern(pattern);
                }
            }
            
            const result = {
                success: true,
                imported: {
                    concepts: data.concepts?.length || 0,
                    patterns: data.patterns?.length || 0
                },
                timestamp: new Date().toISOString()
            };
            
            return new Response(JSON.stringify(result), { headers });
        } catch (error: any) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: error.message 
            }), { 
                status: 500, 
                headers 
            });
        }
    }

    private async exportConcepts(): Promise<any[]> {
        // This would need to be implemented in OntologyEngine
        // For now, return empty array
        return [];
    }

    private async exportPatterns(): Promise<any[]> {
        // This would need to be implemented in PatternLearner
        // For now, return empty array
        return [];
    }
}

// CLI support for starting the API server
if (import.meta.main) {
    const config: APIConfig = {
        port: parseInt(process.env.ONTOLOGY_API_PORT || '7000'),
        host: process.env.ONTOLOGY_API_HOST || 'localhost',
        dbPath: process.env.ONTOLOGY_DB_PATH || '.ontology/ontology.db',
        workspaceRoot: process.env.ONTOLOGY_WORKSPACE || process.cwd(),
        cors: process.env.ONTOLOGY_API_CORS === 'true'
    };
    
    console.log('[HTTP API] Starting with config:', {
        ...config,
        dbPath: config.dbPath // Show full path for debugging
    });
    
    const server = new OntologyAPIServer(config);
    
    // Start server and handle errors
    server.start().catch((error) => {
        console.error('[HTTP API] Fatal error:', error);
        process.exit(1);
    });
    
    // Handle graceful shutdown
    const shutdown = async () => {
        console.log('\n[HTTP API] Received shutdown signal');
        await server.stop();
        process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Keep the process alive
    process.on('uncaughtException', (error) => {
        console.error('[HTTP API] Uncaught exception:', error);
        shutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[HTTP API] Unhandled rejection at:', promise, 'reason:', reason);
        shutdown();
    });
}