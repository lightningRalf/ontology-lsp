#!/usr/bin/env bun
import { spawn } from 'node:child_process';

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test('MCP HTTP initialize returns 200 and sets session id', async () => {
  const port = 7091;
  const env = { ...process.env, MCP_HTTP_PORT: String(port), HTTP_API_PORT: String(port + 9) };
  const server = spawn(process.env.BUN_PATH || `${process.env.HOME}/.bun/bin/bun`, ['run', 'src/servers/mcp-http.ts'], { env });
  try {
    await wait(500);
    const resp = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } }),
    });
    // Should not be 500
    expect(resp.status).toBeLessThan(500);
    // Session header should be present after initialize
    const sid = resp.headers.get('Mcp-Session-Id');
    expect(sid).not.toBeNull();
  } finally {
    server.kill('SIGTERM');
  }
});

