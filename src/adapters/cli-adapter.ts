/**
 * CLI Adapter - Command-line interface to core analyzer with pretty output
 * Target: <100 lines
 * 
 * This adapter handles CLI-specific concerns only:
 * - Command argument parsing
 * - Pretty terminal output formatting
 * - Progress indicators
 * - Exit codes
 * 
 * All actual analysis work is delegated to the unified core analyzer.
 */

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import {
  buildFindDefinitionRequest,
  buildFindReferencesRequest,
  buildRenameRequest,
  formatDefinitionForCli,
  formatReferenceForCli,
  formatCompletionForCli,
  handleAdapterError,
  normalizeUri,
  createPosition
} from './utils.js';

export interface CLIAdapterConfig {
  maxResults?: number;
  timeout?: number;
  colorOutput?: boolean;
  verboseMode?: boolean;
}

/**
 * CLI Adapter - converts command-line calls to core analyzer calls
 */
export class CLIAdapter {
  private coreAnalyzer: CodeAnalyzer;
  private config: CLIAdapterConfig;

  constructor(coreAnalyzer: CodeAnalyzer, config: CLIAdapterConfig = {}) {
    this.coreAnalyzer = coreAnalyzer;
    this.config = {
      maxResults: 50,
      timeout: 30000,
      colorOutput: true,
      verboseMode: false,
      ...config
    };
  }

  /**
   * Handle find command
   */
  async handleFind(identifier: string, options: { file?: string; maxResults?: number }): Promise<string> {
    try {
      const request = buildFindDefinitionRequest({
        uri: normalizeUri(options.file || process.cwd()),
        position: createPosition(0, 0),
        identifier,
        maxResults: options.maxResults || this.config.maxResults,
        includeDeclaration: true
      });

      const result = await this.coreAnalyzer.findDefinition(request);
      
      if (result.data.length === 0) {
        return this.formatError(`No definitions found for '${identifier}'`);
      }

      const output = [
        this.formatHeader(`Found ${result.data.length} definition(s) for '${identifier}':`),
        ...result.data.map(def => `  ${formatDefinitionForCli(def)}`),
        '',
        this.formatPerformance(result.performance)
      ];

      return output.join('\n');
      
    } catch (error) {
      return this.formatError(`Find failed: ${handleAdapterError(error, 'cli')}`);
    }
  }

  /**
   * Handle references command
   */
  async handleReferences(identifier: string, options: { includeDeclaration?: boolean; maxResults?: number }): Promise<string> {
    try {
      const request = buildFindReferencesRequest({
        uri: normalizeUri(process.cwd()),
        position: createPosition(0, 0),
        identifier,
        maxResults: options.maxResults || this.config.maxResults,
        includeDeclaration: options.includeDeclaration ?? false
      });

      const result = await this.coreAnalyzer.findReferences(request);
      
      if (result.data.length === 0) {
        return this.formatError(`No references found for '${identifier}'`);
      }

      const output = [
        this.formatHeader(`Found ${result.data.length} reference(s) for '${identifier}':`),
        ...result.data.map(ref => `  ${formatReferenceForCli(ref)}`),
        '',
        this.formatPerformance(result.performance)
      ];

      return output.join('\n');
      
    } catch (error) {
      return this.formatError(`References search failed: ${handleAdapterError(error, 'cli')}`);
    }
  }

  /**
   * Handle rename command
   */
  async handleRename(identifier: string, newName: string, options: { dryRun?: boolean }): Promise<string> {
    try {
      const request = buildRenameRequest({
        uri: normalizeUri(process.cwd()),
        position: createPosition(0, 0),
        identifier,
        newName,
        dryRun: options.dryRun ?? true
      });

      const result = await this.coreAnalyzer.rename(request);
      
      const changes = Object.entries(result.data.changes || {});
      
      if (changes.length === 0) {
        return this.formatWarning(`No changes needed for renaming '${identifier}' to '${newName}'`);
      }

      const totalEdits = changes.reduce((acc, [, edits]) => acc + edits.length, 0);
      const mode = options.dryRun ? 'Preview' : 'Applied';
      
      const output = [
        this.formatHeader(`${mode}: Rename '${identifier}' to '${newName}'`),
        this.formatInfo(`${changes.length} files affected, ${totalEdits} edits`),
        '',
        ...changes.slice(0, 10).map(([uri, edits]) => 
          `  ${uri} (${edits.length} edit${edits.length === 1 ? '' : 's'})`
        )
      ];

      if (changes.length > 10) {
        output.push(`  ... and ${changes.length - 10} more files`);
      }

      output.push('', this.formatPerformance(result.performance));

      if (options.dryRun) {
        output.push('', this.formatInfo('Run with --no-dry-run to apply changes'));
      }

      return output.join('\n');
      
    } catch (error) {
      return this.formatError(`Rename failed: ${handleAdapterError(error, 'cli')}`);
    }
  }

  /**
   * Handle stats command
   */
  async handleStats(): Promise<string> {
    try {
      const diagnostics = this.coreAnalyzer.getDiagnostics();
      
      const output = [
        this.formatHeader('Ontology LSP Statistics'),
        `Status: ${diagnostics.initialized ? 'Initialized' : 'Not initialized'}`,
        '',
        this.formatHeader('Layer Status:'),
        ...Object.entries(diagnostics.layerManager?.layers || {}).map(([layer, status]) =>
          `  ${layer}: ${status ? 'Active' : 'Inactive'}`
        ),
        '',
        this.formatHeader('Performance:'),
        `Cache enabled: ${diagnostics.sharedServices?.cache?.enabled ?? 'Unknown'}`,
        `Learning enabled: ${diagnostics.learningCapabilities?.patternLearning ?? 'Unknown'}`,
        '',
        `Timestamp: ${new Date(diagnostics.timestamp).toISOString()}`
      ];

      return output.join('\n');
      
    } catch (error) {
      return this.formatError(`Stats failed: ${handleAdapterError(error, 'cli')}`);
    }
  }

  // ===== FORMATTING METHODS =====

  private formatHeader(text: string): string {
    if (!this.config.colorOutput) return text;
    return `\x1b[1m\x1b[36m${text}\x1b[0m`; // Bold cyan
  }

  private formatError(text: string): string {
    if (!this.config.colorOutput) return `Error: ${text}`;
    return `\x1b[1m\x1b[31mError: ${text}\x1b[0m`; // Bold red
  }

  private formatWarning(text: string): string {
    if (!this.config.colorOutput) return `Warning: ${text}`;
    return `\x1b[1m\x1b[33mWarning: ${text}\x1b[0m`; // Bold yellow
  }

  private formatInfo(text: string): string {
    if (!this.config.colorOutput) return text;
    return `\x1b[36m${text}\x1b[0m`; // Cyan
  }

  private formatPerformance(performance: any): string {
    if (!this.config.verboseMode) return '';
    
    const layers = ['layer1', 'layer2', 'layer3', 'layer4', 'layer5'];
    const timings = layers
      .filter(layer => performance[layer] > 0)
      .map(layer => `${layer}: ${performance[layer]}ms`)
      .join(', ');
    
    return this.formatInfo(`Performance: ${timings} (total: ${performance.total}ms)`);
  }
}