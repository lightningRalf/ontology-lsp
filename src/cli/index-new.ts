#!/usr/bin/env bun

/**
 * New CLI using CLI Adapter - Thin wrapper around unified core
 * 
 * This CLI only handles command parsing and output formatting:
 * - Argument parsing
 * - Command routing
 * - Output presentation
 * 
 * All analysis work is delegated to the CLI adapter and core analyzer.
 */

import { Command } from 'commander';
import { CLIAdapter } from '../adapters/cli-adapter.js';
import { CodeAnalyzer } from '../core/unified-analyzer.js';
import { createCodeAnalyzer } from '../core/index.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import * as path from 'path';
import * as fs from 'fs';

class SimpleCLI {
  private program: Command;
  private coreAnalyzer!: CodeAnalyzer;
  private cliAdapter!: CLIAdapter;
  private initialized = false;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('ontology-lsp')
      .description('Ontology-enhanced Language Server CLI')
      .version('1.0.0');

    // Find command
    this.program
      .command('find <identifier>')
      .description('Find symbol definitions with fuzzy matching')
      .option('-f, --file <path>', 'Specific file context')
      .option('-n, --max-results <count>', 'Maximum results to show', '50')
      .option('--no-color', 'Disable colored output')
      .option('-v, --verbose', 'Verbose output with performance info')
      .action(async (identifier, options) => {
        await this.ensureInitialized(options);
        const result = await this.cliAdapter.handleFind(identifier, {
          file: options.file,
          maxResults: parseInt(options.maxResults)
        });
        console.log(result);
      });

    // References command
    this.program
      .command('references <identifier>')
      .description('Find all references to a symbol')
      .option('-d, --include-declaration', 'Include symbol declaration in results')
      .option('-n, --max-results <count>', 'Maximum results to show', '50')
      .option('--no-color', 'Disable colored output')
      .option('-v, --verbose', 'Verbose output with performance info')
      .action(async (identifier, options) => {
        await this.ensureInitialized(options);
        const result = await this.cliAdapter.handleReferences(identifier, {
          includeDeclaration: options.includeDeclaration,
          maxResults: parseInt(options.maxResults)
        });
        console.log(result);
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
          dryRun: options.dryRun !== false
        });
        console.log(result);
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
      // Initialize core analyzer
      const config = createDefaultCoreConfig();
      const workspaceRoot = this.findWorkspaceRoot();
      
      this.coreAnalyzer = await createCodeAnalyzer({
        ...config,
        workspaceRoot
      });
      
      await this.coreAnalyzer.initialize();

      // Create CLI adapter
      this.cliAdapter = new CLIAdapter(this.coreAnalyzer, {
        colorOutput: options.color !== false,
        verboseMode: options.verbose || false,
        maxResults: 50,
        timeout: 30000
      });

      this.initialized = true;
      
    } catch (error) {
      console.error(`Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
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
    console.log('  ontology-lsp stats');
  }

  private findWorkspaceRoot(): string {
    let current = process.cwd();
    
    while (current !== path.dirname(current)) {
      // Check for common project root indicators
      const indicators = [
        'package.json',
        '.git',
        'tsconfig.json',
        '.ontology-lsp-config.yaml'
      ];
      
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
const cli = new SimpleCLI();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await cli.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cli.shutdown();
  process.exit(0);
});

// Run CLI
cli.run(process.argv).catch((error) => {
  console.error('CLI failed:', error);
  process.exit(1);
});