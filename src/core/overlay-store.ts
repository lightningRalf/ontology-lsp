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
    private wantProgress(): boolean {
        const env = process.env;
        return env.DOGFOOD_PROGRESS === '1' || env.PROGRESS_LOGS === '1';
    }
    private async logProgress(id: string, msg: string): Promise<void> {
        if (!this.wantProgress()) return;
        try {
            this.assertValidId(id);
            const snapsRoot = path.resolve('.ontology', 'snapshots');
            const dir = path.join(snapsRoot, id);
            await fsp.mkdir(dir, { recursive: true }).catch(() => {});
            const line = `[${new Date().toISOString()}] ${msg}\n`;
            await fsp.appendFile(path.join(dir, 'progress.log'), line, 'utf8');
        } catch {
            // ignore progress errors
        }
    }

    private isValidSnapshotId(id: string): boolean {
        return typeof id === 'string' && /^[0-9a-fA-F-]{8,}$/.test(id.trim());
    }

    private assertValidId(id: string): void {
        if (!id || !this.isValidSnapshotId(id)) {
            throw new Error('Invalid snapshot id');
        }
    }

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
        if (id === undefined) {
            return this.createSnapshot(true);
        }
        const trimmed = String(id).trim();
        this.assertValidId(trimmed);
        const found = this.snapshots.get(trimmed);
        if (!found) {
            throw new Error('Unknown snapshot id');
        }
        return found;
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
        this.assertValidId(snapshotId);
        // Respect workspace root if provided to avoid copying entire repo for snapshots
        const envBase = process.env.WORKSPACE_ROOT || process.env.ONTOLOGY_WORKSPACE || '';
        const base = envBase ? path.resolve(envBase) : path.resolve('.');
        const snapsRoot = path.resolve('.ontology', 'snapshots');
        const dir = path.join(snapsRoot, snapshotId);
        await fsp.mkdir(snapsRoot, { recursive: true }).catch(() => {});
        const exists = fs.existsSync(dir);
        if (!exists) {
            await this.logProgress(snapshotId, 'materialize:start');
            await fsp.mkdir(dir, { recursive: true });
            // Prefer rsync for speed; fallback to tar pipe with excludes to avoid self-copy recursion
            if (this.which('rsync')) {
                await this.logProgress(snapshotId, `materialize:rsync ${base} -> ${dir}`);
                spawnSync(
                    'bash',
                    [
                        '-lc',
                        // Copy only the workspace root if provided; otherwise copy current directory
                        `rsync -a --delete --exclude .git --exclude node_modules --exclude .ontology --exclude dist ${JSON.stringify(base)}/ ${dir}/`,
                    ],
                    { stdio: 'pipe' }
                );
            } else if (this.which('tar')) {
                await this.logProgress(snapshotId, `materialize:tar ${base} -> ${dir}`);
                const cmd = `tar -C ${JSON.stringify(base)} --exclude .git --exclude node_modules --exclude .ontology --exclude dist -cf - . | tar -C ${JSON.stringify(dir)} -xf -`;
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
            await this.logProgress(snapshotId, 'materialize:done');
        }
        // Apply staged diffs if any
        const snap = this.snapshots.get(snapshotId);
        if (!snap) return dir;
        if (snap.diffs.length > 0) {
            await this.logProgress(snapshotId, `apply:diffs ${snap.diffs.length}`);
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
            await this.logProgress(snapshotId, 'apply:done');
        }
        return dir;
    }

    async runChecks(
        snapshotId: string,
        commands: string[],
        timeoutSec = 120
    ): Promise<{ ok: boolean; output: string; elapsedMs: number }> {
        this.assertValidId(snapshotId);
        const start = Date.now();
        // Materialize snapshot into .ontology/snapshots/<id>
        const cwd = (await this.ensureMaterialized(snapshotId)) || process.cwd();
        const output: string[] = [];
        for (const cmd of commands && commands.length ? commands : ['bun run typecheck', 'bun run build']) {
            await this.logProgress(snapshotId, `run:${cmd}:start`);
            const [bin, ...args] = cmd.split(' ');
            const ok = await new Promise<boolean>((resolve) => {
                const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
                child.stdout.on('data', (d) => output.push(String(d)));
                child.stderr.on('data', (d) => output.push(String(d)));
                const timer = setTimeout(() => {
                    try {
                        child.kill('SIGKILL');
                    } catch {}
                    void this.logProgress(snapshotId, `run:${cmd}:timeout`);
                    resolve(false);
                }, Math.max(1, timeoutSec) * 1000);
                child.on('close', (code) => {
                    clearTimeout(timer);
                    void this.logProgress(snapshotId, `run:${cmd}:done code=${code}`);
                    resolve(code === 0);
                });
            });
            if (!ok) {
                return { ok: false, output: output.join(''), elapsedMs: Date.now() - start };
            }
        }
        await this.logProgress(snapshotId, 'checks:done');
        return { ok: true, output: output.join(''), elapsedMs: Date.now() - start };
    }

    async applyToWorkingTree(snapshotId: string, { check = false }: { check?: boolean } = {}): Promise<{
        ok: boolean;
        output: string;
        elapsedMs: number;
    }> {
        this.assertValidId(snapshotId);
        const start = Date.now();
        const dir = (await this.ensureMaterialized(snapshotId)) || process.cwd();
        const diffFile = path.join(dir, 'overlay.diff');
        let output = '';
        const argsGit = ['-lc', `git apply ${check ? '--check ' : ''}--whitespace=nowarn ${JSON.stringify(diffFile)}`];
        const git = spawnSync('bash', argsGit, { stdio: 'pipe', cwd: process.cwd() });
        output += String(git.stdout || '') + String(git.stderr || '');
        if (git.status === 0) {
            return { ok: true, output, elapsedMs: Date.now() - start };
        }
        if (this.which('patch')) {
            const patchArgs = ['-lc', `${check ? 'patch --dry-run -p0 < ' : 'patch -p0 < '}${JSON.stringify(diffFile)}`];
            const p = spawnSync('bash', patchArgs, { stdio: 'pipe', cwd: process.cwd() });
            output += String(p.stdout || '') + String(p.stderr || '');
            return { ok: p.status === 0, output, elapsedMs: Date.now() - start };
        }
        return { ok: false, output, elapsedMs: Date.now() - start };
    }
}

export const overlayStore = new OverlayStore();
