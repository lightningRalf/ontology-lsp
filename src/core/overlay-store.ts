import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

type Snapshot = {
    id: string;
    createdAt: number;
    diffs: string[];
};

export class OverlayStore {
    private snapshots = new Map<string, Snapshot>();

    createSnapshot(preferExisting = true): Snapshot {
        // Optionally reuse the most recent snapshot to avoid churn
        if (preferExisting) {
            const last = Array.from(this.snapshots.values()).sort((a, b) => b.createdAt - a.createdAt)[0];
            if (last) return last;
        }
        const id = randomUUID();
        const snap: Snapshot = { id, createdAt: Date.now(), diffs: [] };
        this.snapshots.set(id, snap);
        // Best-effort cleanup after creating a snapshot
        void this.cleanup().catch(() => {});
        return snap;
    }

    ensureSnapshot(id?: string): Snapshot {
        if (id && this.snapshots.has(id)) return this.snapshots.get(id)!;
        return this.createSnapshot(true);
    }

    list(): Snapshot[] {
        return Array.from(this.snapshots.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    async cleanup(maxKeep = 10, maxAgeMs = 3 * 24 * 60 * 60 * 1000): Promise<void> {
        const snaps = this.list();
        const now = Date.now();
        const toDelete: Snapshot[] = [];
        // Age-based
        for (const s of snaps) {
            if (now - s.createdAt > maxAgeMs) toDelete.push(s);
        }
        // Count-based
        if (snaps.length - toDelete.length > maxKeep) {
            const excess = snaps.slice(maxKeep);
            for (const s of excess) if (!toDelete.includes(s)) toDelete.push(s);
        }
        const snapsRoot = path.resolve('.ontology', 'snapshots');
        for (const s of toDelete) {
            this.snapshots.delete(s.id);
            try {
                await fsp.rm(path.join(snapsRoot, s.id), { recursive: true, force: true });
            } catch {}
        }
    }

    stagePatch(snapshotId: string, diff: string, maxSizeBytes = 512 * 1024): { accepted: boolean; message?: string } {
        if (!diff || typeof diff !== 'string') return { accepted: false, message: 'Empty diff' };
        if (Buffer.byteLength(diff, 'utf8') > maxSizeBytes) {
            return { accepted: false, message: `Patch too large (> ${maxSizeBytes} bytes)` };
        }
        const snap = this.ensureSnapshot(snapshotId);
        snap.diffs.push(diff);
        return { accepted: true };
    }

    private which(cmd: string): string | null {
        const res = spawnSync('bash', ['-lc', `command -v ${cmd}`], { stdio: 'pipe' });
        return res.status === 0 ? String(res.stdout).trim() : null;
    }

    private async ensureMaterialized(snapshotId: string): Promise<string | null> {
        const base = path.resolve('.');
        const snapsRoot = path.resolve('.ontology', 'snapshots');
        const dir = path.join(snapsRoot, snapshotId);
        await fsp.mkdir(snapsRoot, { recursive: true }).catch(() => {});
        const exists = fs.existsSync(dir);
        if (!exists) {
            await fsp.mkdir(dir, { recursive: true });
            // Prefer rsync for speed; fallback to tar pipe with excludes to avoid self-copy recursion
            if (this.which('rsync')) {
                spawnSync(
                    'bash',
                    [
                        '-lc',
                        `rsync -a --delete --exclude .git --exclude node_modules --exclude .ontology --exclude dist ./ ${dir}/`,
                    ],
                    { stdio: 'pipe' }
                );
            } else if (this.which('tar')) {
                const cmd = `tar -C . --exclude .git --exclude node_modules --exclude .ontology --exclude dist -cf - . | tar -C ${JSON.stringify(dir)} -xf -`;
                spawnSync('bash', ['-lc', cmd], { stdio: 'pipe' });
            } else {
                // Fallback: copy entries individually, skipping excluded dirs
                const entries = await fsp.readdir(base, { withFileTypes: true });
                for (const ent of entries) {
                    if (['.git', '.ontology', 'node_modules', 'dist'].includes(ent.name)) continue;
                    const src = path.join(base, ent.name);
                    const dest = path.join(dir, ent.name);
                    try {
                        spawnSync('bash', ['-lc', `cp -a ${JSON.stringify(src)} ${JSON.stringify(dest)}`], {
                            stdio: 'pipe',
                        });
                    } catch {}
                }
            }
        }
        // Apply staged diffs if any
        const snap = this.snapshots.get(snapshotId);
        if (!snap) return dir;
        if (snap.diffs.length > 0) {
            const diffFile = path.join(dir, 'overlay.diff');
            await fsp.writeFile(diffFile, snap.diffs.join('\n'), 'utf8');
            if (this.which('git')) {
                const applied = spawnSync(
                    'bash',
                    ['-lc', `git -C ${JSON.stringify(dir)} apply --whitespace=nowarn overlay.diff`],
                    { stdio: 'pipe' }
                );
                if (applied.status !== 0 && this.which('patch')) {
                    spawnSync('bash', ['-lc', `patch -p0 < overlay.diff`], { cwd: dir, stdio: 'pipe' });
                }
            } else if (this.which('patch')) {
                spawnSync('bash', ['-lc', `patch -p0 < overlay.diff`], { cwd: dir, stdio: 'pipe' });
            }
        }
        return dir;
    }

    async runChecks(
        snapshotId: string,
        commands: string[],
        timeoutSec = 120
    ): Promise<{ ok: boolean; output: string; elapsedMs: number }> {
        const start = Date.now();
        // Materialize snapshot into .ontology/snapshots/<id>
        const cwd = (await this.ensureMaterialized(snapshotId)) || process.cwd();
        const output: string[] = [];
        for (const cmd of commands && commands.length ? commands : ['bun run typecheck', 'bun run build']) {
            const [bin, ...args] = cmd.split(' ');
            const ok = await new Promise<boolean>((resolve) => {
                const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
                child.stdout.on('data', (d) => output.push(String(d)));
                child.stderr.on('data', (d) => output.push(String(d)));
                const timer = setTimeout(() => {
                    try {
                        child.kill('SIGKILL');
                    } catch {}
                    resolve(false);
                }, Math.max(1, timeoutSec) * 1000);
                child.on('close', (code) => {
                    clearTimeout(timer);
                    resolve(code === 0);
                });
            });
            if (!ok) {
                return { ok: false, output: output.join(''), elapsedMs: Date.now() - start };
            }
        }
        return { ok: true, output: output.join(''), elapsedMs: Date.now() - start };
    }
}

export const overlayStore = new OverlayStore();
