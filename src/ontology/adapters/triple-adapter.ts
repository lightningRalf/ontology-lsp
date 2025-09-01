import type { Concept } from '../../types/core';
import type { StoragePort } from '../storage-port';

// Triple Store adapter with in-memory triples for CRUD parity and tests.
// No external network required; optional TRIPLESTORE_URL is ignored for now.
export class TripleStoreStorageAdapter implements StoragePort {
  private concepts = new Map<string, Concept>();
  private nameIndex = new Map<string, Set<string>>(); // name -> set of concept ids
  private initialized = false;

  async initialize(): Promise<void> {
    // In-memory store; nothing to do
    this.initialized = true;
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory
  }

  async saveConcept(concept: Concept): Promise<void> {
    this.ensure();
    // Remove old index if concept exists
    const prev = this.concepts.get(concept.id);
    if (prev) {
      for (const [name] of prev.representations) {
        const set = this.nameIndex.get(name);
        if (set) {
          set.delete(prev.id);
          if (set.size === 0) this.nameIndex.delete(name);
        }
      }
    }
    // Deep clone minimal to avoid shared references
    const cloned: Concept = {
      id: concept.id,
      canonicalName: concept.canonicalName,
      representations: new Map(concept.representations),
      relations: new Map(concept.relations),
      signature: concept.signature,
      evolution: [...concept.evolution],
      metadata: concept.metadata,
      confidence: concept.confidence,
    };
    this.concepts.set(concept.id, cloned);
    for (const [name] of cloned.representations) {
      if (!this.nameIndex.has(name)) this.nameIndex.set(name, new Set());
      this.nameIndex.get(name)!.add(concept.id);
    }
  }

  async updateConcept(concept: Concept): Promise<void> {
    await this.saveConcept(concept);
  }

  async deleteConcept(conceptId: string): Promise<void> {
    this.ensure();
    const prev = this.concepts.get(conceptId);
    if (!prev) return;
    for (const [name] of prev.representations) {
      const set = this.nameIndex.get(name);
      if (set) {
        set.delete(conceptId);
        if (set.size === 0) this.nameIndex.delete(name);
      }
    }
    this.concepts.delete(conceptId);
    // Remove incoming relations to this concept from others
    for (const [, c] of this.concepts) {
      if (c.relations.has(conceptId)) {
        c.relations.delete(conceptId);
      }
    }
  }

  async loadConcept(conceptId: string): Promise<Concept | null> {
    this.ensure();
    const c = this.concepts.get(conceptId);
    if (!c) return null;
    return this.clone(c);
  }

  async loadAllConcepts(): Promise<Concept[]> {
    this.ensure();
    return [...this.concepts.values()].map((c) => this.clone(c));
  }

  async findConceptsByName(name: string): Promise<Concept[]> {
    this.ensure();
    const ids = new Set<string>();
    // Direct index hits
    for (const [n, set] of this.nameIndex) {
      if (n.includes(name)) for (const id of set) ids.add(id);
    }
    const res: Concept[] = [];
    for (const id of ids) {
      const c = await this.loadConcept(id);
      if (c) res.push(c);
    }
    return res;
  }

  async getConceptStatistics(): Promise<{
    totalConcepts: number;
    totalRepresentations: number;
    totalRelations: number;
    averageRepresentationsPerConcept: number;
  }> {
    this.ensure();
    const totalConcepts = this.concepts.size;
    let totalRepresentations = 0;
    let totalRelations = 0;
    for (const [, c] of this.concepts) {
      totalRepresentations += c.representations.size;
      totalRelations += c.relations.size;
    }
    return {
      totalConcepts,
      totalRepresentations,
      totalRelations,
      averageRepresentationsPerConcept: totalConcepts > 0 ? totalRepresentations / totalConcepts : 0,
    };
  }

  async vacuum(): Promise<void> {
    // no-op for in-memory
  }
  async analyze(): Promise<void> {
    // no-op for in-memory
  }
  async backup(_backupPath: string): Promise<void> {
    // no-op for in-memory
  }

  private ensure(): void {
    if (!this.initialized) throw new Error('TRIPLESTORE_NOT_INITIALIZED');
  }

  private clone(c: Concept): Concept {
    return {
      id: c.id,
      canonicalName: c.canonicalName,
      representations: new Map(c.representations),
      relations: new Map(c.relations),
      signature: c.signature,
      evolution: [...c.evolution],
      metadata: c.metadata,
      confidence: c.confidence,
    };
  }
}
