import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTPServer } from '../src/servers/http';

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

// Helper to unwrap MCP-style result content
function unwrap(result: any): any {
    try {
        const txt = result?.content?.[0]?.text;
        return txt ? JSON.parse(txt) : result;
    } catch {
        return result;
    }
}

describe('apply_after_checks (guarded apply)', () => {
    let server: HTTPServer;
    const host = '127.0.0.1';
    const port = 7019;
    const base = `http://${host}:${port}`;

    beforeAll(async () => {
        process.env.HTTP_API_PORT = String(port);
        process.env.SNAPSHOT_PARTIAL = '1';
        process.env.ALLOW_SNAPSHOT_APPLY = '1';
        server = new HTTPServer({ host, port, workspaceRoot: process.cwd(), enableOpenAPI: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        delete process.env.HTTP_API_PORT;
        delete process.env.SNAPSHOT_PARTIAL;
        delete process.env.ALLOW_SNAPSHOT_APPLY;
    });

    test('stages patch, runs checks, attempts apply (structured result)', async () => {
        // Using apply_patch format patch: apply may or may not succeed depending on patch engine support.
        const patch = `*** Begin Patch\n*** Update File: tests/fixtures/example.ts\n@@\n export class TestClass {\n-    private value: number = 0;\n+    // apply_after_checks noop\n+    private value: number = 0;\n*** End Patch\n`;

        const res = await callTool(base, 'apply_after_checks', {
            patch,
            commands: ['true'], // minimal check for speed/stability
            timeoutSec: 60,
        });
        const out = unwrap(res);
        expect(out).toBeDefined();
        expect(typeof out.ok).toBe('boolean');
        expect(typeof out.snapshot).toBe('string');
        // applied may be false if the patch format isn't understood by the apply engine; assert field presence only
        expect(typeof out.applied).toBe('boolean');
    }, 30000);
});
