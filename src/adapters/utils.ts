/**
 * Shared adapter utilities for common type conversions and protocol mappings
 * These utilities eliminate duplicate code between LSP, MCP, HTTP, and CLI adapters
 */

import type { Position, Range, URI } from 'vscode-languageserver';
import * as nodePath from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import type {
    Completion,
    CompletionRequest,
    CoreConfig,
    Definition,
    FindDefinitionRequest,
    FindReferencesRequest,
    PrepareRenameRequest,
    Reference,
    RenameRequest,
    WorkspaceEdit,
} from '../core/types';

// ===== URI CONVERSION UTILITIES =====

/**
 * Convert file paths to standard URIs
 */
export function pathToUri(filePath: string): string {
    try {
        // Resolve relative paths to absolute first
        const abs = nodePath.isAbsolute(filePath) ? filePath : nodePath.resolve(process.cwd(), filePath);
        return pathToFileURL(abs).href;
    } catch {
        // Fallback to naive conversion
        if (filePath.startsWith('file://')) return filePath;
        const abs = nodePath.isAbsolute(filePath) ? filePath : nodePath.resolve(process.cwd(), filePath);
        const norm = abs.replace(/\\/g, '/');
        return `file://${norm}`;
    }
}

/**
 * Convert URIs to file paths
 */
export function uriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
        try {
            return fileURLToPath(uri);
        } catch {
            // Fallback best-effort stripping
            const body = uri.replace(/^file:\/\//, '');
            return nodePath.isAbsolute(body) ? body : nodePath.resolve('/', body);
        }
    }
    // Treat plain strings as file paths; resolve to absolute
    return nodePath.isAbsolute(uri) ? uri : nodePath.resolve(process.cwd(), uri);
}

/**
 * Normalize URI format for consistency across protocols
 */
export function normalizeUri(uri: string): string {
    return pathToUri(uriToPath(uri));
}

// ===== POSITION AND RANGE UTILITIES =====

/**
 * Create a Position object with validation
 */
export function createPosition(line: number, character: number): Position {
    return {
        line: Math.max(0, line),
        character: Math.max(0, character),
    };
}

/**
 * Create a Range object with validation
 */
export function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return {
        start: createPosition(startLine, startChar),
        end: createPosition(endLine, endChar),
    };
}

/**
 * Convert from various position formats to standard Position
 */
export function normalizePosition(pos: any): Position {
    if (typeof pos === 'object' && pos !== null) {
        if (typeof pos.line === 'number' && typeof pos.character === 'number') {
            return createPosition(pos.line, pos.character);
        }
        if (typeof pos.line === 'number' && typeof pos.col === 'number') {
            return createPosition(pos.line, pos.col);
        }
        if (typeof pos.row === 'number' && typeof pos.column === 'number') {
            return createPosition(pos.row, pos.column);
        }
    }
    throw new Error(`Invalid position format: ${JSON.stringify(pos)}`);
}

/**
 * Convert from various range formats to standard Range
 */
export function normalizeRange(range: any): Range {
    if (typeof range === 'object' && range !== null) {
        if (range.start && range.end) {
            return {
                start: normalizePosition(range.start),
                end: normalizePosition(range.end),
            };
        }
        if (
            typeof range.startLine === 'number' &&
            typeof range.startChar === 'number' &&
            typeof range.endLine === 'number' &&
            typeof range.endChar === 'number'
        ) {
            return createRange(range.startLine, range.startChar, range.endLine, range.endChar);
        }
    }
    throw new Error(`Invalid range format: ${JSON.stringify(range)}`);
}

// ===== REQUEST BUILDERS =====

/**
 * Build a FindDefinitionRequest from generic parameters
 */
export function buildFindDefinitionRequest(params: {
    uri: string;
    position: Position;
    identifier?: string;
    maxResults?: number;
    includeDeclaration?: boolean;
    precise?: boolean;
}): FindDefinitionRequest {
    return {
        uri: normalizeUri(params.uri),
        position: params.position,
        identifier: params.identifier || '',
        maxResults: params.maxResults,
        includeDeclaration: params.includeDeclaration ?? true,
        precise: params.precise,
    };
}

/**
 * Build a FindReferencesRequest from generic parameters
 */
export function buildFindReferencesRequest(params: {
    uri: string;
    position: Position;
    identifier?: string;
    maxResults?: number;
    includeDeclaration?: boolean;
    precise?: boolean;
}): FindReferencesRequest {
    return {
        uri: normalizeUri(params.uri),
        position: params.position,
        identifier: params.identifier || '',
        maxResults: params.maxResults,
        includeDeclaration: params.includeDeclaration ?? false,
        precise: params.precise,
    };
}

/**
 * Build a PrepareRenameRequest from generic parameters
 */
export function buildPrepareRenameRequest(params: {
    uri: string;
    position: Position;
    identifier: string;
}): PrepareRenameRequest {
    return {
        uri: normalizeUri(params.uri),
        position: params.position,
        identifier: params.identifier,
    };
}

/**
 * Build a RenameRequest from generic parameters
 */
export function buildRenameRequest(params: {
    uri: string;
    position: Position;
    identifier: string;
    newName: string;
    dryRun?: boolean;
}): RenameRequest {
    return {
        uri: normalizeUri(params.uri),
        position: params.position,
        identifier: params.identifier,
        newName: params.newName,
        dryRun: params.dryRun ?? false,
    };
}

/**
 * Build a CompletionRequest from generic parameters
 */
export function buildCompletionRequest(params: {
    uri: string;
    position: Position;
    triggerCharacter?: string;
    maxResults?: number;
}): CompletionRequest {
    return {
        uri: normalizeUri(params.uri),
        position: params.position,
        triggerCharacter: params.triggerCharacter,
        maxResults: params.maxResults ?? 20,
    };
}

// ===== RESPONSE CONVERTERS =====

/**
 * Convert Definition to LSP Location format
 */
export function definitionToLspLocation(definition: Definition) {
    return {
        uri: definition.uri,
        range: definition.range,
    };
}

/**
 * Convert Reference to LSP Location format
 */
export function referenceToLspLocation(reference: Reference) {
    return {
        uri: reference.uri,
        range: reference.range,
    };
}

/**
 * Convert Completion to LSP CompletionItem format
 */
export function completionToLspItem(completion: Completion) {
    return {
        label: completion.label,
        kind: mapCompletionKind(completion.kind),
        detail: completion.detail,
        documentation: completion.documentation,
        sortText: completion.sortText || completion.label,
        insertText: completion.insertText || completion.label,
        confidence: completion.confidence,
    };
}

/**
 * Convert WorkspaceEdit to LSP format
 */
export function workspaceEditToLsp(edit: WorkspaceEdit) {
    return {
        changes: edit.changes,
    };
}

// ===== HTTP API CONVERTERS =====

/**
 * Convert Definition to HTTP API format
 */
export function definitionToApiResponse(definition: Definition) {
    return {
        uri: definition.uri,
        range: {
            start: { line: definition.range.start.line, character: definition.range.start.character },
            end: { line: definition.range.end.line, character: definition.range.end.character },
        },
        kind: definition.kind,
        source: definition.source,
        confidence: definition.confidence,
        astValidated: !!((definition as any).metadata?.astValidated || (definition as any).astValidated),
    };
}

/**
 * Convert Reference to HTTP API format
 */
export function referenceToApiResponse(reference: Reference) {
    return {
        uri: reference.uri,
        range: {
            start: { line: reference.range.start.line, character: reference.range.start.character },
            end: { line: reference.range.end.line, character: reference.range.end.character },
        },
        kind: reference.kind,
        confidence: reference.confidence,
        astValidated: !!((reference as any).metadata?.astValidated || (reference as any).astValidated),
    };
}

// ===== MCP CONVERTERS =====

/**
 * Convert Definition to MCP tool response format
 */
export function definitionToMcpResponse(definition: Definition) {
    return {
        uri: definition.uri,
        line: definition.range.start.line,
        character: definition.range.start.character,
        endLine: definition.range.end.line,
        endCharacter: definition.range.end.character,
        kind: definition.kind,
        source: definition.source,
        confidence: definition.confidence,
    };
}

/**
 * Convert Reference to MCP tool response format
 */
export function referenceToMcpResponse(reference: Reference) {
    return {
        uri: reference.uri,
        line: reference.range.start.line,
        character: reference.range.start.character,
        endLine: reference.range.end.line,
        endCharacter: reference.range.end.character,
        kind: reference.kind,
        confidence: reference.confidence,
    };
}

// ===== CLI FORMATTERS =====

/**
 * Format Definition for CLI output
 */
export function formatDefinitionForCli(definition: Definition): string {
    const absPath = uriToPath(definition.uri);
    const rel = safeRelative(absPath);
    const pos = `${definition.range.start.line + 1}:${definition.range.start.character + 1}`;
    const confidence = Math.round(definition.confidence * 100);
    const token = (definition as any).name || (definition as any).identifier || '';
    const tokenPart = token ? ` ${token}` : '';
    const ast = (definition as any).metadata?.astValidated || (definition as any).astValidated ? 'AST✓ ' : '';
    return `${rel}:${pos} [${definition.kind}]${tokenPart} (${ast}${confidence}% confidence)`;
}

/**
 * Format Reference for CLI output
 */
export function formatReferenceForCli(reference: Reference): string {
    const absPath = uriToPath(reference.uri);
    const rel = safeRelative(absPath);
    const pos = `${reference.range.start.line + 1}:${reference.range.start.character + 1}`;
    const confidence = Math.round(reference.confidence * 100);
    const token = (reference as any).name || '';
    const tokenPart = token ? ` ${token}` : '';
    const ast = (reference as any).metadata?.astValidated || (reference as any).astValidated ? 'AST✓ ' : '';
    return `${rel}:${pos} [${reference.kind}]${tokenPart} (${ast}${confidence}% confidence)`;
}

// ===== PATH HELPERS =====
function safeRelative(absPath: string): string {
    try {
        const cwd = process.cwd().replace(/\\/g, '/');
        const normAbs = absPath.replace(/\\/g, '/');
        if (normAbs.startsWith(cwd)) {
            const rel = nodePath.posix.relative(cwd, normAbs);
            return rel || '.';
        }
        // If not under cwd, return basename + parent hint for readability
        const base = nodePath.basename(normAbs);
        const parent = nodePath.basename(nodePath.dirname(normAbs));
        return `${parent}/${base}`;
    } catch {
        return absPath;
    }
}

/**
 * Format Completion for CLI output
 */
export function formatCompletionForCli(completion: Completion): string {
    const confidence = Math.round(completion.confidence * 100);
    const detail = completion.detail ? ` - ${completion.detail}` : '';
    return `${completion.label} [${completion.kind}] (${confidence}% confidence)${detail}`;
}

// ===== ERROR HANDLING =====

/**
 * Standardize error responses across protocols
 */
export interface AdapterError {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
}

/**
 * Create standardized adapter error
 */
export function createAdapterError(code: string, message: string, details?: any, requestId?: string): AdapterError {
    return {
        code,
        message,
        details,
        requestId,
    };
}

/**
 * Convert core errors to protocol-specific format
 */
export function handleAdapterError(error: any, protocol: 'lsp' | 'mcp' | 'http' | 'cli') {
    const adapterError: AdapterError =
        error instanceof Error
            ? {
                  code: 'ADAPTER_ERROR',
                  message: error.message,
                  details: error.stack,
              }
            : {
                  code: 'UNKNOWN_ERROR',
                  message: String(error),
              };

    switch (protocol) {
        case 'lsp':
            return { code: -32603, message: adapterError.message, data: adapterError.details };
        case 'mcp':
            return { error: { code: adapterError.code, message: adapterError.message }, message: adapterError.message };
        case 'http':
            return {
                error: true,
                code: adapterError.code,
                message: adapterError.message,
                details: adapterError.details,
            };
        case 'cli':
            return `Error: ${adapterError.message}`;
        default:
            return adapterError;
    }
}

// ===== UTILITY HELPERS =====

/**
 * Map completion kinds between different protocol formats
 */
function mapCompletionKind(kind: string): number {
    const kindMap: Record<string, number> = {
        text: 1,
        method: 2,
        function: 3,
        constructor: 4,
        field: 5,
        variable: 6,
        class: 7,
        interface: 8,
        module: 9,
        property: 10,
        unit: 11,
        value: 12,
        enum: 13,
        keyword: 14,
        snippet: 15,
        color: 16,
        file: 17,
        reference: 18,
    };

    return kindMap[kind] || 1; // Default to text
}

/**
 * Create a default core configuration
 */
export function createDefaultCoreConfig(): CoreConfig {
    const cfg = {
        layers: {
            layer1: {
                enabled: true,
                timeout: 5000,
                maxResults: 100,
                fileTypes: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rust'],
                grep: {
                    defaultTimeout: 5000,
                    maxResults: 100,
                    caseSensitive: false,
                    includeContext: true,
                    contextLines: 3,
                },
                glob: {
                    defaultTimeout: 3000,
                    maxFiles: 1000,
                    ignorePatterns: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**'],
                },
                ls: {
                    defaultTimeout: 2000,
                    maxDepth: 10,
                    followSymlinks: false,
                    includeDotfiles: false,
                },
                optimization: {
                    bloomFilter: false, // DISABLED - bloom filter is preventing legitimate searches
                    frequencyCache: true,
                    parallelSearch: true,
                },
                caching: {
                    enabled: true,
                    ttl: 300, // 5 minutes in seconds
                    maxEntries: 1000,
                },
            },
            layer2: {
                enabled: true,
                timeout: 50000,
                languages: ['typescript', 'javascript', 'python'],
                maxFileSize: 1024 * 1024, // 1MB
                parseTimeout: 50,
            },
            layer3: {
                enabled: true,
                timeout: 10000,
                dbPath: '.ontology/ontology.db',
                cacheSize: 1000,
                conceptThreshold: 0.5,
                relationshipDepth: 3,
            },
            layer4: {
                enabled: true,
                timeout: 10000,
                learningThreshold: 3,
                confidenceThreshold: 0.7,
                maxPatterns: 1000,
                decayRate: 0.95,
            },
            layer5: {
                enabled: true,
                timeout: 20000,
                maxDepth: 3,
                autoApplyThreshold: 0.8,
                propagationTimeout: 100,
            },
        },
        cache: {
            enabled: true,
            strategy: 'memory',
            memory: {
                maxSize: 100 * 1024 * 1024, // 100MB
                ttl: 300, // 5 minutes in seconds
            },
        },
        performance: {
            enableTiming: true,
            enableProfiling: false,
            logSlowOperations: true,
            slowOperationThresholdMs: 1000,
            // Optional external tooling preferences (gracefully ignored if unavailable)
            tools: {
                fileDiscovery: {
                    // auto: prefer fd if available; fallback to rg --files (default)
                    // values: 'auto' | 'rg' | 'fd'
                    prefer: 'auto',
                },
                tree: {
                    // auto: prefer eza -T if available; fallback to internal/ls-based tree
                    // values: 'auto' | 'eza' | 'tree' | 'none'
                    prefer: 'auto',
                },
            },
            // Smart Escalation v2 config surface (deterministic defaults)
            escalation: {
                policy: 'auto',
                l1ConfidenceThreshold: 0.75,
                l1AmbiguityMaxFiles: 5,
                l1RequireFilenameMatch: false,
                layer2: {
                    budgetMs: 75,
                    maxCandidateFiles: 10,
                },
                layer3: {
                    budgetMs: 50,
                },
            },
        },
    } as CoreConfig;

    // Environment overrides for quick tuning
    const env = process.env;
    const esc = (cfg.performance as any).escalation || {};
    if (env.ESCALATION_L2_BUDGET_MS && !isNaN(Number(env.ESCALATION_L2_BUDGET_MS))) {
        esc.layer2 = esc.layer2 || {};
        esc.layer2.budgetMs = Math.max(0, Number(env.ESCALATION_L2_BUDGET_MS));
    }
    if (env.ESCALATION_L1_CONFIDENCE_THRESHOLD && !isNaN(Number(env.ESCALATION_L1_CONFIDENCE_THRESHOLD))) {
        esc.l1ConfidenceThreshold = Math.max(0, Math.min(1, Number(env.ESCALATION_L1_CONFIDENCE_THRESHOLD)));
    }
    if (env.ESCALATION_L1_AMBIGUITY_MAX_FILES && !isNaN(Number(env.ESCALATION_L1_AMBIGUITY_MAX_FILES))) {
        esc.l1AmbiguityMaxFiles = Math.max(1, Number(env.ESCALATION_L1_AMBIGUITY_MAX_FILES));
    }
    if (env.ESCALATION_L1_REQUIRE_FILENAME_MATCH) {
        const v = (env.ESCALATION_L1_REQUIRE_FILENAME_MATCH || '').toLowerCase();
        esc.l1RequireFilenameMatch = v === '1' || v === 'true' || v === 'yes';
    }
    (cfg.performance as any).escalation = esc;
    return cfg;
}

/**
 * Validate required parameters exist
 */
export function validateRequired(params: Record<string, any>, required: string[]): void {
    for (const field of required) {
        if (params[field] === undefined || params[field] === null) {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse(jsonString: string, fallback: any = null): any {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('Failed to parse JSON:', error);
        return fallback;
    }
}

/**
 * Strict JSON parse that throws on invalid JSON
 */
export function strictJsonParse(jsonString: string): any {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(null, args), wait);
    };
}
