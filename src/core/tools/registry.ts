/**
 * Universal Tool Registry
 *
 * Single source of truth for capabilities exposed by adapters (MCP/HTTP/CLI).
 * Each tool includes a name, description, and JSON schema for inputs/outputs.
 */

export interface ToolSpec {
    name: string;
    description: string;
    title?: string;
    inputSchema: any;
    outputSchema?: any;
    availability?: {
        adapters?: Array<'mcp' | 'http' | 'cli' | 'lsp'>;
        languages?: string[];
    };
    category?: 'workflow' | 'operation' | 'system';
}

export class ToolRegistry {
    private static tools: ToolSpec[] = [
        {
            name: 'get_snapshot',
            description: 'Create or return a snapshot id for consistent reads/edits',
            inputSchema: { type: 'object', properties: { preferExisting: { type: 'boolean' } } },
        },
        // WORKFLOWS (legacy names kept for compatibility)
        {
            name: 'workflow_safe_rename',
            title: 'Workflow: Safe Rename (Snapshot + Checks)',
            description:
                'Plan a rename, stage a unified diff into a snapshot, run checks, and return status with next actions.',
      category: 'workflow',
      inputSchema: {
        type: 'object',
        properties: {
          oldName: { type: 'string', description: 'Original symbol name' },
          newName: { type: 'string', description: 'New symbol name' },
          file: { type: 'string', description: 'Optional context file URI' },
          commands: { type: 'array', items: { type: 'string' }, default: ['bun run build:tsc'] },
          timeoutSec: { type: 'number', default: 240 },
          runChecks: { type: 'boolean', default: true },
        },
        required: ['oldName', 'newName'],
      },
    },
        {
            name: 'workflow_explore_symbol',
            title: 'Workflow: Explore Symbol Impact',
            description:
                'Find definitions, build a symbol map, and expand neighbors (imports/exports/callers/callees). Returns a compact JSON summary. Use to assess change impact before edits.',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string', description: 'Symbol name to explore' },
                    file: { type: 'string', description: 'Optional context file URI' },
                    precise: { type: 'boolean', default: true },
                    depth: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 50 },
                },
                required: ['symbol'],
            },
        },
        {
            name: 'workflow_quick_patch_checks',
            title: 'Workflow: Quick Patch + Checks (Snapshot‑Safe)',
            description:
                'Stages a unified diff into a snapshot and runs checks (typecheck/build/tests). Returns ok, snapshot id, and tail of logs. Safe: never writes to working tree.',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    patch: { type: 'string', description: 'Unified diff (git format) to stage' },
                    snapshot: { type: 'string', description: 'Optional snapshot id; if absent a snapshot is created' },
                    commands: { type: 'array', items: { type: 'string' }, default: ['bun run build:tsc'] },
                    timeoutSec: { type: 'number', default: 240 },
                },
                required: ['patch'],
            },
        },
        {
            name: 'workflow_locate_confirm_definition',
            title: 'Workflow: Locate & Confirm Definition',
            description:
                'Locate definitions fast, retry with precise AST validation if ambiguous; returns attempts and chosen results.',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string', description: 'Symbol name to locate' },
                    file: { type: 'string', description: 'Optional context file URI' },
                    precise: { type: 'boolean', default: true },
                    maxResults: { type: 'number', default: 50 },
                },
                required: ['symbol'],
            },
        },
        {
            name: 'ast_query',
            description: 'Run a Tree-sitter s-expression query over selected files',
            inputSchema: {
                type: 'object',
                properties: {
                    language: { type: 'string', enum: ['typescript', 'javascript', 'python'] },
                    query: { type: 'string' },
                    paths: { type: 'array', items: { type: 'string' } },
                    glob: { type: 'string' },
                    limit: { type: 'number' },
                },
                required: ['language', 'query'],
            },
        },
        {
            name: 'graph_expand',
            description: 'Expand neighbors for a file or symbol (imports/exports; callers/callees best-effort)',
            inputSchema: {
                type: 'object',
                properties: {
                    file: { type: 'string' },
                    symbol: { type: 'string' },
                    edges: {
                        type: 'array',
                        items: { type: 'string', enum: ['imports', 'exports', 'callers', 'callees'] },
                        default: ['imports', 'exports'],
                    },
                    depth: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 50 },
                },
                anyOf: [{ required: ['file'] }, { required: ['symbol'] }],
            },
        },
        {
            name: 'propose_patch',
            description: 'Validate and stage a patch against a snapshot (diff-only, no write to disk)',
            inputSchema: {
                type: 'object',
                properties: {
                    patch: { type: 'string' },
                    format: { type: 'string', enum: ['unified'], default: 'unified' },
                    snapshot: { type: 'string' },
                    runChecks: { type: 'boolean', default: true },
                },
                required: ['patch'],
            },
        },
        {
            name: 'run_checks',
            description: 'Run format/lint/typecheck/tests for a snapshot (guarded)',
            inputSchema: {
                type: 'object',
                properties: {
                    snapshot: { type: 'string' },
                    commands: { type: 'array', items: { type: 'string' } },
                    timeoutSec: { type: 'number', default: 120 },
                },
                required: ['snapshot'],
            },
        },
        {
            name: 'apply_snapshot',
            description: 'Apply a staged snapshot overlay.diff to the working tree (guarded by env)',
            inputSchema: {
                type: 'object',
                properties: {
                    snapshot: { type: 'string' },
                    check: { type: 'boolean', default: false },
                },
                required: ['snapshot'],
            },
        },
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
            name: 'text_search',
            description: 'Fast content search (bounded, repo-aware, ripgrep-backed)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    path: { type: 'string' },
                    maxResults: { type: 'number' },
                    caseInsensitive: { type: 'boolean' },
                    kind: { type: 'string', enum: ['literal', 'regex', 'word'], default: 'literal' },
                    context: { type: 'number', default: 2 },
                },
                required: ['query'],
            },
        },
        {
            name: 'symbol_search',
            description: 'Search for symbols by name with AST/Planner validation',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    maxResults: { type: 'number' },
                    fileHint: { type: 'string' },
                },
                required: ['query'],
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
        return [...ToolRegistry.tools];
    }
}
        // WORKFLOWS (renamed, preferred)
        {
            name: 'rename_safely',
            title: 'Rename Safely (Snapshot + Checks)',
            description:
                'Use for: safe symbol rename across files. Avoid: ad‑hoc search/replace. Returns: { ok, changes, snapshot, next_actions }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    oldName: { type: 'string' },
                    newName: { type: 'string' },
                    file: { type: 'string' },
                    commands: { type: 'array', items: { type: 'string' }, default: ['bun run build:tsc'] },
                    timeoutSec: { type: 'number', default: 240 },
                    runChecks: { type: 'boolean', default: true },
                },
                required: ['oldName', 'newName'],
            },
        },
        {
            name: 'explore_symbol_impact',
            title: 'Explore Symbol Impact',
            description:
                'Use for: quick impact analysis (defs/map/neighbors). Avoid: large raw dumps. Returns: { definitions, symbolMap, neighbors }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                    file: { type: 'string' },
                    precise: { type: 'boolean', default: true },
                    depth: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 50 },
                },
                required: ['symbol'],
            },
        },
        {
            name: 'patch_checks_in_snapshot',
            title: 'Patch Checks in Snapshot',
            description:
                'Use for: validate a unified diff safely. Avoid: editing working tree. Returns: { ok, elapsedMs, output_tail }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    patch: { type: 'string' },
                    snapshot: { type: 'string' },
                    commands: { type: 'array', items: { type: 'string' }, default: ['bun run build:tsc'] },
                    timeoutSec: { type: 'number', default: 240 },
                },
                required: ['patch'],
            },
        },
        {
            name: 'locate_confirm_definition',
            title: 'Locate & Confirm Definition',
            description:
                'Use for: precise go‑to‑def. Avoid: guessing. Returns: { attempts: [fast, precise], definitions }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                    file: { type: 'string' },
                    precise: { type: 'boolean', default: true },
                    maxResults: { type: 'number', default: 50 },
                },
                required: ['symbol'],
            },
        },
        {
            name: 'extract_snapshot_artifacts',
            title: 'Extract Snapshot Artifacts',
            description:
                'Use for: quickly getting overlay.diff/status/progress links for a snapshot. Returns: { snapshot, links }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    snapshot: { type: 'string' },
                },
                required: ['snapshot'],
            },
        },
        {
            name: 'apply_after_checks',
            title: 'Apply After Checks',
            description:
                'Use for: patch → checks → apply (dev only). Guarded by ALLOW_SNAPSHOT_APPLY=1. Returns: { ok, snapshot, applied, output_tail }',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    patch: { type: 'string' },
                    snapshot: { type: 'string' },
                    commands: { type: 'array', items: { type: 'string' }, default: ['bun run build:tsc'] },
                    timeoutSec: { type: 'number', default: 240 },
                },
                required: ['patch'],
            },
        },
        // META: Execute Intent (auto-selects a high-value workflow)
        {
            name: 'execute_intent',
            title: 'Execute Intent (Auto-Select Workflow)',
            description:
                'Use for: auto-orchestrating rename/patch/explore/locate. Provide minimal args; returns selected workflow result + next_actions.',
            category: 'workflow',
            inputSchema: {
                type: 'object',
                properties: {
                    intent: { type: 'string', enum: ['rename', 'patch', 'explore', 'locate', 'apply'], description: 'Preferred action; optional if args imply intent' },
                    // Rename
                    oldName: { type: 'string' },
                    newName: { type: 'string' },
                    file: { type: 'string' },
                    // Patch
                    patch: { type: 'string' },
                    applyIfOk: { type: 'boolean', default: false, description: 'If checks pass and apply is allowed, apply snapshot' },
                    commands: { type: 'array', items: { type: 'string' }, description: 'Optional commands for checks' },
                    timeoutSec: { type: 'number', default: 240 },
                    // Explore/Locate
                    symbol: { type: 'string' },
                },
            },
        },
