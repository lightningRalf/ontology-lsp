import * as nodePath from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Position, Range } from 'vscode-languageserver';
import type {
  CompletionRequest,
  CoreConfig,
  Definition,
  FindDefinitionRequest,
  FindReferencesRequest,
  Reference,
  RenameRequest,
} from '../core/types.js';
import { AnalyzerFactory } from '../core/analyzer-factory.js';

export function pathToUri(filePath: string): string {
  try {
    if (filePath.startsWith('file://')) return filePath;
    const abs = nodePath.isAbsolute(filePath) ? filePath : nodePath.resolve(process.cwd(), filePath);
    return pathToFileURL(abs).href;
  } catch {
    return filePath.startsWith('file://') ? filePath : '';
  }
}

export function uriToPath(uri: string): string {
  const WORKSPACE_PREFIX = 'file://workspace';
  const getWorkspaceRoot = () => process.env.ONTOLOGY_WORKSPACE || process.env.WORKSPACE_ROOT || process.cwd();
  if (uri.startsWith(WORKSPACE_PREFIX)) {
    const ws = getWorkspaceRoot();
    const sub = uri.length > WORKSPACE_PREFIX.length ? uri.substring(WORKSPACE_PREFIX.length) : '';
    const rel = sub.replace(/^\/+/, '');
    const p = rel ? nodePath.join(ws, rel) : ws;
    return nodePath.resolve(p);
  }
  if (uri.startsWith('file://')) {
    try {
      return fileURLToPath(uri);
    } catch {
      const body = uri.replace(/^file:\/\//, '');
      return nodePath.isAbsolute(body) ? body : nodePath.resolve('/', body);
    }
  }
  return nodePath.isAbsolute(uri) ? uri : nodePath.resolve(process.cwd(), uri);
}

export function normalizeUri(uri: string): string {
  return pathToUri(uriToPath(uri));
}

export function createPosition(line: number, character: number): Position {
  return { line: Math.max(0, line), character: Math.max(0, character) };
}

export function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return { start: createPosition(startLine, startChar), end: createPosition(endLine, endChar) };
}

export function normalizePosition(pos: any): Position {
  if (typeof pos === 'object' && pos) {
    if (typeof pos.line === 'number' && typeof pos.character === 'number') return createPosition(pos.line, pos.character);
    if (typeof pos.line === 'number' && typeof pos.col === 'number') return createPosition(pos.line, pos.col);
    if (typeof pos.row === 'number' && typeof pos.column === 'number') return createPosition(pos.row, pos.column);
  }
  throw new Error(`Invalid position format: ${JSON.stringify(pos)}`);
}

export function normalizeRange(range: any): Range {
  if (typeof range === 'object' && range) {
    if (range.start && range.end) return { start: normalizePosition(range.start), end: normalizePosition(range.end) };
    if (
      typeof range.startLine === 'number' &&
      typeof range.startChar === 'number' &&
      typeof range.endLine === 'number' &&
      typeof range.endChar === 'number'
    )
      return createRange(range.startLine, range.startChar, range.endLine, range.endChar);
  }
  throw new Error(`Invalid range format: ${JSON.stringify(range)}`);
}

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
  } as any;
}

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
  } as any;
}

export function buildPrepareRenameRequest(params: { uri: string; position: Position; identifier: string }) {
  return { uri: normalizeUri(params.uri), position: params.position, identifier: params.identifier } as any;
}

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
    oldName: params.identifier,
    newName: params.newName,
    dryRun: params.dryRun ?? false,
  } as any;
}

export function buildCompletionRequest(params: {
  uri: string;
  position: Position;
  triggerCharacter?: string;
  maxResults?: number;
}): CompletionRequest {
  return {
    uri: normalizeUri(params.uri),
    position: params.position,
    maxResults: params.maxResults ?? 20,
    context: params.triggerCharacter ? { triggerKind: 2, triggerCharacter: params.triggerCharacter } : { triggerKind: 1 },
  } as any;
}

export function definitionToApiResponse(def: Definition) {
  const range = normalizeRange(def.range as any);
  return { uri: normalizeUri(def.uri), range, kind: (def as any).kind, name: (def as any).name };
}

export function referenceToApiResponse(ref: Reference) {
  const range = normalizeRange(ref.range as any);
  return { uri: normalizeUri(ref.uri), range, kind: (ref as any).kind, name: (ref as any).name };
}

// Legacy MCP helpers kept for adapter compatibility
// Map core types to MCP-friendly response objects (same shape as API helpers)
// NOTE: MCP adapters use the same normalized shape as HTTP.

export function validateRequired(params: Record<string, any>, required: string[]): void {
  for (const field of required) if (params[field] === undefined || params[field] === null) throw new Error(`Missing required parameter: ${field}`);
}

export function safeJsonParse(jsonString: string, fallback: any = null): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

export function strictJsonParse(jsonString: string): any {
  return JSON.parse(jsonString);
}

export function handleAdapterError(error: unknown, _adapter: 'http' | 'mcp' | 'cli' | 'lsp'): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDefaultCoreConfig(): CoreConfig {
  const cfg = AnalyzerFactory.createDefaultConfig();
  (cfg as any).monitoring = { ...(cfg as any).monitoring, enabled: false };
  return cfg as CoreConfig;
}
