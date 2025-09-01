import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTPServer } from '../src/servers/http';

describe('HTTP /metrics endpoint', () => {
  let server: HTTPServer;
  const host = '127.0.0.1';
  const port = 7010; // test port per CONFIG.md
  const base = `http://${host}:${port}`;

  beforeAll(async () => {
    server = new HTTPServer({ host, port, workspaceRoot: process.cwd(), enableOpenAPI: false });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('returns consolidated JSON metrics (L1/L2/L4)', async () => {
    const res = await fetch(`${base}/metrics?format=json`);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    // Presence
    expect(body).toBeDefined();
    // L4 should generally be present
    expect(body.l4).toBeDefined();
    // If L1/L2 real layers are present, validate some fields
    if (body.l1 && body.l1.layer) {
      expect(typeof body.l1.layer.searches).toBe('number');
      expect(body.l1.layer.searches).toBeGreaterThanOrEqual(0);
    }
    if (body.l2 && typeof body.l2.count === 'number') {
      expect(body.l2.count).toBeGreaterThanOrEqual(0);
    }
  });

  test('returns Prometheus text', async () => {
    const res = await fetch(`${base}/metrics?format=prometheus`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('ontology_l4_');
  });
});
