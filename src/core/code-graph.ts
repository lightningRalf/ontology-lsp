import Parser, { Query } from 'tree-sitter';
import { AsyncEnhancedGrep } from '../layers/enhanced-search-tools-async.js';
import * as fs from 'fs/promises';
import * as path from 'path';

function findModulePath(moduleName: string): string {
  const candidates = [
    moduleName,
    path.join(process.cwd(), 'node_modules', moduleName),
    path.join(process.cwd(), '..', 'node_modules', moduleName),
    path.join(process.cwd(), '..', '..', 'node_modules', moduleName),
  ];
  for (const p of candidates) {
    try { require.resolve(p); return p; } catch {}
  }
  throw new Error(`Cannot find module ${moduleName}`);
}

async function loadLanguageForFile(file: string) {
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    const mod = require(findModulePath('tree-sitter-typescript'));
    return { id: 'typescript', lang: mod.typescript } as const;
  }
  if (file.endsWith('.js') || file.endsWith('.jsx')) {
    const mod = require(findModulePath('tree-sitter-javascript'));
    return { id: 'javascript', lang: mod } as const;
  }
  if (file.endsWith('.py')) {
    const mod = require(findModulePath('tree-sitter-python'));
    return { id: 'python', lang: mod } as const;
  }
  throw new Error(`Unsupported file type: ${file}`);
}

const TS_IMPORTS = `
 (import_statement
   source: (string) @import.source
   (import_clause
     (named_imports (import_specifier name: (identifier) @import.name alias: (identifier)? @import.alias)*)?
     (namespace_import (identifier) @import.namespace)?
     (identifier)? @import.default)?)
`;
const TS_EXPORTS = `
 (export_statement
   (function_declaration name: (identifier) @export.func)?
   (class_declaration name: (type_identifier) @export.class)?
   (variable_declaration (variable_declarator name: (identifier) @export.var))?
   declaration: (_)? @export.decl)
`;

const PY_IMPORTS = `
  (import_statement name: (dotted_name) @import.module)
  (import_from_statement module_name: (dotted_name) @import.from name: (dotted_name) @import.name)
`;

export async function expandNeighbors(opts: { file?: string; symbol?: string; edges: string[]; depth?: number; limit?: number; seedFiles?: string[]; seedStrict?: boolean }) {
  const edges = opts.edges && opts.edges.length ? opts.edges : ['imports','exports'];
  if (opts.file) {
    const res: any = { file: path.resolve(opts.file), neighbors: {} as Record<string, any[]> };
    const text = await fs.readFile(res.file, 'utf8');
    const { id, lang } = await loadLanguageForFile(res.file);
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(text);
    const by = (edge: string, qstr: string) => {
      const q = new Query(lang, qstr);
      const caps = q.captures(tree.rootNode);
      const items: any[] = [];
      for (const c of caps) {
        const n = c.node;
        items.push({ capture: c.name, text: n.text, start: { line: n.startPosition.row, column: n.startPosition.column }, end: { line: n.endPosition.row, column: n.endPosition.column } });
      }
      res.neighbors[edge] = items;
    };
    if (edges.includes('imports')) by('imports', id === 'python' ? PY_IMPORTS : TS_IMPORTS);
    if (edges.includes('exports') && id !== 'python') by('exports', TS_EXPORTS);
    if (edges.includes('callees')) {
      // Extract callees within file (best-effort)
      const CALLS = new Query(lang, `
        (call_expression
          function: (identifier) @call.func
          arguments: (arguments) @call.args)

        (call_expression
          function: (member_expression
            object: (identifier) @call.object
            property: (property_identifier) @call.method)
          arguments: (arguments) @call.args)
      `);
      const caps = CALLS.captures(tree.rootNode);
      const items: any[] = [];
      for (const c of caps) {
        const n = c.node;
        if (c.name === 'call.func' || c.name === 'call.method') {
          items.push({ name: n.text, start: { line: n.startPosition.row, column: n.startPosition.column } });
        }
      }
      res.neighbors.callees = items;
    }
    if (edges.includes('callers')) {
      res.neighbors.callers = [];
      res.note = 'callers discovery requires symbol; provide --symbol for cross-file callers';
    }
    return res;
  }
  if (opts.symbol) {
    const symbol = opts.symbol;
    const neighbors: any = { callers: [], callees: [], imports: [], exports: [] };
    // Best-effort callers: grep for word-boundary matches and confirm via AST
    const grep = new AsyncEnhancedGrep({ cacheSize: 500, cacheTTL: 30000 });
    const pattern = `\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    const max = Math.min(opts.limit || 200, 1000);
    const searchPaths: string[] = (opts.seedFiles && opts.seedFiles.length)
      ? Array.from(new Set(opts.seedFiles.map((f) => path.dirname(path.resolve(f)))))
      : [process.cwd()];
    let accMatches: any[] = [];
    for (const p of searchPaths) {
      const perPathMax = opts.seedStrict ? max : Math.max(1, Math.floor(max / searchPaths.length));
      const part = await grep.search({ pattern, path: p, maxResults: perPathMax, timeout: 2000, caseInsensitive: false });
      accMatches = accMatches.concat(part);
      if (accMatches.length >= max) break;
    }
    const matches = accMatches;
    const files = Array.from(new Set(matches.map((m) => m.file))).slice(0, 200);
    for (const file of files) {
      try {
        const text = await fs.readFile(file, 'utf8');
        const { lang } = await loadLanguageForFile(file);
        const parser = new Parser(); parser.setLanguage(lang);
        const tree = parser.parse(text);
        const Q = new Query(lang, `
          (call_expression function: (identifier) @f (#eq? @f "${symbol}"))
          (call_expression function: (member_expression property: (property_identifier) @m (#eq? @m "${symbol}")))
        `);
        const caps = Q.captures(tree.rootNode);
        for (const cap of caps) {
          const n = cap.node;
          neighbors.callers.push({ file, start: { line: n.startPosition.row, column: n.startPosition.column } });
        }
        if (neighbors.callers.length >= (opts.limit || 200)) break;
      } catch {}
    }
    return { symbol, neighbors };
  }
  throw new Error('file or symbol required');
}
