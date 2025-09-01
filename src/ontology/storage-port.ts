import type { Concept } from '../types/core';

// StoragePort abstracts Layer 4 persistence behind interchangeable adapters.
// Implementations must be fast, safe, and support basic maintenance.
export interface StoragePort {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Core CRUD
  saveConcept(concept: Concept): Promise<void>;
  updateConcept(concept: Concept): Promise<void>;
  deleteConcept(conceptId: string): Promise<void>;
  loadConcept(conceptId: string): Promise<Concept | null>;
  loadAllConcepts(): Promise<Concept[]>;

  // Optional helpers (adapters may no-op or throw if unsupported)
  findConceptsByName?(name: string): Promise<Concept[]>;
  getConceptStatistics?(): Promise<{
    totalConcepts: number;
    totalRepresentations: number;
    totalRelations: number;
    averageRepresentationsPerConcept: number;
  }>;
  vacuum?(): Promise<void>;
  analyze?(): Promise<void>;
  backup?(backupPath: string): Promise<void>;
}

// Adapter type identifiers for configuration
export type StorageAdapterKind = 'sqlite' | 'postgres' | 'triplestore';

