#!/usr/bin/env bun

// Suppress background metrics and any stdio noise in CLI context
process.env.SILENT_MODE = 'true';
process.env.STDIO_MODE = 'true';

/**
 * CLI Tool - Thin wrapper around unified core
 *
 * This CLI only handles command parsing and output formatting:
 * - Argument parsing
 * - Command routing
 * - Output presentation
 *
 * All analysis work is delegated to the CLI adapter and core analyzer.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
// Note: defer heavy imports (tree-sitter, analyzer, adapter) to runtime.
// This keeps `--help` and `init` working even if native deps are unavailable.
import * as path from 'path';

class CLI {
    private program: Command;
    private coreAnalyzer!: any;
    private cliAdapter!: any;
    private initialized = false;
    private coreConfig: any;
    private workspaceRoot: string = process.cwd();
    private fmtDef?: (d: any) => string;
    private fmtRef?: (r: any) => string;

    constructor() {
        this.program = new Command();
        this.setupCommands();
    }

    private setupCommands(): void {
        this.program.name('ontology-lsp').description('Ontology-enhanced Language Server CLI').version('1.0.0');

        // Find command
        this.program
            .command('find <identifier>')
            .aliases(['def', 'definitions'])
            .description('Find symbol definitions with fuzzy matching')
            .option('-f, --file <path>', 'Specific file context')
            .option('-n, --max-results <count>', 'Maximum results to search', '50')
            .option('-l, --limit <count>', 'Maximum results to print', '20')
            .option('-s, --summary', 'Show summary output only')
            .option('--precise', 'Run a quick AST validation pass')
            .option('--ast-only', 'Only return AST-validated results')
            .option('-j, --json', 'Output JSON')
            .option('--no-color', 'Disable colored output')
            .option('-v, --verbose', 'Verbose output with performance info')
            .action(async (identifier, options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handleFind(identifier, {
                    file: options.file,
                    maxResults: parseInt(options.maxResults),
                    limit: parseInt(options.limit),
                    summary: !!options.summary,
                    precise: !!options.precise,
                    astOnly: !!options.astOnly,
                    json: !!options.json,
                    verbose: !!options.verbose,
                });
                if (typeof result === 'string' || options.json) {
                    console.log(result);
                } else if (Array.isArray(result)) {
                    const items = result as any[];
                    if (options.summary) {
                        const header = this.formatHeader(`Found ${items.length} definitions (showing ${items.length})`);
                        const top = items[0] ? `Top: ${this.fmtDef ? this.fmtDef(items[0]) : JSON.stringify(items[0])}` : 'Top: (none)';
                        console.log([header, top].join('\n'));
                    } else {
                        const lines: string[] = [
                            this.formatHeader(`Found ${items.length} definitions (showing ${items.length})`),
                        ];
                        for (const d of items) lines.push(`  ${this.fmtDef ? this.fmtDef(d) : JSON.stringify(d)}`);
                        console.log(lines.join('\n'));
                    }
                } else {
                    console.log(result);
                }
                await this.shutdown();
                process.exit(0);
            });

        // References command
        this.program
            .command('references <identifier>')
            .aliases(['ref'])
            .description('Find all references to a symbol')
            .option('-f, --file <path>', 'Specific file or directory context')
            .option('-d, --include-declaration', 'Include symbol declaration in results')
            .option('-n, --max-results <count>', 'Maximum results to search', '50')
            .option('-l, --limit <count>', 'Maximum results to print', '20')
            .option('-s, --summary', 'Show summary output only')
            .option('--precise', 'Run a quick AST validation pass')
            .option('--ast-only', 'Only return AST-validated results')
            .option('-j, --json', 'Output JSON')
            .option('--no-color', 'Disable colored output')
            .option('-v, --verbose', 'Verbose output with performance info')
            .action(async (identifier, options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handleReferences(identifier, {
                    file: options.file,
                    includeDeclaration: options.includeDeclaration,
                    maxResults: parseInt(options.maxResults),
                    limit: parseInt(options.limit),
                    summary: !!options.summary,
                    precise: !!options.precise,
                    astOnly: !!options.astOnly,
                    json: !!options.json,
                    verbose: !!options.verbose,
                });
                if (typeof result === 'string' || options.json) {
                    console.log(result);
                } else if (Array.isArray(result)) {
                    const items = result as any[];
                    if (options.summary) {
                        const header = this.formatHeader(`Found ${items.length} references (showing ${items.length})`);
                        const top = items[0] ? `Top: ${this.fmtRef ? this.fmtRef(items[0]) : JSON.stringify(items[0])}` : 'Top: (none)';
                        console.log([header, top].join('\n'));
                    } else {
                        const lines: string[] = [
                            this.formatHeader(`Found ${items.length} references (showing ${items.length})`),
                        ];
                        for (const r of items) lines.push(`  ${this.fmtRef ? this.fmtRef(r) : JSON.stringify(r)}`);
                        console.log(lines.join('\n'));
                    }
                } else {
                    console.log(result);
                }
                await this.shutdown();
                process.exit(0);
            });

        // Symbol: Build Symbol Map (Layer 3)
        this.program
            .command('symbol-map <identifier>')
            .description('Build a targeted symbol map (declarations/references/imports/exports)')
            .option('-f, --file <path>', 'Optional file or directory context')
            .option('--max-files <count>', 'Maximum files to analyze (default: 10)', '10')
            .option('-j, --json', 'Output JSON')
            .option('--no-color', 'Disable colored output')
            .action(async (identifier, options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handleSymbolMap(identifier, {
                    file: options.file,
                    maxFiles: parseInt(options.maxFiles),
                    json: !!options.json,
                });
                console.log(result);
                await this.shutdown();
                process.exit(0);
            });

        // Rename command
        this.program
            .command('rename <identifier> <newName>')
            .description('Rename a symbol with intelligent propagation')
            .option('--no-dry-run', 'Apply changes instead of preview')
            .option('--no-color', 'Disable colored output')
            .option('-v, --verbose', 'Verbose output with performance info')
            .action(async (identifier, newName, options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handleRename(identifier, newName, {
                    dryRun: options.dryRun !== false,
                });
                console.log(result);
                await this.shutdown();
                process.exit(0);
            });

        // Refactor: Plan Rename (preview only, Layer 3)
        this.program
            .command('plan-rename <identifier> <newName>')
            .description('Plan a rename and preview WorkspaceEdit changes (does not apply)')
            .option('-j, --json', 'Output JSON preview')
            .option('-l, --limit <count>', 'Limit previewed files in human output', '10')
            .option('--no-color', 'Disable colored output')
            .action(async (identifier, newName, options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handlePlanRename(identifier, newName, {
                    json: !!options.json,
                    limit: parseInt(options.limit),
                });
                console.log(result);
                await this.shutdown();
                process.exit(0);
            });

        // Stats command
        this.program
            .command('stats')
            .description('Show system statistics and health')
            .option('--no-color', 'Disable colored output')
            .option('-v, --verbose', 'Verbose output')
            .action(async (options) => {
                await this.ensureInitialized(options);
                const result = await this.cliAdapter.handleStats();
                console.log(result);
                await this.shutdown();
                process.exit(0);
            });

        // Explore command (aggregate defs+refs in parallel)
        this.program
            .command('explore <identifier>')
            .description('Explore codebase: definitions and references in parallel')
            .option('-f, --file <path>', 'Optional file or directory context')
            .option('-n, --max-results <count>', 'Maximum results to search', '100')
            .option('-l, --limit <count>', 'Maximum results to print per section', '10')
            .option('-d, --include-declaration', 'Include declaration in references')
            .option('-s, --summary', 'Show summary output only')
            .option('--precise', 'Run a quick AST validation pass')
            .option('--tree', 'Append a directory tree view (CLI only)')
            .option('--tree-depth <n>', 'Tree depth for --tree (default: 3)', '3')
            .option('-j, --json', 'Output JSON')
            .option('--no-color', 'Disable colored output')
            .action(async (identifier, options) => {
                await this.ensureInitialized(options);
                let output = await this.cliAdapter.handleExplore(identifier, {
                    file: options.file,
                    maxResults: parseInt(options.maxResults),
                    includeDeclaration: !!options.includeDeclaration,
                    limit: parseInt(options.limit),
                    summary: !!options.summary,
                    precise: !!options.precise,
                    json: !!options.json,
                    verbose: !!options.verbose,
                });
                if (options.tree && !options.json) {
                    const target = options.file ? options.file : this.workspaceRoot;
                    const depth = parseInt(options.treeDepth) || 2;
                    const tree = this.renderTree(target, depth);
                    if (tree) {
                        output += `\n\n` + tree;
                    }
                }
                console.log(output);
                await this.shutdown();
                process.exit(0);
            });

        // Init command (optional - for setting up workspace)
        this.program
            .command('init')
            .description('Initialize ontology LSP in current directory')
            .option('-f, --force', 'Overwrite existing configuration')
            .action(async (options) => {
                await this.handleInit(options);
            });
    }

    private async ensureInitialized(options: any): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Lazy import heavy modules only when needed
            const [{ createDefaultCoreConfig, formatDefinitionForCli, formatReferenceForCli }, { createCodeAnalyzer }, { CLIAdapter }] = await Promise.all([
                import('../adapters/utils.js'),
                import('../core/index.js'),
                import('../adapters/cli-adapter.js'),
            ]);

            const config = createDefaultCoreConfig();
            const workspaceRoot = this.findWorkspaceRoot();

            this.coreAnalyzer = await createCodeAnalyzer({
                ...config,
                workspaceRoot,
            });

            await this.coreAnalyzer.initialize();

            // Create CLI adapter
            this.cliAdapter = new CLIAdapter(this.coreAnalyzer, {
                colorOutput: options.color !== false,
                verboseMode: options.verbose || false,
                maxResults: 50,
                timeout: 30000,
            });

            this.coreConfig = config;
            this.workspaceRoot = workspaceRoot;
            this.fmtDef = formatDefinitionForCli as any;
            this.fmtRef = formatReferenceForCli as any;
            this.initialized = true;
        } catch (error) {
            console.error(`Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    }

    private formatHeader(text: string): string {
        return `\x1b[1m\x1b[36m${text}\x1b[0m`;
    }

    private hasCommand(cmd: string): boolean {
        const res = spawnSync('bash', ['-lc', `command -v ${cmd}`], { stdio: 'pipe' });
        return res.status === 0;
    }

    private renderTree(pathStr: string, depth: number): string {
        try {
            const prefer = this.coreConfig?.performance?.tools?.tree?.prefer || 'auto';
            const inGitRepo = fs.existsSync(`${this.workspaceRoot}/.git`);
            const safeDepth = Math.max(1, Math.min(depth, 5));
            // eza preferred
            if (prefer !== 'none' && (prefer === 'eza' || (prefer === 'auto' && this.hasCommand('eza')))) {
                const args = ['-T', '-L', String(safeDepth), pathStr];
                if (inGitRepo) args.splice(1, 0, '--git-ignore');
                const r = spawnSync('eza', args, { encoding: 'utf8' });
                if (r.status === 0 && r.stdout) {
                    return ['Tree (eza):', r.stdout.trim()].join('\n');
                }
            }
            // tree fallback
            if (prefer !== 'none' && (prefer === 'tree' || (prefer === 'auto' && this.hasCommand('tree')))) {
                const ignore = 'node_modules|dist|.git|coverage|out|build|logs';
                const r = spawnSync('tree', ['-L', String(safeDepth), '-I', ignore, pathStr], { encoding: 'utf8' });
                if (r.status === 0 && r.stdout) {
                    return ['Tree (tree):', r.stdout.trim()].join('\n');
                }
            }
            // Minimal fallback
            const entries = fs.readdirSync(pathStr, { withFileTypes: true }).slice(0, 50);
            const lines = ['Tree (fallback):', pathStr];
            for (const e of entries) lines.push(`  ${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
            return lines.join('\n');
        } catch {
            return '';
        }
    }

    private async handleInit(options: any): Promise<void> {
        const configPath = path.join(process.cwd(), '.ontology-lsp-config.yaml');
        const dbPath = path.join(process.cwd(), '.ontology');

        if (fs.existsSync(configPath) && !options.force) {
            console.error('Configuration already exists. Use --force to overwrite.');
            process.exit(1);
        }

        // Create .ontology directory
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        }

        // Create basic config
        const config = `# Ontology LSP Configuration
workspaceRoot: .
database:
  path: .ontology/ontology.db
layers:
  layer1:
    enabled: true
    timeout: 5000
  layer2:
    enabled: true
    timeout: 50000
  layer3:
    enabled: true
    timeout: 10000
  layer4:
    enabled: true
    timeout: 10000
  layer5:
    enabled: true
    timeout: 20000
cache:
  enabled: true
  ttlMs: 300000
  maxSize: 1000
performance:
  enableTiming: true
  logSlowOperations: true
  slowOperationThresholdMs: 1000
`;

        fs.writeFileSync(configPath, config);

        // Create .ontologyignore if it doesn't exist
        const ignorePath = path.join(process.cwd(), '.ontologyignore');
        if (!fs.existsSync(ignorePath)) {
            const ignoreContent = `# Ontology LSP ignore patterns
node_modules/
.git/
dist/
build/
*.log
.env
.env.local
*.min.js
*.map
`;
            fs.writeFileSync(ignorePath, ignoreContent);
        }

        console.log('✓ Ontology LSP initialized');
        console.log(`✓ Configuration written to ${configPath}`);
        console.log(`✓ Database directory created at ${dbPath}`);
        console.log(`✓ Ignore file created at ${ignorePath}`);
        console.log('\nYou can now use other commands like:');
        console.log('  ontology-lsp find <symbol>');
        console.log('  ontology-lsp references <symbol>');
        console.log('  ontology-lsp symbol-map <symbol>');
        console.log('  ontology-lsp plan-rename <old> <new>');
        console.log('  ontology-lsp stats');
    }

    private findWorkspaceRoot(): string {
        let current = process.cwd();

        while (current !== path.dirname(current)) {
            // Check for common project root indicators
            const indicators = ['package.json', '.git', 'tsconfig.json', '.ontology-lsp-config.yaml'];

            for (const indicator of indicators) {
                if (fs.existsSync(path.join(current, indicator))) {
                    return current;
                }
            }

            current = path.dirname(current);
        }

        // Default to current directory if no indicators found
        return process.cwd();
    }

    async run(argv: string[]): Promise<void> {
        try {
            await this.program.parseAsync(argv);
        } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    }

    async shutdown(): Promise<void> {
        if (this.coreAnalyzer) {
            await this.coreAnalyzer.dispose();
        }
    }
}

// Create and run CLI
const cli = new CLI();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
    await cli.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await cli.shutdown();
    process.exit(0);
});

// Run CLI with top-level await to ensure completion before exit (ESM)
await cli.run(process.argv);
