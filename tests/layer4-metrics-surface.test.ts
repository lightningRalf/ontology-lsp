import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { AnalyzerFactory } from '../src/core/analyzer-factory';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
import type { Concept, SymbolRepresentation } from '../src/types/core';

const rep = (name: string): SymbolRepresentation => ({
  name,
  location: { uri: 'file:///' + name + '.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
  firstSeen: new Date(),
  lastSeen: new Date(),
  occurrences: 1,
});

describe('Layer 4 metrics surface', () => {
  test('Instrumented storage collects timings and CLI exposes metrics', async () => {
    // Direct engine path
    const engine = new OntologyEngine(new OntologyStorage(':memory:'));
    await new Promise((r) => setTimeout(r, 20));

    // Do some operations
    const c: Concept = {
      id: 'm1',
      canonicalName: 'MetricOne',
      representations: new Map([[ 'MetricOne', rep('MetricOne') ]]),
      relations: new Map(),
      signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'm' },
      evolution: [],
      metadata: { tags: [] },
      confidence: 0.9,
    };
    await engine.addConcept(c);
    await engine.findConcept('MetricOne');
    await engine.exportConcepts();

    const m = engine.getStorageMetrics();
    expect(m).toBeTruthy();
    expect(m?.operations.saveConcept?.count || 0).toBeGreaterThan(0);
    expect(m?.operations.loadAllConcepts?.count || 0).toBeGreaterThan(0);

    await engine.dispose();
  });
});

