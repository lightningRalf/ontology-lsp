#!/usr/bin/env bun
/**
 * MCP-first dogfooding workflows executed via MCPAdapter directly (no HTTP).
 * Runs (small, fast steps by default):
 *  - explore_codebase (conceptual off)
 *  - explore_codebase (conceptual on)
 *  - plan_rename (preview)
 * Optional (enable with --checks):
 *  - workflow_safe_rename (runChecks=false)
 *  - get_snapshot + propose_patch (skip run_checks by default)
 */

import { MCPAdapter } from '../src/adapters/mcp-adapter.js';
import { createDefaultCoreConfig } from '../src/adapters/utils.js';
import { createCodeAnalyzer } from '../src/core/index';

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

async function parseContent(res: ToolResult): Promise<any> {
  if (!res || !Array.isArray(res.content) || !res.content[0]?.text) return null;
  const txt = res.content[0].text!;
  try { return JSON.parse(txt); } catch { return txt; }
}

function logStep(msg: string) {
  console.log(`[dogfood] ${msg}`);
}

async function run() {
  const cfg = createDefaultCoreConfig();
  // Constrain scope to fast fixture and disable heavy layers for speed
  (cfg.layers as any).layer4.enabled = false;
  (cfg.layers as any).layer5.enabled = false;
  (cfg.layers as any).layer1.grep.defaultTimeout = 1000;
  (cfg.layers as any).layer1.glob.defaultTimeout = 1000;
  (cfg.layers as any).layer2.parseTimeout = 30;
  const workspaceRoot = `${process.cwd()}/tests/fixtures`;
  const analyzer = await createCodeAnalyzer({ ...cfg, workspaceRoot });
  await analyzer.initialize();
  const mcp = new MCPAdapter(analyzer);

  const ctxFile = 'tests/fixtures/example.ts';

  const timings: Record<string, number> = {};
  const t0 = (label: string) => (timings[label] = Date.now());
  const t1 = (label: string) => (timings[label] = Date.now() - timings[label]);

  // 1) explore_codebase (conceptual: false)
  logStep('explore_codebase (conceptual=false) ...');
  t0('explore_off');
  const exploreOff = await mcp.handleToolCall('explore_codebase', {
    symbol: 'TestClass',
    file: ctxFile,
    conceptual: false,
  });
  t1('explore_off');
  const exploreOffParsed = await parseContent(exploreOff as any);
  logStep(`explore_codebase off done: defs=${exploreOffParsed?.definitions?.length ?? 0}, refs=${exploreOffParsed?.references?.length ?? 0}`);

  // 2) explore_codebase (conceptual: true)
  process.env.L4_AUGMENT_EXPLORE = '1';
  logStep('explore_codebase (conceptual=true) ...');
  t0('explore_on');
  const exploreOn = await mcp.handleToolCall('explore_codebase', {
    symbol: 'TestClass',
    file: ctxFile,
    conceptual: true,
  });
  t1('explore_on');
  const exploreOnParsed = await parseContent(exploreOn as any);
  logStep(`explore_codebase on done: defs=${exploreOnParsed?.definitions?.length ?? 0}, refs=${exploreOnParsed?.references?.length ?? 0}`);

  // 3) plan_rename (preview)
  logStep('plan_rename preview ...');
  t0('plan_rename');
  const plan = await mcp.handleToolCall('plan_rename', {
    oldName: 'TestFunction',
    newName: 'TestFunctionX',
    file: ctxFile,
    dryRun: true,
  });
  t1('plan_rename');
  const planParsed = await parseContent(plan as any);
  const planFiles = Object.keys(planParsed?.changes || {}).length;
  const planEdits = Object.values(planParsed?.changes || {}).reduce((a: number, v: any) => a + (Array.isArray(v) ? v.length : 0), 0);
  logStep(`plan_rename preview done: files=${planFiles}, edits=${planEdits}`);

  const DO_CHECKS = process.argv.includes('--checks');
  let safeRenameParsed: any = null;
  if (DO_CHECKS) {
    // 4) workflow_safe_rename (runChecks=false to avoid heavy snapshot materialization)
    logStep('workflow_safe_rename (runChecks=false) ...');
    t0('workflow_safe_rename');
    const safeRename = await mcp.handleToolCall('workflow_safe_rename', {
      oldName: 'TestFunction',
      newName: 'TestFunctionX',
      file: ctxFile,
      runChecks: false,
      timeoutSec: 30,
    });
    t1('workflow_safe_rename');
    safeRenameParsed = await parseContent(safeRename as any);
    logStep(`workflow_safe_rename done: ok=${!!safeRenameParsed?.ok}, snapshot=${safeRenameParsed?.snapshot}`);
  }

  // 5) get_snapshot + propose_patch (skip run_checks to keep fast)
  const patch = `*** Begin Patch\n*** Update File: tests/fixtures/example.ts\n@@\n export function TestFunction(param: string): string {\n-    return \`Hello, \${param}!\`;\n+    // dogfood: harmless change\n+    return \`Hello, \${param}!\`;\n }\n*** End Patch\n`;
  logStep('get_snapshot ...');
  const snap = await mcp.handleToolCall('get_snapshot', { preferExisting: true });
  const snapParsed = await parseContent(snap as any);
  const snapshotId = snapParsed?.id || snapParsed?.snapshot || snapParsed; // tolerate shapes
  logStep(`snapshot id: ${snapshotId}`);

  logStep('propose_patch (no run_checks) ...');
  t0('propose_patch');
  const stage = await mcp.handleToolCall('propose_patch', { snapshot: snapshotId, patch });
  t1('propose_patch');
  const stageParsed = await parseContent(stage as any);
  logStep(`propose_patch done: accepted=${!!stageParsed?.accepted}`);

  // Output concise summary as JSON (so Codex can capture it)
  const out = {
    timingsMs: timings,
    explore: {
      offConceptual: { symbol: exploreOffParsed?.symbol, defs: exploreOffParsed?.definitions?.length ?? 0, refs: exploreOffParsed?.references?.length ?? 0 },
      onConceptual: { symbol: exploreOnParsed?.symbol, defs: exploreOnParsed?.definitions?.length ?? 0, refs: exploreOnParsed?.references?.length ?? 0 },
    },
    planRename: { files: planFiles, totalEdits: planEdits },
    safeRename: safeRenameParsed ? { ok: !!safeRenameParsed?.ok, snapshot: safeRenameParsed?.snapshot, filesAffected: safeRenameParsed?.filesAffected, next: safeRenameParsed?.next_actions } : undefined,
    proposedPatch: { accepted: !!stageParsed?.accepted, snapshot: snapshotId },
  };
  console.log(JSON.stringify(out, null, 2));
}

run().catch((e) => {
  console.error('dogfood workflows failed:', e);
  process.exit(1);
});
