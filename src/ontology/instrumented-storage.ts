import type { StoragePort } from './storage-port';
import type { Concept } from '../types/core';

type OpName =
  | 'initialize'
  | 'close'
  | 'saveConcept'
  | 'updateConcept'
  | 'deleteConcept'
  | 'loadConcept'
  | 'loadAllConcepts'
  | 'findConceptsByName'
  | 'getConceptStatistics'
  | 'vacuum'
  | 'analyze'
  | 'backup';

interface OpStats {
  count: number;
  errors: number;
  lastMs: number;
  min: number;
  max: number;
  totalMs: number;
  durations: number[]; // ring buffer (bounded)
}

export interface L4StorageMetrics {
  startedAt: number;
  updatedAt: number;
  totals: { count: number; errors: number };
  operations: Record<OpName, (OpStats & { p50: number; p95: number; p99: number }) | undefined>;
  extras?: {
    skippedRepresentationsSave?: number;
    skippedRepresentationsLoad?: number;
  };
}

export class InstrumentedStoragePort implements StoragePort {
  private inner: StoragePort;
  private ops: Map<OpName, OpStats> = new Map();
  private startedAt = Date.now();
  private updatedAt = this.startedAt;
  private readonly maxSamples = 512;

  constructor(inner: StoragePort) {
    this.inner = inner;
  }

  private record(op: OpName, ms: number, error?: unknown): void {
    let s = this.ops.get(op);
    if (!s) {
      s = { count: 0, errors: 0, lastMs: 0, min: Number.POSITIVE_INFINITY, max: 0, totalMs: 0, durations: [] };
      this.ops.set(op, s);
    }
    s.count += 1;
    if (error) s.errors += 1;
    s.lastMs = ms;
    s.min = Math.min(s.min, ms);
    s.max = Math.max(s.max, ms);
    s.totalMs += ms;
    // push with ring buffer semantics
    if (s.durations.length < this.maxSamples) s.durations.push(ms);
    else {
      // replace a random index to approximate reservoir sampling
      const idx = Math.floor(Math.random() * this.maxSamples);
      s.durations[idx] = ms;
    }
    this.updatedAt = Date.now();
  }

  private async timed<T>(op: OpName, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const res = await fn();
      this.record(op, Date.now() - t0);
      return res;
    } catch (e) {
      this.record(op, Date.now() - t0, e);
      throw e;
    }
  }

  getMetrics(): L4StorageMetrics {
    const operations: any = {};
    let totalCount = 0;
    let totalErrors = 0;
    for (const [op, s] of this.ops.entries()) {
      const sorted = [...s.durations].sort((a, b) => a - b);
      const p = (q: number) => {
        if (sorted.length === 0) return 0;
        const idx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
        return sorted[idx];
      };
      const avg = s.count > 0 ? s.totalMs / s.count : 0;
      operations[op] = { ...s, p50: p(0.5), p95: p(0.95), p99: p(0.99), avg };
      totalCount += s.count;
      totalErrors += s.errors;
    }
    const extras: any = {};
    const innerAny: any = this.inner as any;
    if (typeof innerAny.getSkipCounts === 'function') {
      try {
        const sc = innerAny.getSkipCounts();
        extras.skippedRepresentationsSave = sc?.save ?? 0;
        extras.skippedRepresentationsLoad = sc?.load ?? 0;
      } catch {}
    }
    if (typeof innerAny.getMissingDataCounters === 'function') {
      try {
        const md = innerAny.getMissingDataCounters();
        extras.evolutionMissing = md?.evolutionMissing ?? 0;
      } catch {}
    }
    return { startedAt: this.startedAt, updatedAt: this.updatedAt, totals: { count: totalCount, errors: totalErrors }, operations, extras };
  }

  // Lifecycle
  async initialize(): Promise<void> {
    return this.timed('initialize', () => this.inner.initialize());
  }
  async close(): Promise<void> {
    return this.timed('close', () => this.inner.close());
  }

  // Core CRUD
  async saveConcept(concept: Concept): Promise<void> {
    return this.timed('saveConcept', () => this.inner.saveConcept(concept));
  }
  async updateConcept(concept: Concept): Promise<void> {
    return this.timed('updateConcept', () => this.inner.updateConcept(concept));
  }
  async deleteConcept(conceptId: string): Promise<void> {
    return this.timed('deleteConcept', () => this.inner.deleteConcept(conceptId));
  }
  async loadConcept(conceptId: string): Promise<Concept | null> {
    return this.timed('loadConcept', () => this.inner.loadConcept(conceptId));
  }
  async loadAllConcepts(): Promise<Concept[]> {
    return this.timed('loadAllConcepts', () => this.inner.loadAllConcepts());
  }

  // Optional helpers
  async findConceptsByName?(name: string): Promise<Concept[]> {
    if (!this.inner.findConceptsByName) return [];
    return this.timed('findConceptsByName', () => this.inner.findConceptsByName!(name));
  }
  async getConceptStatistics?(): Promise<{
    totalConcepts: number;
    totalRepresentations: number;
    totalRelations: number;
    averageRepresentationsPerConcept: number;
  }> {
    if (!this.inner.getConceptStatistics) {
      return { totalConcepts: 0, totalRepresentations: 0, totalRelations: 0, averageRepresentationsPerConcept: 0 };
    }
    return this.timed('getConceptStatistics', () => this.inner.getConceptStatistics!());
  }
  async vacuum?(): Promise<void> {
    if (!this.inner.vacuum) return;
    return this.timed('vacuum', () => this.inner.vacuum!());
  }
  async analyze?(): Promise<void> {
    if (!this.inner.analyze) return;
    return this.timed('analyze', () => this.inner.analyze!());
  }
  async backup?(backupPath: string): Promise<void> {
    if (!this.inner.backup) return;
    return this.timed('backup', () => this.inner.backup!(backupPath));
  }
}
