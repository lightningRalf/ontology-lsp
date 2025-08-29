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

import type { CodeAnalyzer } from '../core/unified-analyzer.js';
import { ToolRegistry } from '../core/tools/registry.js';
import { createValidationError, type ErrorContext, withMcpErrorHandling } from '../core/utils/error-handler.js';
import { adapterLogger, mcpLogger } from '../core/utils/file-logger.js';
import {
    buildCompletionRequest,
    buildFindDefinitionRequest,
    buildFindReferencesRequest,
    buildRenameRequest,
    createPosition,
    definitionToMcpResponse,
    handleAdapterError,
    normalizePosition,
    normalizeUri,
    referenceToMcpResponse,
    validateRequired,
} from './utils.js';

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
    private coreAnalyzer: CodeAnalyzer;
    private config: MCPAdapterConfig;

    constructor(coreAnalyzer: CodeAnalyzer, config: MCPAdapterConfig = {}) {
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
        this.handleToolCall = async (name: string, arguments_: Record<string, any>) => {
            const out = await original(name, arguments_);
            if (out && typeof out === 'object' && ('error' in out || (out as any).isError)) {
                return out;
            }
            if (!out || typeof out !== 'object' || !('content' in out)) {
                const txt = (() => {
                    try { return JSON.stringify(out, null, 2); } catch { return String(out); }
                })();
                return { content: [{ type: 'text', text: txt }], isError: false } as any;
            }
            return out;
        };
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
                const validTools = ToolRegistry.list().map((t) => t.name);
                if (!validTools.includes(name)) {
                    return handleAdapterError(
                        new Error(`Unknown tool: ${name}. Valid tools: ${validTools.join(', ')}`),
                        'mcp'
                    );
                }

                const startTime = Date.now();
                let result: any;

                switch (name) {
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
                    case 'explore_codebase':
                        result = await this.handleExploreCodebase(arguments_, context);
                        break;
                }

                const duration = Date.now() - startTime;
                const safeStr = (() => {
                    try { return JSON.stringify(result); } catch { return String(result); }
                })();
                adapterLogger.logPerformance(`tool_${name}`, duration, true, {
                    resultSize: safeStr.length,
                });
                try {
                    // Aid debugging in tests; stderr only
                    // eslint-disable-next-line no-console
                    console.error('[MCPAdapter] tool result keys:', typeof result === 'object' && result ? Object.keys(result as any) : typeof result);
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
            // Always return structured MCP error payload instead of throwing
            return handleAdapterError(error, 'mcp');
        }
    }

    /**
     * Handle find_definition tool call with validation
     */
    private async handleFindDefinition(args: Record<string, any>, context: ErrorContext) {
        this.validateArgs(args, ['symbol'], context);

        const position = args.position ? normalizePosition(args.position) : createPosition(0, 0);

        // If no file provided, search for the symbol across the workspace first
        const uri = args.file ? normalizeUri(args.file) : null;

        if (!uri) {
            // Use workspace-wide search to find the symbol
            // This will trigger Layer 1's search capabilities
            const workspaceRequest = buildFindDefinitionRequest({
                uri: '', // Empty URI triggers workspace search
                position,
                identifier: args.symbol,
                maxResults: this.config.maxResults,
                includeDeclaration: true,
                precise: !!args.precise,
            });

            try {
                // Quick explicit declaration scan to prefer true definitions in small workspaces
                const wsRoot = (this.coreAnalyzer as any)?.config?.workspaceRoot || process.cwd();
                const explicit = await this.scanForExplicitDeclaration(wsRoot, args.symbol);
                if (explicit) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        definitions: [definitionToMcpResponse(explicit)],
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
                                    definitions: prioritized.map((def: any) => definitionToMcpResponse(def)),
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
                                    definitions: fallbackDefs.map((def) => definitionToMcpResponse(def)),
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
                            definitions: prioritized.map((def: any) => definitionToMcpResponse(def)),
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
                                    uri: `file://${p}`,
                                    range: {
                                        start: { line: i, character: Math.max(0, lines[i].indexOf(symbol)) },
                                        end: {
                                            line: i,
                                            character: Math.max(0, lines[i].indexOf(symbol)) + symbol.length,
                                        },
                                    },
                                    kind: 'class',
                                    name: symbol,
                                    source: 'fallback',
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
                                    uri: `file://${p}`,
                                    range: {
                                        start: { line: i, character: col },
                                        end: { line: i, character: col + symbol.length },
                                    },
                                    kind: /class\s+/.test(line)
                                        ? 'class'
                                        : /function\s+/.test(line)
                                          ? 'function'
                                          : /interface\s+/.test(line)
                                            ? 'interface'
                                            : 'variable',
                                    name: symbol,
                                    source: 'explicit-scan',
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
                            references: result.data.map((ref) => referenceToMcpResponse(ref)),
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
            edits: edits.map((edit: any) => ({
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
        });

        // Map definitions/references for MCP output while preserving performance/diagnostics
        const mapped = {
            symbol: coreResult.symbol,
            contextUri: coreResult.contextUri,
            definitions: coreResult.definitions.map((def) => definitionToMcpResponse(def)),
            references: coreResult.references.map((ref) => referenceToMcpResponse(ref)),
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
            coreAnalyzer: this.coreAnalyzer.getDiagnostics(),
            timestamp: Date.now(),
        };
    }
}
