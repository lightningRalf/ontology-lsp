import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTPServer } from '../src/servers/http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function callTool(base: string, name: string, args: Record<string, any>) {
  const res = await fetch(`${base}/api/v1/tools/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.result;
}

function unwrap(result: any): any {
  try {
    const txt = result?.content?.[0]?.text;
    return txt ? JSON.parse(txt) : result;
  } catch {
    return result;
  }
}

describe('apply_after_checks with unified diff (applied=true)', () => {
  let server: HTTPServer;
  const host = '127.0.0.1';
  const port = 7020;
  const base = `http://${host}:${port}`;

  beforeAll(async () => {
    process.env.HTTP_API_PORT = String(port);
    process.env.ALLOW_SNAPSHOT_APPLY = '1';
    server = new HTTPServer({ host, port, workspaceRoot: process.cwd(), enableOpenAPI: false });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    delete process.env.HTTP_API_PORT;
    delete process.env.ALLOW_SNAPSHOT_APPLY;
  });

  test('applies unified diff and then reverts it', async () => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/example.ts');
    const marker = '// unified apply_after_checks test';
    const before = await fs.readFile(filePath, 'utf8');
    // Proper unified diff against working tree
    const patch = `diff --git a/tests/fixtures/example.ts b/tests/fixtures/example.ts\n--- a/tests/fixtures/example.ts\n+++ b/tests/fixtures/example.ts\n@@ -5,2 +5,3 @@\n export class TestClass {\n+    // unified apply_after_checks test\n     private value: number = 0;\n`;

    // Stage -> checks -> apply
    const res = await callTool(base, 'apply_after_checks', {
      patch,
      commands: ['true'],
      timeoutSec: 60,
    });
    const out = unwrap(res);
    expect(out).toBeDefined();
    expect(out.ok).toBe(true);
    expect(out.applied).toBe(true);
    const snapId = String(out.snapshot || '');
    expect(snapId.length).toBeGreaterThan(0);

    // Verify file was changed on disk
    const afterApply = await fs.readFile(filePath, 'utf8');
    expect(afterApply).toContain(marker);
    expect(afterApply).not.toEqual(before);

    // Revert via apply_snapshot reverse=true using the same snapshot
    const rev = unwrap(await callTool(base, 'apply_snapshot', { snapshot: snapId, check: false, reverse: true }));
    // On success, isError=false and payload contains ok flag
    expect(rev).toBeDefined();
    // Accept either { ok: true } or a plain string success; normalize
    if (typeof rev === 'object' && rev !== null && 'ok' in rev) {
      expect(rev.ok).toBe(true);
    }

    // Verify file returned to original state
    const afterRevert = await fs.readFile(filePath, 'utf8');
    expect(afterRevert).toEqual(before);
  }, 30000);
});
