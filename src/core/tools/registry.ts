/**
 * Universal Tool Registry
 *
 * Single source of truth for capabilities exposed by adapters (MCP/HTTP/CLI).
 * Each tool includes a name, description, and JSON schema for inputs/outputs.
 */

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  availability?: {
    adapters?: Array<'mcp' | 'http' | 'cli' | 'lsp'>;
    languages?: string[];
  };
}

export class ToolRegistry {
  private static tools: ToolSpec[] = [
    {
      name: 'find_definition',
      description: 'Find symbol definition with fuzzy/AST validation',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          file: { type: 'string' },
          precise: { type: 'boolean' },
          position: {
            type: 'object',
            properties: { line: { type: 'number' }, character: { type: 'number' } },
          },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'rename_symbol',
      description: 'Rename symbol with intelligent propagation (preview/apply via preview flag)',
      inputSchema: {
        type: 'object',
        properties: {
          oldName: { type: 'string' },
          newName: { type: 'string' },
          preview: { type: 'boolean', default: true },
          file: { type: 'string' },
        },
        required: ['oldName', 'newName'],
      },
    },
    {
      name: 'find_references',
      description: 'Find references to a symbol across codebase',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          includeDeclaration: { type: 'boolean' },
          precise: { type: 'boolean' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'explore_codebase',
      description: 'Aggregate definitions, references, diagnostics for a symbol',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          file: { type: 'string' },
          maxResults: { type: 'number' },
          includeDeclaration: { type: 'boolean' },
          precise: { type: 'boolean' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'build_symbol_map',
      description: 'Build a targeted symbol map (TS/JS) for a given identifier',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          file: { type: 'string' },
          maxFiles: { type: 'number' },
          astOnly: { type: 'boolean' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'plan_rename',
      description: 'Plan a safe rename across files with AST validation',
      inputSchema: {
        type: 'object',
        properties: {
          oldName: { type: 'string' },
          newName: { type: 'string' },
          file: { type: 'string' },
          dryRun: { type: 'boolean' },
        },
        required: ['oldName', 'newName'],
      },
    },
    {
      name: 'apply_rename',
      description: 'Apply a previously computed rename plan (WorkspaceEdit)',
      inputSchema: {
        type: 'object',
        properties: {
          changes: { type: 'object' },
        },
        required: ['changes'],
      },
    },
    {
      name: 'grep_content',
      description: 'Fast content search (bounded, repo-aware)',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          maxResults: { type: 'number' },
          caseInsensitive: { type: 'boolean' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'list_files',
      description: 'List files under workspace with ignore rules',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          maxFiles: { type: 'number' },
          depth: { type: 'number' },
        },
      },
    },
    {
      name: 'get_completions',
      description: 'Get code completions (pattern/ontology-driven)',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          position: {
            type: 'object',
            properties: { line: { type: 'number' }, character: { type: 'number' } },
          },
          maxResults: { type: 'number' },
        },
        required: ['position'],
      },
    },
    {
      name: 'list_symbols',
      description: 'List symbols in a file (bounded)',
      inputSchema: {
        type: 'object',
        properties: { file: { type: 'string' } },
        required: ['file'],
      },
    },
    {
      name: 'diagnostics',
      description: 'Get analyzer diagnostics and health information',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'pattern_stats',
      description: 'Pattern learning statistics snapshot',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'generate_tests',
      description: 'Generate tests (stub) based on code understanding and patterns',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          framework: {
            type: 'string',
            enum: ['bun', 'jest', 'vitest', 'mocha', 'auto'],
            default: 'auto',
          },
          coverage: {
            type: 'string',
            enum: ['basic', 'comprehensive', 'edge-cases'],
            default: 'comprehensive',
          },
        },
        required: ['target'],
      },
    },
    {
      name: 'knowledge_insights',
      description: 'Knowledge propagation / learning insights snapshot',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'cache_controls',
      description: 'Warm or clear internal caches',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['warm', 'clear'] } },
        required: ['action'],
      },
    },
  ];

  static list(): ToolSpec[] {
    return [...this.tools];
  }
}
