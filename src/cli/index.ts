#!/usr/bin/env bun

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as yaml from 'js-yaml';
import { OntologyAPIServer } from '../api/http-server';
import { Database } from 'bun:sqlite';

// LSP Client for connecting to running server
class LSPClient {
    private apiUrl: string;
    
    constructor(port: number = 7000) {
        this.apiUrl = `http://localhost:${port}`;
    }
    
    async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const response = await fetch(`${this.apiUrl}${endpoint}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined
        });
        
        if (!response.ok) {
            throw new Error(`LSP Server error: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async analyze(path: string) {
        return this.request('/analyze', 'POST', { path });
    }
    
    async find(identifier: string, options: any = {}) {
        return this.request('/find', 'POST', { identifier, ...options });
    }
    
    async getStats() {
        return this.request('/stats');
    }
    
    async suggest(identifier: string, confidence: number = 0.7) {
        return this.request('/suggest', 'POST', { identifier, confidence });
    }
    
    async exportData() {
        return this.request('/export');
    }
    
    async importData(data: any) {
        return this.request('/import', 'POST', data);
    }
    
    async isRunning(): Promise<boolean> {
        try {
            await this.request('/health');
            return true;
        } catch {
            return false;
        }
    }
}

const program = new Command();

program
    .name('ontology-lsp')
    .description('Ontology-Enhanced LSP Proxy CLI')
    .version('1.0.0');

// Init command
program
    .command('init')
    .description('Initialize ontology LSP in current directory')
    .option('--force', 'Overwrite existing configuration')
    .action(async (options) => {
        console.log('🚀 Initializing Ontology LSP...');
        
        const configPath = '.ontology-lsp-config.yaml';
        
        if (fs.existsSync(configPath) && !options.force) {
            console.error('❌ Configuration already exists. Use --force to overwrite.');
            process.exit(1);
        }
        
        const defaultConfig = {
            version: '1.0.0',
            layers: {
                claude_tools: {
                    enabled: true,
                    timeout: 100,
                    maxResults: 100,
                    fileTypes: ['ts', 'tsx', 'js', 'jsx', 'py']
                },
                tree_sitter: {
                    enabled: true,
                    timeout: 500,
                    languages: ['typescript', 'javascript', 'python'],
                    maxFileSize: '1MB'
                },
                ontology: {
                    enabled: true,
                    dbPath: '.ontology/concepts.db',
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
                    memory: {
                        maxSize: '500MB',
                        ttl: 3600
                    },
                    disk: {
                        enabled: true,
                        path: '.ontology/cache',
                        maxSize: '2GB'
                    }
                },
                parallelism: {
                    workers: 2,
                    batchSize: 100
                }
            }
        };
        
        fs.writeFileSync(configPath, yaml.dump(defaultConfig));
        
        // Create directories
        fs.mkdirSync('.ontology', { recursive: true });
        fs.mkdirSync('.ontology/cache', { recursive: true });
        
        console.log('✅ Configuration created at', configPath);
        console.log('✅ Created .ontology directory');
        console.log('\nNext steps:');
        console.log('  1. Run "ontology-lsp start" to start the server');
        console.log('  2. Configure your editor to use the LSP');
    });

// Start command
program
    .command('start')
    .description('Start the LSP server')
    .option('-p, --port <port>', 'Port to listen on', '7000')
    .option('--stdio', 'Use stdio instead of TCP')
    .option('--verbose', 'Enable verbose logging')
    .action((options) => {
        console.log('🚀 Starting Ontology LSP Server...');
        
        const serverPath = path.join(__dirname, '../../dist/server.js');
        
        const args = [];
        if (options.stdio) {
            args.push('--stdio');
        } else {
            args.push('--port', options.port);
        }
        
        if (options.verbose) {
            process.env.DEBUG = 'ontology-lsp:*';
        }
        
        const server = spawn('bun', ['run', serverPath, ...args], {
            stdio: 'inherit',
            env: { ...process.env }
        });
        
        server.on('error', (err) => {
            console.error('❌ Failed to start server:', err);
            process.exit(1);
        });
        
        server.on('exit', (code) => {
            if (code !== 0) {
                console.error(`❌ Server exited with code ${code}`);
                process.exit(code || 1);
            }
        });
        
        console.log(`✅ Server started ${options.stdio ? 'in stdio mode' : `on port ${options.port}`}`);
    });

// Analyze command
program
    .command('analyze [path]')
    .description('Analyze codebase and build ontology')
    .option('-o, --output <format>', 'Output format (json, yaml, text)', 'text')
    .option('--json', 'Shorthand for --output json')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (searchPath = '.', options) => {
        const outputFormat = options.json ? 'json' : options.output;
        
        if (outputFormat !== 'json') {
            console.log(`🔍 Analyzing ${searchPath}...`);
        }
        
        const client = new LSPClient(parseInt(options.port));
        
        // Check if server is running
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (outputFormat === 'json') {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const stats = await client.analyze(searchPath);
            
            if (outputFormat === 'json') {
                console.log(JSON.stringify(stats, null, 2));
            } else if (outputFormat === 'yaml') {
                console.log(yaml.dump(stats));
            } else {
                console.log(`✅ Analysis complete`);
                console.log(`  Files analyzed: ${stats.filesAnalyzed}`);
                console.log(`  Concepts found: ${stats.conceptsFound}`);
            }
        } catch (error) {
            if (outputFormat === 'json') {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Stats command
program
    .command('stats')
    .description('Show ontology statistics')
    .option('--patterns', 'Show pattern statistics')
    .option('--concepts', 'Show concept statistics')
    .option('--json', 'Output as JSON')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (options) => {
        const client = new LSPClient(parseInt(options.port));
        
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const stats = await client.getStats();
            
            if (options.json) {
                const filtered = {};
                if (options.patterns) filtered.patterns = stats.patterns;
                if (options.concepts) filtered.ontology = stats.ontology;
                if (!options.patterns && !options.concepts) Object.assign(filtered, stats);
                
                console.log(JSON.stringify(filtered, null, 2));
            } else {
                if (options.patterns) {
                    console.log('\n📊 Pattern Statistics:');
                    console.log(`  Total patterns: ${stats.patterns?.totalPatterns || 0}`);
                    console.log(`  Strong patterns: ${stats.patterns?.strongPatterns || 0}`);
                    console.log(`  Recent learning: ${stats.patterns?.recentLearning || 0}`);
                }
                
                if (options.concepts || !options.patterns) {
                    console.log('\n🧠 Ontology Statistics:');
                    console.log(`  Total concepts: ${stats.ontology?.totalConcepts || 0}`);
                    console.log(`  Total relations: ${stats.ontology?.totalRelations || 0}`);
                    console.log(`  Average confidence: ${stats.ontology?.averageConfidence || 0}`);
                }
            }
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Suggest command
program
    .command('suggest <identifier>')
    .description('Get refactoring suggestions for an identifier')
    .option('-c, --confidence <threshold>', 'Minimum confidence threshold', '0.7')
    .option('--json', 'Output as JSON')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (identifier, options) => {
        if (!options.json) {
            console.log(`💡 Getting suggestions for "${identifier}"...`);
        }
        
        const client = new LSPClient(parseInt(options.port));
        
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const suggestions = await client.suggest(identifier, parseFloat(options.confidence));
            
            if (options.json) {
                console.log(JSON.stringify(suggestions, null, 2));
            } else {
                if (suggestions.length === 0) {
                    console.log('No suggestions found above confidence threshold');
                    return;
                }
                
                console.log('\nSuggestions:');
                suggestions.forEach(s => {
                    console.log(`  ${s.original} → ${s.suggested}`);
                    console.log(`    Confidence: ${(s.confidence * 100).toFixed(1)}%`);
                    console.log(`    Reason: ${s.reason}`);
                });
            }
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Find command
program
    .command('find <identifier>')
    .description('Find all occurrences of an identifier')
    .option('-f, --fuzzy', 'Include fuzzy matches')
    .option('-s, --semantic', 'Include semantic matches')
    .option('--json', 'Output as JSON')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (identifier, options) => {
        if (!options.json) {
            console.log(`🔍 Searching for "${identifier}"...`);
        }
        
        const client = new LSPClient(parseInt(options.port));
        
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const matches = await client.find(identifier, {
                fuzzy: options.fuzzy,
                semantic: options.semantic
            });
            
            if (options.json) {
                console.log(JSON.stringify(matches, null, 2));
            } else {
                console.log(`\nExact matches: ${matches.exact?.length || 0}`);
                matches.exact?.forEach(m => {
                    console.log(`  ${m.file}:${m.line}:${m.column}`);
                });
                
                if (options.fuzzy && matches.fuzzy?.length > 0) {
                    console.log(`\nFuzzy matches: ${matches.fuzzy.length}`);
                    matches.fuzzy.forEach(m => {
                        console.log(`  ${m.file}:${m.line}:${m.column} (${(m.confidence * 100).toFixed(1)}%)`);
                    });
                }
                
                if (options.semantic && matches.conceptual?.length > 0) {
                    console.log(`\nSemantic matches: ${matches.conceptual.length}`);
                    matches.conceptual.forEach(m => {
                        console.log(`  ${m.file}:${m.line}:${m.column} (${(m.confidence * 100).toFixed(1)}%)`);
                    });
                }
            }
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Clear cache command
program
    .command('clear-cache')
    .description('Clear all caches')
    .action(() => {
        console.log('🧹 Clearing caches...');
        
        const cacheDir = '.ontology/cache';
        if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        console.log('✅ Caches cleared');
    });

// Optimize command
program
    .command('optimize')
    .description('Optimize the ontology database')
    .action(async () => {
        console.log('⚡ Optimizing database...');
        
        const dbPath = '.ontology/concepts.db';
        if (!fs.existsSync(dbPath)) {
            console.error('❌ Database not found. Run "ontology-lsp init" first.');
            process.exit(1);
        }
        
        // Run SQLite optimization commands
        const db = new Database(dbPath);
        
        db.exec('VACUUM');
        db.exec('ANALYZE');
        db.exec('REINDEX');
        
        db.close();
        
        console.log('✅ Database optimized');
    });

// API server command
program
    .command('api')
    .description('Start the HTTP API server')
    .option('-p, --port <port>', 'Port to listen on', '7000')
    .option('-h, --host <host>', 'Host to bind to', 'localhost')
    .option('--cors', 'Enable CORS headers')
    .action(async (options) => {
        console.log('🌐 Starting Ontology API Server...');
        
        const config = {
            port: parseInt(options.port),
            host: options.host,
            dbPath: '.ontology/concepts.db',
            workspaceRoot: process.cwd(),
            cors: options.cors
        };
        
        const server = new OntologyAPIServer(config);
        await server.start();
    });

// Export command
program
    .command('export [output]')
    .description('Export ontology data')
    .option('-f, --format <format>', 'Output format (json, yaml)', 'json')
    .option('--json', 'Shorthand for --format json')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (output, options) => {
        const format = options.json ? 'json' : options.format;
        
        if (!options.json && !output) {
            console.log('📦 Exporting ontology data...');
        }
        
        const client = new LSPClient(parseInt(options.port));
        
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (format === 'json' && !output) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const exportData = await client.exportData();
            
            const formatted = format === 'yaml' 
                ? yaml.dump(exportData)
                : JSON.stringify(exportData, null, 2);
            
            if (output) {
                fs.writeFileSync(output, formatted);
                if (!options.json) {
                    console.log(`✅ Exported to ${output}`);
                }
            } else {
                console.log(formatted);
            }
        } catch (error) {
            if (format === 'json' && !output) {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Import command
program
    .command('import <input>')
    .description('Import ontology data')
    .option('--merge', 'Merge with existing data instead of replacing')
    .option('--json', 'Output result as JSON')
    .option('-p, --port <port>', 'LSP server port', '7000')
    .action(async (input, options) => {
        if (!options.json) {
            console.log('📥 Importing ontology data...');
        }
        
        if (!fs.existsSync(input)) {
            const error = { error: `File not found: ${input}` };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        const content = fs.readFileSync(input, 'utf8');
        const data = input.endsWith('.yaml') || input.endsWith('.yml')
            ? yaml.load(content)
            : JSON.parse(content);
        
        if (!data.version) {
            const error = { error: 'Invalid import file format' };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        const client = new LSPClient(parseInt(options.port));
        
        if (!await client.isRunning()) {
            const error = { error: 'LSP server not running. Start with: ontology-lsp start' };
            if (options.json) {
                console.log(JSON.stringify(error));
            } else {
                console.error('❌', error.error);
            }
            process.exit(1);
        }
        
        try {
            const result = await client.importData({ ...data, merge: options.merge });
            
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log(`✅ Import completed from ${input}`);
                if (result.statistics) {
                    console.log(`  Concepts: ${result.statistics.ontology?.totalConcepts || 0}`);
                    console.log(`  Patterns: ${result.statistics.patterns?.totalPatterns || 0}`);
                }
            }
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error.message }));
            } else {
                console.error('❌', error.message);
            }
            process.exit(1);
        }
    });

// Helper function to load config
function loadConfig(): any {
    const configPath = '.ontology-lsp-config.yaml';
    
    if (!fs.existsSync(configPath)) {
        console.error('❌ Configuration not found. Run "ontology-lsp init" first.');
        process.exit(1);
    }
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    return yaml.load(configContent);
}

// Parse arguments
program.parse(process.argv);