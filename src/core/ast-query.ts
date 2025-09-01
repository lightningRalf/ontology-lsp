import Parser, { Query } from 'tree-sitter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

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

async function loadLanguage(language: 'typescript'|'javascript'|'python') {
  if (language === 'typescript') {
    const mod = require(findModulePath('tree-sitter-typescript'));
    return mod.typescript;
  }
  if (language === 'javascript') {
    const mod = require(findModulePath('tree-sitter-javascript'));
    return mod;
  }
  if (language === 'python') {
    const mod = require(findModulePath('tree-sitter-python'));
    return mod;
  }
  throw new Error(`Unsupported language: ${language}`);
}

export type AstQueryInput = {
  language: 'typescript'|'javascript'|'python';
  query: string;
  paths?: string[];
  glob?: string;
  limit?: number;
};

export async function runAstQuery(inp: AstQueryInput) {
  const lang = await loadLanguage(inp.language);
  const parser = new Parser();
  parser.setLanguage(lang);
  const q = new Query(lang, inp.query);

  const fileSet = new Set<string>();
  if (inp.paths && inp.paths.length) {
    inp.paths.forEach((p) => fileSet.add(path.resolve(p)));
  }
  if (inp.glob) {
    const matches = glob.sync(inp.glob, { ignore: ['**/node_modules/**','**/dist/**','**/.git/**','**/coverage/**'], nodir: true } as any);
    matches.slice(0, 2000).forEach((m) => fileSet.add(path.resolve(m)));
  }
  const files = Array.from(fileSet).slice(0, Math.min(inp.limit || 100, 1000));

  const results: any[] = [];
  for (const file of files) {
    try {
      const text = await fs.readFile(file, 'utf8');
      const tree = parser.parse(text);
      const caps = q.captures(tree.rootNode);
      for (const c of caps) {
        const n = c.node;
        results.push({
          file,
          capture: c.name,
          start: { line: n.startPosition.row, column: n.startPosition.column },
          end: { line: n.endPosition.row, column: n.endPosition.column },
          snippet: text.split(/\r?\n/).slice(Math.max(0, n.startPosition.row-1), n.endPosition.row+2).join('\n'),
        });
      }
    } catch {}
    if (results.length >= (inp.limit || 2000)) break;
  }
  return { count: results.length, results };
}
