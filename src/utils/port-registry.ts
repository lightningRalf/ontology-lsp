import os from 'node:os';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import net from 'node:net';

type PortRecord = {
  port: number;
  component: string;
  cwd: string;
  pid: number;
  ts: number;
};

type Registry = Record<string, PortRecord>; // key = String(port)

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true }).catch(() => {});
}

function registryPath(): string {
  const dir = path.join(os.homedir(), '.ontology');
  return path.join(dir, 'ports.json');
}

async function readRegistry(): Promise<Registry> {
  const p = registryPath();
  try {
    const data = await fsp.readFile(p, 'utf8');
    const obj = JSON.parse(data);
    if (obj && typeof obj === 'object') return obj as Registry;
  } catch {}
  return {};
}

async function writeRegistry(reg: Registry): Promise<void> {
  const p = registryPath();
  await ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(reg, null, 2), 'utf8');
  await fsp.rename(tmp, p);
}

async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => {
      srv.close(() => resolve(true));
    });
  });
}

export class PortRegistry {
  static async reserve(component: string, preferred: number, host = '127.0.0.1', maxAttempts = 50): Promise<number> {
    // Try preferred then subsequent ports up to attempts
    let reg = await readRegistry();
    for (let i = 0; i < maxAttempts; i++) {
      const candidate = preferred + i;
      const key = String(candidate);
      const rec = reg[key];
      // Check if process recorded is gone
      if (rec && rec.pid && rec.pid !== process.pid) {
        try {
          process.kill(rec.pid, 0);
          // process exists -> skip
          continue;
        } catch {
          // stale record, allow reuse
        }
      }
      // Check actual availability
      const free = await isPortFree(candidate, host);
      if (!free) continue;
      // Reserve in registry
      reg[key] = { port: candidate, component, cwd: process.cwd(), pid: process.pid, ts: Date.now() };
      await writeRegistry(reg);
      return candidate;
    }
    throw new Error(`No free port found near ${preferred}`);
  }

  static async release(port: number): Promise<void> {
    const key = String(port);
    const reg = await readRegistry();
    if (reg[key] && reg[key].pid === process.pid) {
      delete reg[key];
      await writeRegistry(reg);
    }
  }

  static async list(host = '127.0.0.1'): Promise<Array<PortRecord & { alive: boolean; listening: boolean }>> {
    const reg = await readRegistry();
    const out: Array<PortRecord & { alive: boolean; listening: boolean }> = [];
    for (const key of Object.keys(reg)) {
      const rec = reg[key];
      let alive = false;
      if (rec.pid) {
        try { process.kill(rec.pid, 0); alive = true; } catch { alive = false; }
      }
      const free = await isPortFree(rec.port, host);
      const listening = !free;
      out.push({ ...rec, alive, listening });
    }
    // Sort by port asc
    out.sort((a, b) => a.port - b.port);
    return out;
  }
}
