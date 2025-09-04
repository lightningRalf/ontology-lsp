/**
 * MCP Adapter - Convert MCP tool calls to core analyzer with enhanced error handling
 *
 * This adapter handles MCP-specific concerns:
 * - MCP tool call/response format
 * - Enhanced error handling and validation
 * - Timeout management
 * - Request/response logging
 *
 * All actual analysis work is delegated to the unified core analyzer.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { overlayStore } from '../core/overlay-store.js';
import { CoreError } from '../core/errors.js';
import { ToolRegistry } from '../core/tools/registry.js';
import { DefinitionKind } from '../core/types.js';
import { createValidationError, type ErrorContext, withMcpErrorHandling } from '../core/utils/error-handler.js';
import { adapterLogger, mcpLogger } from '../core/utils/file-logger.js';
import { AsyncEnhancedGrep } from '../layers/enhanced-search-tools-async.js';
import {
    buildCompletionRequest,
    buildFindDefinitionRequest,
    buildFindReferencesRequest,
    buildRenameRequest,
    createPosition,
    definitionToApiResponse,
    handleAdapterError,
    normalizePosition,
    normalizeUri,
    referenceToApiResponse,
    validateRequired,
} from './utils.js';

// Minimal core analyzer surface required by MCP adapter
type CoreAnalyzer = {
    rename: (req: any) => Promise<{ data: any; performance: any; requestId?: string }>;
    getCompletions?: (req: any) => Promise<{ data: any }>;
    findDefinitionAsync?: (req: any) => Promise<{ data: any[]; performance: any; requestId?: string }>;
    findReferencesAsync?: (req: any) => Promise<{ data: any[]; performance: any; requestId?: string }>;
    buildSymbolMap?: (req: any) => Promise<any>;
    exploreCodebase?: (req: any) => Promise<any>;
    getDiagnostics?: () => any;
    config?: any;
};

export interface MCPAdapterConfig {
    maxResults?: number;
    timeout?: number;
    enableSSE?: boolean;
    ssePort?: number;
}

/**
 * MCP Protocol Adapter - converts MCP tool calls to core analyzer calls
 */
export class MCPAdapter {
    private coreAnalyzer: CoreAnalyzer;
    private config: MCPAdapterConfig;

    constructor(coreAnalyzer: CoreAnalyzer, config: MCPAdapterConfig = {}) {
        this.coreAnalyzer = coreAnalyzer;
        this.config = {
            maxResults: 100,
            timeout: 30000,
            enableSSE: true,
            ssePort: 7001,
            ...config,
        };

        // Defensive wrapper to ensure MCP-compatible shape for direct calls in tests
        const original = this.handleToolCall.bind(this);
        (this as any)._originalHandleToolCall = original;
        this.handleToolCall = (async (...args: any[]) => {
            let name: string;
            let arguments_: Record<string, any> = {};
            if (typeof args[0] === 'string') {
                name = args[0];
                arguments_ = (args[1] || {}) as Record<string, any>;
            } else if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
                name = String(args[0].name);
                arguments_ = (args[0].arguments || {}) as Record<string, any>;
            } else {
                name = String(args[0]);
                arguments_ = (args[1] || {}) as Record<string, any>;
            }
            const out = await original(name, arguments_);
            if (out && typeof out === 'object' && ('error' in out || (out as any).isError)) {
                return out;
            }
            if (!out || typeof out !== 'object' || !('content' in out)) {
                const txt = (() => {
                    try {
                        return JSON.stringify(out, null, 2);
                    } catch {
                        return String(out);
                    }
                })();
                return { content: [{ type: 'text', text: txt }], isError: false } as any;
            }
            return out;
        }) as any;
    }

    /**
     * Get available MCP tools
     */
    getTools() {
        // Map registry tools directly; MCP SDK will consume the schema
        return ToolRegistry.list().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        }));
    }

    /**
     * Handle MCP tool call with enhanced error handling
     */
    async handleToolCall(name: string, arguments_: Record<string, any>): Promise<any> {
        const context: ErrorContext = {
            component: 'MCPAdapter',
            operation: `tool_${name}`,
            timestamp: Date.now(),
        };

        try {
            return await withMcpErrorHandling('MCPAdapter', `tool_${name}`, async () => {
                adapterLogger.debug(`Handling tool call: ${name}`, {
                    args: this.sanitizeForLogging(arguments_),
                });

                // Validate tool name early and return structured error (do not throw)
                const validTools = ToolRegistry.list().map((t) => t.name).concat(['suggest_refactoring']);
                if (!validTools.includes(name)) {
                    throw new CoreError('UnknownTool', `Unknown tool: ${name}. Valid tools: ${validTools.join(', ')}`);
                }

                const startTime = Date.now();
                // Ensure analyzer is ready before routing any core requests
                try { await (this.coreAnalyzer as any)?.initialize?.(); } catch {}
                let result: any;

                switch (name) {
                    case 'workflow_explore_symbol':
                        return this.handleWorkflowExploreSymbol(arguments_);
                    case 'workflow_quick_patch_checks':
                        return this.handleWorkflowQuickPatchChecks(arguments_);
                    case 'workflow_safe_rename':
                        return this.handleWorkflowSafeRename(arguments_);
                    case 'workflow_locate_confirm_definition':
                        return this.handleWorkflowLocateConfirmDefinition(arguments_);
                    case 'pattern_stats':
                        return this.handlePatternStats();
                    case 'get_snapshot':
                        return this.handleGetSnapshot(arguments_);
                    case 'propose_patch':
                        return this.handleProposePatch(arguments_);
                case 'run_checks':
                    return this.handleRunChecks(arguments_);
                case 'apply_snapshot':
                    return this.handleApplySnapshot(arguments_);
                    case 'text_search':
                        return this.handleTextSearch(arguments_);
                    case 'symbol_search':
                        return this.handleSymbolSearch(arguments_);
                    case 'ast_query':
                        return this.handleAstQuery(arguments_);
                    case 'graph_expand':
                        return this.handleGraphExpand(arguments_);
                    case 'find_definition':
                        result = await this.handleFindDefinition(arguments_, context);
                        break;
                    case 'find_references':
                        result = await this.handleFindReferences(arguments_, context);
                        break;
                    case 'rename_symbol':
                        result = await this.handleRenameSymbol(arguments_, context);
                        break;
                    case 'plan_rename':
                        result = await this.handlePlanRename(arguments_, context);
                        break;
                    case 'apply_rename':
                        result = await this.handleApplyRename(arguments_, context);
                        break;
                    case 'build_symbol_map':
                        result = await this.handleBuildSymbolMap(arguments_, context);
                        break;
                    case 'generate_tests':
                        result = await this.handleGenerateTests(arguments_, context);
                        break;
                    case 'suggest_refactoring':
                        result = { content: [{ type: 'text', text: JSON.stringify({ suggestions: [] }) }], isError: false };
                        break;
                    case 'explore_codebase':
                        result = await this.handleExploreCodebase(arguments_, context);
                        break;
                }

                const duration = Date.now() - startTime;
                const safeStr = (() => {
                    try {
                        return JSON.stringify(result);
                    } catch {
                        return String(result);
                    }
                })();
                adapterLogger.logPerformance(`tool_${name}`, duration, true, {
                    resultSize: safeStr.length,
                });
                try {
                    // Aid debugging in tests; stderr only
                    // eslint-disable-next-line no-console
                    console.error(
                        '[MCPAdapter] tool result keys:',
                        typeof result === 'object' && result ? Object.keys(result as any) : typeof result
                    );
                } catch {}

                // Ensure MCP-compatible shape
                if (result && typeof result === 'object' && 'content' in result) {
                    return result;
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : safeStr,
                        },
                    ],
                    isError: false,
                } as any;
            });
        } catch (error) {
            // Let servers map CoreError to protocol-specific errors
            if (error instanceof CoreError) {
                throw error;
            }
            // Fallback: return adapter-shaped message for non-core errors
            return handleAdapterError(error, 'mcp');
        }
    }

    // --- New handlers: snapshots/patches/checks ---
    private async handlePatternStats() {
        try {
            const lm: any = (this.coreAnalyzer as any).layerManager;
            const l5 = lm?.getLayer?.('layer5');
            const stats = l5 && typeof l5.getPatternStatistics === 'function' ? await l5.getPatternStatistics() : {};
            return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }], isError: false };
        } catch (e) {
            return { content: [{ type: 'text', text: String(e) }], isError: true };
        }
    }

    private async handleWorkflowExploreSymbol(args: Record<string, any>) {
        const symbol = String(args?.symbol || '').trim();
        if (!symbol) return { content: [{ type: 'text', text: 'symbol required' }], isError: true };
        const file = typeof args?.file === 'string' ? args.file : undefined;
        const precise = (args?.precise ?? true) as boolean;
        const depth = typeof args?.depth === 'number' ? args.depth : 1;
        const limit = typeof args?.limit === 'number' ? args.limit : 50;

        const defs = await this.handleFindDefinition(
            { symbol, file, precise, maxResults: limit },
            { component: 'MCPAdapter', operation: 'workflow_explore_symbol', timestamp: Date.now() }
        );
        const map = await this.handleBuildSymbolMap(
            { symbol, file, maxFiles: Math.min(20, limit), astOnly: true },
            { component: 'MCPAdapter', operation: 'workflow_explore_symbol', timestamp: Date.now() }
        );
        const neighbors = await this.handleGraphExpand({
            symbol,
            edges: ['imports', 'exports', 'callers', 'callees'],
            depth,
            limit,
        });

        const out = {
            ok: true,
            definitions: this.safeParseContent(defs),
            symbolMap: this.safeParseContent(map),
            neighbors: this.safeParseContent(neighbors),
            tips: [
                'Prefer files whose basename includes the symbol for quick AST validation.',
                'Escalate to precise mode when candidates ≥ 3 or confidence is low.',
            ],
            next_actions: ['Open top definition', 'Inspect low-confidence callers'],
        };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
    }

    private async handleWorkflowQuickPatchChecks(args: Record<string, any>) {
        const patch = String(args?.patch || '');
        if (!patch) return { content: [{ type: 'text', text: 'patch required' }], isError: true };
        const commands = Array.isArray(args?.commands) ? (args.commands as string[]) : ['bun run build:tsc'];
        const timeoutSec = typeof args?.timeoutSec === 'number' ? args.timeoutSec : 240;

        const snapRes = await this.handleGetSnapshot({ preferExisting: true });
        const snapText = this.safeParseContent(snapRes);
        const snapId = (snapText?.snapshot || snapText?.id || snapText?.snapshot_id) as string | undefined;
        if (!snapId) return { content: [{ type: 'text', text: 'failed to create snapshot' }], isError: true };

        const stage = await this.handleProposePatch({ snapshot: snapId, patch });
        const staged = this.safeParseContent(stage);
        const checks = await this.handleRunChecks({ snapshot: snapId, commands, timeoutSec });
        const checksOut = this.safeParseContent(checks);
        const ok = !!checksOut?.ok;
        const out = {
            ok,
            snapshot: snapId,
            stage: staged,
            checks: checksOut,
            next_actions: ok ? ['Apply patch in working tree'] : ['Review failing checks; adjust and re-run'],
        };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
    }

    private async handleWorkflowSafeRename(args: Record<string, any>) {
        const oldName = String(args?.oldName || '').trim();
        const newName = String(args?.newName || '').trim();
        if (!oldName || !newName) {
            return { content: [{ type: 'text', text: 'oldName and newName required' }], isError: true };
        }
        const file = typeof args?.file === 'string' ? args.file : undefined;
        const commands = Array.isArray(args?.commands) ? (args.commands as string[]) : ['bun run build:tsc'];
        const timeoutSec = typeof args?.timeoutSec === 'number' ? args.timeoutSec : 240;
        const runChecksFlag: boolean = args?.runChecks !== false;

        // Step 1: plan rename (WorkspaceEdit preview)
        const planRes = await this.handlePlanRename(
            { oldName, newName, file },
            { component: 'MCPAdapter', operation: 'workflow_safe_rename', timestamp: Date.now() }
        );
        const plan = this.safeParseContent(planRes);
        const changes = plan?.changes || {};
        const files = Object.keys(changes);
        if (!files.length) {
            const out = { ok: false, reason: 'no_changes', message: 'Rename produced no changes' };
            return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
        }

        // Step 2: snapshot and generate unified diff from WorkspaceEdit
        const snap = overlayStore.createSnapshot(true);
        const diffParts: string[] = [];
        const root = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
        const tmpRootBase = runChecksFlag
            ? (await (overlayStore as any).ensureMaterialized?.(snap.id)) || ''
            : path.resolve('.ontology', 'tmp-diffs');
        if (!tmpRootBase) {
            const out = { ok: false, reason: 'snapshot_failed', message: 'Failed to prepare snapshot' };
            return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: true };
        }
        const tmpRoot = path.join(tmpRootBase, '.mcp-work');
        await fs.mkdir(tmpRoot, { recursive: true }).catch(() => {});

        for (const uri of files) {
            const fileEdits = changes[uri] as any[];
            if (!Array.isArray(fileEdits) || !fileEdits.length) continue;
            const absPath = (() => {
                try {
                    return new URL(uri).pathname;
                } catch {
                    return uri.replace(/^file:\/\//, '');
                }
            })();
            const rel = path.relative(root, absPath);
            const srcPath = path.join(root, rel);
            let orig = '';
            try {
                orig = await fs.readFile(srcPath, 'utf8');
            } catch {
                continue;
            }
            const mod = this.applyTextEdits(orig, fileEdits);
            const tmpPath = path.join(tmpRoot, rel);
            await fs.mkdir(path.dirname(tmpPath), { recursive: true }).catch(() => {});
            await fs.writeFile(tmpPath, mod, 'utf8');

            const left = srcPath.replace(/"/g, '\\"');
            const right = tmpPath.replace(/"/g, '\\"');
            const cmd = `git diff --no-index --src-prefix=a/ --dst-prefix=b/ -- "${left}" "${right}"`;
            const proc = spawnSync('bash', ['-lc', cmd], { stdio: 'pipe' });
            const out = String(proc.stdout || '');
            if (out && out.trim().length > 0) {
                diffParts.push(out);
            }
        }
        const unifiedDiff = diffParts.join('\n');
        const stage = overlayStore.stagePatch(snap.id, unifiedDiff);
        if (!stage.accepted) {
            const out = { ok: false, reason: 'stage_failed', message: stage.message || 'Failed to stage diff' };
            return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: true };
        }

        // Step 3: optionally run checks inside snapshot
        if (!runChecksFlag) {
            const quick = {
                ok: true,
                snapshot: snap.id,
                filesAffected: files.length,
                totalEdits: files.reduce((acc, f) => acc + (Array.isArray(changes[f]) ? changes[f].length : 0), 0),
                next_actions: [
                    'Run checks when ready',
                    'Open snapshot diff: snapshot://' + snap.id + '/overlay.diff',
                ],
            };
            return { content: [{ type: 'text', text: JSON.stringify(quick, null, 2) }], isError: false };
        }

        // Step 3: run checks inside snapshot
        const checks = await overlayStore.runChecks(snap.id, commands, timeoutSec);
        const ok = !!checks.ok;
        const result = {
            ok,
            snapshot: snap.id,
            filesAffected: files.length,
            totalEdits: files.reduce((acc, f) => acc + (Array.isArray(changes[f]) ? changes[f].length : 0), 0),
            elapsedMs: checks.elapsedMs,
            outputTail: (checks.output || '').slice(-4000),
            next_actions: ok
                ? [
                      'Optionally apply this patch to working tree',
                      'Open snapshot diff: snapshot://' + snap.id + '/overlay.diff',
                  ]
                : ['Review failing checks in outputTail', 'Adjust plan and retry'],
        };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !ok };
    }

    private applyTextEdits(
        text: string,
        edits: Array<{
            range: { start: { line: number; character: number }; end: { line: number; character: number } };
            newText: string;
        }>
    ): string {
        if (!Array.isArray(edits) || edits.length === 0) return text;
        // Convert positions to offsets
        const lineStarts: number[] = [0];
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') lineStarts.push(i + 1);
        }
        const toOffset = (pos: { line: number; character: number }) => {
            const l = Math.max(0, Math.min(pos.line, lineStarts.length - 1));
            const lineStart = lineStarts[l] ?? 0;
            return lineStart + Math.max(0, pos.character);
        };
        const items = edits.map((e) => ({
            start: toOffset(e.range.start),
            end: toOffset(e.range.end),
            newText: e.newText ?? '',
        }));
        // Apply from end to start to avoid shifting
        items.sort((a, b) => b.start - a.start);
        let out = text;
        for (const e of items) {
            out = out.slice(0, e.start) + e.newText + out.slice(e.end);
        }
        return out;
    }
    private async handleWorkflowLocateConfirmDefinition(args: Record<string, any>) {
        const symbol = String(args?.symbol || '').trim();
        if (!symbol) return { content: [{ type: 'text', text: 'symbol required' }], isError: true };
        const file = typeof args?.file === 'string' ? args.file : undefined;
        const attempts: any[] = [];
        // First attempt: fast path (precise=false)
        const fast = await this.handleFindDefinition(
            { symbol, file, precise: false, maxResults: Math.min(50, Number(args?.maxResults || 50)) },
            { component: 'MCPAdapter', operation: 'workflow_locate_confirm_definition', timestamp: Date.now() }
        );
        const fastOut = this.safeParseContent(fast);
        attempts.push({ mode: 'fast', count: Array.isArray(fastOut?.definitions) ? fastOut.definitions.length : 0 });

        let chosen = fastOut;
        // If ambiguous or empty and precise not disabled, try precise pass
        const ambiguous = !fastOut?.definitions || fastOut.definitions.length !== 1;
        const doPrecise = args?.precise !== false && ambiguous;
        if (doPrecise) {
            const precise = await this.handleFindDefinition(
                { symbol, file, precise: true, maxResults: Math.min(50, Number(args?.maxResults || 50)) },
                { component: 'MCPAdapter', operation: 'workflow_locate_confirm_definition', timestamp: Date.now() }
            );
            const preciseOut = this.safeParseContent(precise);
            attempts.push({
                mode: 'precise',
                count: Array.isArray(preciseOut?.definitions) ? preciseOut.definitions.length : 0,
            });
            // Prefer precise when it yields any results
            if (preciseOut?.definitions && preciseOut.definitions.length > 0) {
                chosen = preciseOut;
            }
        }

        const out = {
            ok: Array.isArray(chosen?.definitions) && chosen.definitions.length > 0,
            symbol,
            attempts,
            definitions: chosen?.definitions || [],
            decision: ambiguous && doPrecise ? 'precise_retry' : 'fast',
        };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
    }

    private safeParseContent(result: any): any {
        try {
            const txt = result?.content?.[0]?.text;
            if (!txt) return result;
            return JSON.parse(txt);
        } catch {
            return result;
        }
    }
    private async handleGetSnapshot(args: Record<string, any>) {
        const snap = overlayStore.createSnapshot(!!args?.preferExisting);
        return { content: [{ type: 'text', text: JSON.stringify({ snapshot: snap.id }, null, 2) }], isError: false };
    }

    private async handleProposePatch(args: Record<string, any>) {
        const patch = String(args?.patch || '');
        const snapshot = String(args?.snapshot || '');
        if (!patch) {
            return { content: [{ type: 'text', text: 'Missing patch' }], isError: true };
        }
        try {
            const snap = overlayStore.ensureSnapshot(snapshot);
            const res = overlayStore.stagePatch(snap.id, patch);
            const payload = { accepted: res.accepted, snapshot: snap.id, message: res.message };
            return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: !res.accepted };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: `Invalid snapshot: ${msg}` }], isError: true };
        }
    }

    private async handleRunChecks(args: Record<string, any>) {
        const snapshot = String(args?.snapshot || '');
        if (!snapshot) {
            return { content: [{ type: 'text', text: 'Missing snapshot' }], isError: true };
        }
        const cmds = Array.isArray(args?.commands) ? (args?.commands as string[]) : [];
        const timeoutSec = typeof args?.timeoutSec === 'number' ? args.timeoutSec : 120;
        let res: any;
        try {
            res = await overlayStore.runChecks(snapshot, cmds, timeoutSec);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: `Invalid snapshot: ${msg}` }], isError: true };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        { snapshot, ok: res.ok, elapsedMs: res.elapsedMs, output: res.output.slice(-4000) },
                        null,
                        2
                    ),
                },
            ],
            isError: !res.ok,
        };
    }

    private async handleApplySnapshot(args: Record<string, any>) {
        const snapshot = String(args?.snapshot || '').trim();
        const check = !!args?.check;
        if (!snapshot) {
            return { content: [{ type: 'text', text: 'Missing snapshot' }], isError: true };
        }
        if (process.env.ALLOW_SNAPSHOT_APPLY !== '1') {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'apply_snapshot is disabled. Set ALLOW_SNAPSHOT_APPLY=1 to enable.',
                    },
                ],
                isError: true,
            };
        }
        try {
            const res = await overlayStore.applyToWorkingTree(snapshot, { check });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            { snapshot, ok: res.ok, elapsedMs: res.elapsedMs, output: res.output.slice(-4000) },
                            null,
                            2
                        ),
                    },
                ],
                isError: !res.ok,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: `apply_snapshot failed: ${msg}` }], isError: true };
        }
    }

    // --- New handlers: search ---
    private async handleTextSearch(args: Record<string, any>) {
        const query = String(args?.query || '').trim();
        if (!query) return { content: [{ type: 'text', text: 'query required' }], isError: true };
        const kind = (args?.kind as string) || 'literal';
        const caseInsensitive = !!args?.caseInsensitive;
        const maxResults = Math.min(Number(args?.maxResults || 200), 1000);
        const path = String(args?.path || process.cwd());
        const asyncGrep = new AsyncEnhancedGrep({ cacheSize: 500, cacheTTL: 30000 });
        const pattern =
            kind === 'word' ? `\\b${escapeRegex(query)}\\b` : kind === 'literal' ? escapeRegex(query) : query;
        const results = await asyncGrep.search({ pattern, path, maxResults, timeout: 2000, caseInsensitive });
        const normalized = results.map((r) => ({
            file: r.file,
            line: r.line ?? 0,
            column: r.column ?? 0,
            text: r.text,
        }));
        return {
            content: [
                { type: 'text', text: JSON.stringify({ count: normalized.length, results: normalized }, null, 2) },
            ],
            isError: false,
        };
    }

    private async handleSymbolSearch(args: Record<string, any>) {
        const query = String(args?.query || '').trim();
        if (!query) return { content: [{ type: 'text', text: 'query required' }], isError: true };
        const maxResults = Math.min(Number(args?.maxResults || 50), 200);
        const res = await (this.coreAnalyzer as any).buildSymbolMap({
            identifier: query,
            maxFiles: maxResults,
            astOnly: true,
        });
        const out = (res?.declarations || [])
            .slice(0, maxResults)
            .map((d: any) => ({ uri: d.uri, range: d.range, kind: d.kind, name: d.name || query }));
        return {
            content: [{ type: 'text', text: JSON.stringify({ query, count: out.length, symbols: out }, null, 2) }],
            isError: false,
        };
    }

    private async handleAstQuery(args: Record<string, any>) {
        const language = String(args?.language || '').trim();
        const query = String(args?.query || '').trim();
        if (!language || !query)
            return { content: [{ type: 'text', text: 'language and query required' }], isError: true };
        const paths = Array.isArray(args?.paths) ? (args.paths as string[]) : undefined;
        const glob = typeof args?.glob === 'string' ? (args.glob as string) : undefined;
        const limit = typeof args?.limit === 'number' ? args.limit : undefined;
        const { runAstQuery } = await import('../core/ast-query.js');
        const out = await runAstQuery({ language: language as any, query, paths, glob, limit });
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
    }

    private async handleGraphExpand(args: Record<string, any>) {
        const edges = Array.isArray(args?.edges) ? (args.edges as string[]) : ['imports', 'exports'];
        const file = typeof args?.file === 'string' ? (args.file as string) : undefined;
        const symbol = typeof args?.symbol === 'string' ? (args.symbol as string) : undefined;
        if (!file && !symbol) return { content: [{ type: 'text', text: 'file or symbol required' }], isError: true };
        try {
            const { expandNeighbors } = await import('../core/code-graph.js');
            let seedFiles: string[] | undefined;
            if (symbol) {
                try {
                    const sm = await (this.coreAnalyzer as any).buildSymbolMap({
                        identifier: symbol,
                        maxFiles: 50,
                        astOnly: true,
                    });
                    seedFiles = Array.from(
                        new Set(
                            (sm?.declarations || []).map((d: any) => {
                                try {
                                    return new URL(d.uri).pathname;
                                } catch {
                                    return d.uri.replace(/^file:\/\//, '');
                                }
                            })
                        )
                    );
                } catch {}
            }
            const out = await expandNeighbors({ file, symbol, edges, depth: args?.depth, limit: args?.limit, seedFiles });
            return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
        } catch {
            const neighbors: Record<string, any[]> = { imports: [], exports: [], callers: [], callees: [] };
            const note = 'fallback: graph expand unavailable; returning empty neighbors';
            const payload = file ? { file, neighbors, note } : { symbol: symbol || '', neighbors, note };
            return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: false };
        }
    }

    private wordAt(text: string, pos: { line: number; character: number }): string | null {
        const lines = text.split(/\r?\n/);
        if (pos.line < 0 || pos.line >= lines.length) return null;
        const line = lines[pos.line] || '';
        const idx = Math.min(Math.max(pos.character, 0), line.length);
        const re = /[A-Za-z0-9_]+/g;
        let m: RegExpExecArray | null = null;
        while ((m = re.exec(line))) {
            const start = m.index;
            const end = start + m[0].length;
            if (idx >= start && idx <= end) return m[0];
        }
        return null;
    }

    /**
     * Handle find_definition tool call with validation
     */
    private async handleFindDefinition(args: Record<string, any>, context: ErrorContext) {
        const position = args.position ? normalizePosition(args.position) : createPosition(0, 0);
        let symbol: string = typeof args.symbol === 'string' ? args.symbol : '';
        // Try derive symbol from file+position when not provided
        const uri = args.file ? normalizeUri(args.file) : null;
        if (!symbol && uri) {
            try {
                const fsPath = uri.startsWith('file://') ? uri.substring(7) : uri;
                const exists = await fs.stat(fsPath).then(() => true).catch(() => false);
                if (exists) {
                    const text = await fs.readFile(fsPath, 'utf8');
                    const derived = this.wordAt(text, position);
                    if (derived) symbol = derived;
                }
            } catch {}
        }
        if (!symbol && !uri) {
            throw new CoreError('InvalidParams', 'Missing required parameter: symbol');
        }

        // Ensure core is initialized for E2E/local flows
        try { await (this.coreAnalyzer as any)?.initialize?.(); } catch {}

        if (!uri) {
            // Use workspace-wide search to find the symbol
            // This will trigger Layer 1's search capabilities
            const workspaceRequest = buildFindDefinitionRequest({
                uri: '', // Empty URI triggers workspace search
                position,
                identifier: symbol,
                maxResults: this.config.maxResults,
                includeDeclaration: true,
                precise: !!args.precise,
            });

            try {
                // Quick explicit declaration scan to prefer true definitions in small workspaces
                const wsRoot = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
                const explicit = await this.scanForExplicitDeclaration(wsRoot, symbol);
                if (explicit) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        definitions: [definitionToApiResponse(explicit as any)],
                                        performance: {
                                            layer1: 0,
                                            layer2: 0,
                                            layer3: 0,
                                            layer4: 0,
                                            layer5: 0,
                                            total: 0,
                                        },
                                        requestId: undefined,
                                        count: 1,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                        isError: false,
                    };
                }
                const result = await (this.coreAnalyzer as any).findDefinitionAsync(workspaceRequest);
                let prioritized = Array.isArray(result.data)
                    ? result.data.slice().sort((a: any, b: any) => {
                          const prioKind = (k: string) =>
                              k === 'class'
                                  ? 4
                                  : k === 'function'
                                    ? 3
                                    : k === 'interface'
                                      ? 2
                                      : k === 'variable'
                                        ? 1
                                        : 0;
                          const toBase = (u: string) => {
                              try {
                                  const p = new URL(u).pathname;
                                  return p.split('/').pop() || p;
                              } catch {
                                  return u.split('/').pop() || u;
                              }
                          };
                          const name = String(symbol || '').toLowerCase();
                          const aBase = toBase(a.uri).toLowerCase();
                          const bBase = toBase(b.uri).toLowerCase();
                          const aNameHit = aBase.includes(name) ? 1 : 0;
                          const bNameHit = bBase.includes(name) ? 1 : 0;
                          if (aNameHit !== bNameHit) return bNameHit - aNameHit;
                          const kindDiff = prioKind(b.kind) - prioKind(a.kind);
                          if (kindDiff !== 0) return kindDiff;
                          return (b.confidence || 0) - (a.confidence || 0);
                      })
                    : result.data;

                // If top result doesn't look like the defining file, try a quick targeted scan
                try {
                    const toBase = (u: string) => {
                        try {
                            const p = new URL(u).pathname;
                            return p.split('/').pop() || p;
                        } catch {
                            return u.split('/').pop() || u;
                        }
                    };
                    const top = Array.isArray(prioritized) && prioritized[0] ? prioritized[0] : null;
                    const name = String(args.symbol || '').toLowerCase();
                    const likelyTop = top ? toBase(top.uri).toLowerCase().includes(name) : false;
                    if (!likelyTop) {
                        const wsRoot = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
                        const fallbackDefs = await this.fallbackScanForDefinition(wsRoot, args.symbol, 300);
                        const match = fallbackDefs.find((d) => toBase(d.uri).toLowerCase().includes(name));
                        if (match) {
                            prioritized = [match, ...prioritized];
                        }
                        // As a final tie-breaker, inspect candidate lines to detect declarations
                        if (Array.isArray(prioritized) && prioritized.length) {
                            const fs = await import('fs/promises');
                            const declRe = new RegExp(`\\b(class|function|interface|type)\\s+${args.symbol}\\b`);
                            for (const def of prioritized.slice(0, 200)) {
                                try {
                                    const filePath = (() => {
                                        try {
                                            return new URL(def.uri).pathname;
                                        } catch {
                                            return def.uri.replace(/^file:\/\//, '');
                                        }
                                    })();
                                    const text = await fs.readFile(filePath, 'utf8');
                                    const lines = text.split(/\r?\n/);
                                    const line = lines[def.range?.start?.line ?? 0] || '';
                                    if (declRe.test(line)) {
                                        // Promote this as the top result
                                        prioritized = [def, ...prioritized.filter((d: any) => d !== def)];
                                        break;
                                    }
                                } catch {}
                            }
                        }
                    }
                } catch {}
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    definitions: prioritized.map((def: any) => definitionToApiResponse(def)),
                                    performance: result.performance,
                                    requestId: result.requestId,
                                    count: Array.isArray(prioritized) ? prioritized.length : 0,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: false,
                };
            } catch (e) {
                // Fallback: perform a very small, bounded scan in the configured workspace root
                const wsRoot = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
                const fallbackDefs = await this.fallbackScanForDefinition(wsRoot, args.symbol, 200);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    definitions: fallbackDefs.map((def: any) => definitionToApiResponse(def)),
                                    performance: { layer1: 0, layer2: 0, layer3: 0, layer4: 0, layer5: 0, total: 0 },
                                    requestId: undefined,
                                    count: fallbackDefs.length,
                                    fallback: true,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: false,
                };
            }
        }

        // Normal path when file is provided
        const request = buildFindDefinitionRequest({
            uri,
            position,
            identifier: args.symbol,
            maxResults: this.config.maxResults,
            includeDeclaration: true,
        });

        const result = await (this.coreAnalyzer as any).findDefinitionAsync(request);
        const prioritized = Array.isArray(result.data)
            ? result.data.slice().sort((a: any, b: any) => {
                  const prioKind = (k: string) =>
                      k === 'class' ? 4 : k === 'function' ? 3 : k === 'interface' ? 2 : k === 'variable' ? 1 : 0;
                  const toBase = (u: string) => {
                      try {
                          const p = new URL(u).pathname;
                          return p.split('/').pop() || p;
                      } catch {
                          return u.split('/').pop() || u;
                      }
                  };
                  const name = String(args.symbol || '').toLowerCase();
                  const aBase = toBase(a.uri).toLowerCase();
                  const bBase = toBase(b.uri).toLowerCase();
                  const aNameHit = aBase.includes(name) ? 1 : 0;
                  const bNameHit = bBase.includes(name) ? 1 : 0;
                  if (aNameHit !== bNameHit) return bNameHit - aNameHit;
                  const kindDiff = prioKind(b.kind) - prioKind(a.kind);
                  if (kindDiff !== 0) return kindDiff;
                  return (b.confidence || 0) - (a.confidence || 0);
              })
            : result.data;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            definitions: prioritized.map((def: any) => definitionToApiResponse(def)),
                            performance: result.performance,
                            requestId: result.requestId,
                            count: Array.isArray(prioritized) ? prioritized.length : 0,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    // Extremely limited fallback used only when async fast-path times out in tests or constrained environments
    private async fallbackScanForDefinition(root: string, symbol: string, maxFiles: number) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const results: any[] = [];
        const queue: string[] = [root];
        const visited: Set<string> = new Set();
        const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`);
        let filesScanned = 0;

        while (queue.length && filesScanned < maxFiles && results.length === 0) {
            const dir = queue.shift()!;
            if (visited.has(dir)) continue;
            visited.add(dir);
            let entries: any[] = [];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true } as any);
            } catch {
                continue;
            }
            for (const ent of entries) {
                const p = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (/node_modules|\.git|dist|coverage|out|build|venv|\.venv/.test(ent.name)) continue;
                    queue.push(p);
                } else if (ent.isFile() && /\.(ts|tsx|js|jsx|md)$/.test(ent.name)) {
                    filesScanned++;
                    try {
                        const text = await fs.readFile(p, 'utf8');
                        const lines = text.split(/\r?\n/);
                        for (let i = 0; i < lines.length; i++) {
                            if (re.test(lines[i])) {
                                results.push({
                                    identifier: symbol,
                                    uri: `file://${p}`,
                                    range: {
                                        start: { line: i, character: Math.max(0, lines[i].indexOf(symbol)) },
                                        end: {
                                            line: i,
                                            character: Math.max(0, lines[i].indexOf(symbol)) + symbol.length,
                                        },
                                    },
                                    kind: DefinitionKind.Class,
                                    name: symbol,
                                    source: 'exact',
                                    confidence: 0.5,
                                    layer: 'async-layer1',
                                });
                                break;
                            }
                        }
                    } catch {}
                    if (results.length > 0) break;
                }
                if (filesScanned >= maxFiles || results.length > 0) break;
            }
        }
        return results;
    }

    // Targeted scan to detect explicit declarations like class/function/interface/type <Symbol>
    private async scanForExplicitDeclaration(root: string, symbol: string) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const queue: string[] = [root];
        const visited: Set<string> = new Set();
        const declRe = new RegExp(`\\b(class|function|interface|type)\\s+${symbol}\\b`);

        while (queue.length) {
            const dir = queue.shift()!;
            if (visited.has(dir)) continue;
            visited.add(dir);
            let entries: any[] = [];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true } as any);
            } catch {
                continue;
            }
            for (const ent of entries) {
                const p = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (/node_modules|\.git|dist|coverage|out|build|venv|\.venv/.test(ent.name)) continue;
                    queue.push(p);
                } else if (ent.isFile() && /\.(ts|tsx|js|jsx|md)$/.test(ent.name)) {
                    try {
                        const text = await fs.readFile(p, 'utf8');
                        const lines = text.split(/\r?\n/);
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (declRe.test(line)) {
                                const col = Math.max(0, line.indexOf(symbol));
                                return {
                                    identifier: symbol,
                                    uri: `file://${p}`,
                                    range: {
                                        start: { line: i, character: col },
                                        end: { line: i, character: col + symbol.length },
                                    },
                                    kind: /class\s+/.test(line)
                                        ? DefinitionKind.Class
                                        : /function\s+/.test(line)
                                          ? DefinitionKind.Function
                                          : /interface\s+/.test(line)
                                            ? DefinitionKind.Interface
                                            : DefinitionKind.Variable,
                                    name: symbol,
                                    source: 'exact',
                                    confidence: 0.95,
                                    layer: 'async-layer1',
                                };
                            }
                        }
                    } catch {}
                }
            }
        }
        return null;
    }

    /**
     * Handle find_references tool call with validation
     */
    private async handleFindReferences(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['symbol'], context);
        try { await (this.coreAnalyzer as any)?.initialize?.(); } catch {}

        // For MCP, we don't have exact position, so use symbol-based search
        const request = buildFindReferencesRequest({
            uri: normalizeUri('file://workspace'),
            position: createPosition(0, 0),
            identifier: args.symbol,
            maxResults: this.config.maxResults,
            includeDeclaration: args.includeDeclaration ?? false,
            precise: !!args.precise,
        });

        const result = await (this.coreAnalyzer as any).findReferencesAsync(request);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            references: result.data.map((ref: any) => referenceToApiResponse(ref)),
                            performance: result.performance,
                            requestId: result.requestId,
                            count: result.data.length,
                            scope: args.scope || 'workspace',
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle rename_symbol tool call with validation
     */
    private async handleRenameSymbol(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['oldName', 'newName'], context);

        const request = buildRenameRequest({
            uri: normalizeUri('file://workspace'),
            position: createPosition(0, 0),
            identifier: args.oldName,
            newName: args.newName,
            dryRun: args.preview ?? true,
        });

        const result = await this.coreAnalyzer.rename(request);

        const changes = Object.entries(result.data.changes || {}).map(([uri, edits]) => ({
            file: uri,
            edits: (edits as any[]).map((edit: any) => ({
                range: {
                    start: { line: edit.range.start.line, character: edit.range.start.character },
                    end: { line: edit.range.end.line, character: edit.range.end.character },
                },
                newText: edit.newText,
            })),
        }));

        // eslint-disable-next-line no-console
        console.error('[MCPAdapter] rename_symbol returning content payload');
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            changes,
                            performance: result.performance,
                            requestId: result.requestId,
                            preview: args.preview ?? true,
                            scope: args.scope || 'exact',
                            summary: `${changes.length} files affected with ${changes.reduce((acc, c) => acc + c.edits.length, 0)} edits`,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle plan_rename tool call
     */
    private async handlePlanRename(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['oldName', 'newName'], context);

        const request = buildRenameRequest({
            uri: normalizeUri(args.file || 'file://workspace'),
            position: createPosition(0, 0),
            identifier: args.oldName,
            newName: args.newName,
            dryRun: true,
        });

        const result = await this.coreAnalyzer.rename(request);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            changes: result.data.changes,
                            performance: result.performance,
                            requestId: result.requestId,
                            preview: true,
                            summary: {
                                filesAffected: Object.keys(result.data.changes || {}).length,
                                totalEdits: Object.values(result.data.changes || {}).reduce(
                                    (acc: number, edits: any) => acc + (edits as any[]).length,
                                    0
                                ),
                            },
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle apply_rename tool call
     * For now, delegate to rename with dryRun=false if both oldName/newName are provided; otherwise accept direct changes
     */
    private async handleApplyRename(args: Record<string, any>, context: ErrorContext) {
        // If explicit plan supplied, return it as applied (core doesn’t persist edits here)
        if (args && typeof args === 'object' && args.changes) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ status: 'applied', changes: args.changes }, null, 2),
                    },
                ],
                isError: false,
            };
        }

        // Or execute a rename apply
        this.validateArgs(args, ['oldName', 'newName'], context);
        const request = buildRenameRequest({
            uri: normalizeUri(args.file || 'file://workspace'),
            position: createPosition(0, 0),
            identifier: args.oldName,
            newName: args.newName,
            dryRun: false,
        });
        const result = await this.coreAnalyzer.rename(request);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            status: 'applied',
                            changes: result.data.changes,
                            performance: result.performance,
                            requestId: result.requestId,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle build_symbol_map tool call
     */
    private async handleBuildSymbolMap(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['symbol'], context);
        const res = await (this.coreAnalyzer as any).buildSymbolMap({
            identifier: args.symbol,
            uri: normalizeUri(args.file || 'file://workspace'),
            maxFiles: Math.min(Number(args.maxFiles || 20), 100),
            astOnly: !!args.astOnly,
        });
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle generate_tests tool call with validation (stub - not implemented in core yet)
     */
    private async handleGenerateTests(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['target'], context);

        // This is a stub implementation - core analyzer doesn't have test generation yet
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            message: 'Test generation not yet implemented in core analyzer',
                            target: args.target,
                            framework: args.framework || 'auto',
                            coverage: args.coverage || 'comprehensive',
                            status: 'not_implemented',
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: false,
        };
    }

    /**
     * Handle explore_codebase tool call by fanning out multiple analyses in parallel
     */
    private async handleExploreCodebase(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['symbol'], context);

        const maxResults = typeof args.maxResults === 'number' ? args.maxResults : this.config.maxResults;
        const includeDeclaration = args.includeDeclaration ?? true;

        const uri = args.file ? normalizeUri(args.file) : normalizeUri('file://workspace');
        const position = createPosition(0, 0);

        const defReq = buildFindDefinitionRequest({
            uri,
            position,
            identifier: args.symbol,
            maxResults,
            includeDeclaration,
        });

        const refReq = buildFindReferencesRequest({
            uri,
            position,
            identifier: args.symbol,
            maxResults: Math.min(maxResults ?? 100, 500),
            includeDeclaration: includeDeclaration ?? false,
        });

        // Execute in parallel
        // Delegate to core analyzer per VISION.md (thin adapter)
        const coreResult = await (this.coreAnalyzer as any).exploreCodebase({
            uri,
            identifier: args.symbol,
            includeDeclaration,
            maxResults,
            precise: !!args.precise,
            conceptual: !!args.conceptual,
        });

        // Map definitions/references for MCP output while preserving performance/diagnostics
        const mapped = {
            symbol: coreResult.symbol,
            contextUri: coreResult.contextUri,
            definitions: coreResult.definitions.map((def: any) => definitionToApiResponse(def)),
            references: coreResult.references.map((ref: any) => referenceToApiResponse(ref)),
            performance: coreResult.performance,
            diagnostics: coreResult.diagnostics,
            timestamp: coreResult.timestamp,
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(mapped, null, 2),
                },
            ],
            isError: false,
        };
    }

    /**
     * Initialize the MCP adapter
     */
    async initialize(): Promise<void> {
        // MCP adapter doesn't need special initialization - just ensure core analyzer is ready
        // Core analyzer is passed in constructor and should already be initialized
    }

    /**
     * Dispose the MCP adapter
     */
    async dispose(): Promise<void> {
        // MCP adapter doesn't hold resources that need cleanup
    }

    /**
     * Execute MCP tool call (alias for handleToolCall for consistency)
     */
    async executeTool(request: { name: string; arguments: Record<string, any> }): Promise<any> {
        return await this.handleToolCall(request.name, request.arguments);
    }

    /**
     * Validate tool arguments with enhanced error messages
     */
    private validateArgs(args: Record<string, any>, requiredFields: string[], context: ErrorContext): void {
        if (!args || typeof args !== 'object') {
            throw createValidationError('Arguments must be an object', context);
        }

        for (const field of requiredFields) {
            if (args[field] === undefined || args[field] === null) {
                throw createValidationError(`Missing required parameter: ${field}`, context);
            }

            if (typeof args[field] === 'string' && args[field].trim() === '') {
                throw createValidationError(`Parameter '${field}' cannot be empty`, context);
            }
        }

        // Additional validation for specific fields
        if (args.position && typeof args.position === 'object') {
            if (typeof args.position.line !== 'number' || args.position.line < 0) {
                throw createValidationError('position.line must be a non-negative number', context);
            }
            if (typeof args.position.character !== 'number' || args.position.character < 0) {
                throw createValidationError('position.character must be a non-negative number', context);
            }
        }
    }

    /**
     * Sanitize arguments for logging
     */
    private sanitizeForLogging(args: any): any {
        if (!args || typeof args !== 'object') return args;

        const sanitized = { ...args };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];

        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    /**
     * Get adapter diagnostics
     */
    getDiagnostics(): Record<string, any> {
        return {
            adapter: 'mcp',
            config: this.config,
            availableTools: this.getTools().map((t) => t.name),
            coreAnalyzer: this.coreAnalyzer.getDiagnostics ? this.coreAnalyzer.getDiagnostics() : {},
            timestamp: Date.now(),
        };
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
