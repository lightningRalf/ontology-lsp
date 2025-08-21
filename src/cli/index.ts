#!/usr/bin/env bun

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as yaml from 'js-yaml';
import { ClaudeToolsLayer } from '../layers/claude-tools';
import { TreeSitterLayer } from '../layers/tree-sitter';
import { OntologyEngine } from '../ontology/ontology-engine';
import { PatternLearner } from '../patterns/pattern-learner';
import { KnowledgeSpreader } from '../propagation/knowledge-spreader';

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
    .option('-o, --output <format>', 'Output format (json, yaml)', 'json')
    .action(async (searchPath = '.', options) => {
        console.log(`🔍 Analyzing ${searchPath}...`);
        
        const config = loadConfig();
        
        // Initialize layers
        const claudeTools = new ClaudeToolsLayer(config.layers.claude_tools);
        const treeSitter = new TreeSitterLayer(config.layers.tree_sitter);
        const ontology = new OntologyEngine(config.layers.ontology);
        
        // Find all relevant files
        const query = {
            identifier: '',
            searchPath,
            fileTypes: config.layers.claude_tools.fileTypes
        };
        
        const matches = await claudeTools.process(query);
        console.log(`Found ${matches.files.size} files to analyze`);
        
        // Analyze each file
        let concepts = 0;
        for (const file of matches.files) {
            const ast = await treeSitter.process({
                identifier: '',
                searchPath: file,
                fileTypes: []
            });
            
            // Extract concepts from AST
            if (ast.exact.length > 0) {
                concepts += ast.exact.length;
            }
        }
        
        const stats = {
            filesAnalyzed: matches.files.size,
            conceptsFound: concepts,
            timestamp: new Date().toISOString()
        };
        
        if (options.output === 'yaml') {
            console.log(yaml.dump(stats));
        } else {
            console.log(JSON.stringify(stats, null, 2));
        }
    });

// Stats command
program
    .command('stats')
    .description('Show ontology statistics')
    .option('--patterns', 'Show pattern statistics')
    .option('--concepts', 'Show concept statistics')
    .action(async (options) => {
        const config = loadConfig();
        
        const ontology = new OntologyEngine(config.layers.ontology);
        const patterns = new PatternLearner(config.layers.patterns);
        
        if (options.patterns) {
            const stats = await patterns.getStatistics();
            console.log('\n📊 Pattern Statistics:');
            console.log(`  Total patterns: ${stats.totalPatterns}`);
            console.log(`  Strong patterns: ${stats.strongPatterns}`);
            console.log(`  Recent learning: ${stats.recentLearning}`);
        }
        
        if (options.concepts || !options.patterns) {
            const stats = ontology.getStatistics();
            console.log('\n🧠 Ontology Statistics:');
            console.log(`  Total concepts: ${stats.totalConcepts}`);
            console.log(`  Total relations: ${stats.totalRelations}`);
            console.log(`  Average confidence: ${stats.averageConfidence}`);
        }
    });

// Suggest command
program
    .command('suggest <identifier>')
    .description('Get refactoring suggestions for an identifier')
    .option('-c, --confidence <threshold>', 'Minimum confidence threshold', '0.7')
    .action(async (identifier, options) => {
        console.log(`💡 Getting suggestions for "${identifier}"...`);
        
        const config = loadConfig();
        const patterns = new PatternLearner(config.layers.patterns);
        
        const predictions = await patterns.predictNextRename(identifier);
        
        const filtered = predictions.filter(p => 
            p.confidence >= parseFloat(options.confidence)
        );
        
        if (filtered.length === 0) {
            console.log('No suggestions found above confidence threshold');
            return;
        }
        
        console.log('\nSuggestions:');
        filtered.forEach(p => {
            console.log(`  ${p.original} → ${p.suggested}`);
            console.log(`    Confidence: ${(p.confidence * 100).toFixed(1)}%`);
            console.log(`    Reason: ${p.reason}`);
        });
    });

// Find command
program
    .command('find <identifier>')
    .description('Find all occurrences of an identifier')
    .option('-f, --fuzzy', 'Include fuzzy matches')
    .option('-s, --semantic', 'Include semantic matches')
    .action(async (identifier, options) => {
        console.log(`🔍 Searching for "${identifier}"...`);
        
        const config = loadConfig();
        const claudeTools = new ClaudeToolsLayer(config.layers.claude_tools);
        
        const query = {
            identifier,
            searchPath: '.',
            fileTypes: config.layers.claude_tools.fileTypes
        };
        
        const matches = await claudeTools.process(query);
        
        console.log(`\nExact matches: ${matches.exact.length}`);
        matches.exact.forEach(m => {
            console.log(`  ${m.file}:${m.line}:${m.column}`);
        });
        
        if (options.fuzzy && matches.fuzzy.length > 0) {
            console.log(`\nFuzzy matches: ${matches.fuzzy.length}`);
            matches.fuzzy.forEach(m => {
                console.log(`  ${m.file}:${m.line}:${m.column} (${(m.confidence * 100).toFixed(1)}%)`);
            });
        }
        
        if (options.semantic && matches.conceptual.length > 0) {
            console.log(`\nSemantic matches: ${matches.conceptual.length}`);
            matches.conceptual.forEach(m => {
                console.log(`  ${m.file}:${m.line}:${m.column} (${(m.confidence * 100).toFixed(1)}%)`);
            });
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
        const Database = require('bun:sqlite').Database;
        const db = new Database(dbPath);
        
        db.exec('VACUUM');
        db.exec('ANALYZE');
        db.exec('REINDEX');
        
        db.close();
        
        console.log('✅ Database optimized');
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