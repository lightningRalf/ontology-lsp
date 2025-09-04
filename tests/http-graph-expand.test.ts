import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTPServer } from '../src/servers/http';

describe('HTTP /api/v1/graph-expand fallback', () => {
  let server: HTTPServer;
  const host = '127.0.0.1';
  const port = 7012; // dedicated test port
  const base = `http://${host}:${port}`;

  beforeAll(async () => {
    process.env.HTTP_API_PORT = String(port);
    server = new HTTPServer({ host, port, workspaceRoot: process.cwd(), enableOpenAPI: false });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    delete process.env.HTTP_API_PORT;
  });

  test('returns 200 and structure for file even if parser unavailable', async () => {
    const res = await fetch(`${base}/api/v1/graph-expand`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'src/servers/http.ts', edges: ['imports','exports'], depth: 1, limit: 50 })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.neighbors).toBeDefined();
    expect(body.data.neighbors.imports).toBeDefined();
    expect(body.data.neighbors.exports).toBeDefined();
  });

  test('returns 200 and structure for symbol fallback', async () => {
    const res = await fetch(`${base}/api/v1/graph-expand`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'HTTPServer', edges: ['imports','exports'], depth: 1, limit: 20 })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.neighbors).toBeDefined();
  });
});
