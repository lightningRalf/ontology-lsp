import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
import type { Concept, SymbolRepresentation } from '../src/types/core';
import { ensureTestDirectories, testPaths } from './test-helpers';

describe('Layer 4: Engine validation (rename/import/move)', () => {
  const DB = testPaths.testDb('ontology-engine-validate');
  let engine: OntologyEngine;

  const rep = (name: string): SymbolRepresentation => ({
    name,
    location: {
      uri: 'file:///valid.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    },
    firstSeen: new Date(),
    lastSeen: new Date(),
    occurrences: 1,
  });

  beforeAll(async () => {
    ensureTestDirectories();
    engine = new OntologyEngine(new OntologyStorage(DB));
    await new Promise((r) => setTimeout(r, 20));
  });

  afterAll(async () => {
    await engine.dispose();
  });

  test('rename does not create invalid representation when none to clone', async () => {
    const c: Concept = {
      id: 'rn-1',
      canonicalName: 'Foo',
      // simulate no valid representations (empty map)
      representations: new Map(),
      relations: new Map(),
      signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'fp' },
      evolution: [],
      metadata: { tags: [] },
      confidence: 0.9,
    };
    await engine.addConcept(c);
    await engine.evolveConcept({ type: 'rename', conceptId: 'rn-1', newName: 'Bar' });
    const reloaded = await engine.findConcept('Bar');
    expect(reloaded?.canonicalName).toBe('Bar');
    // No new invalid rep should be present
    expect(reloaded && reloaded.representations.has('Bar')).toBe(false);
  });

  test('import drops invalid representation', async () => {
    await engine.importConcept({
      id: 'imp-1',
      canonicalName: 'Imp',
      representations: [
        ['Good', rep('Good')],
        // invalid: empty uri
        [
          'Bad',
          {
            name: 'Bad',
            location: { uri: '', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
            firstSeen: new Date(),
            lastSeen: new Date(),
            occurrences: 1,
          },
        ],
      ],
      relations: [],
      confidence: 0.8,
      signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'fp' },
      metadata: { tags: [] },
      evolution: [],
    });
    const loaded = await engine.findConcept('Imp');
    expect(loaded).toBeTruthy();
    expect(loaded && loaded.representations.has('Good')).toBe(true);
    expect(loaded && loaded.representations.has('Bad')).toBe(false);
  });

  test('move with bad uri does not corrupt reps', async () => {
    const c: Concept = {
      id: 'mv-1',
      canonicalName: 'Mover',
      representations: new Map([[ 'Mover', rep('Mover') ]]),
      relations: new Map(),
      signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'fp' },
      evolution: [],
      metadata: { tags: [] },
      confidence: 0.9,
    };
    await engine.addConcept(c);
    const before = (await engine.findConcept('Mover'))!;
    const beforeUri = before.representations.get('Mover')!.location.uri;
    await engine.evolveConcept({ type: 'move', conceptId: 'mv-1', location: '' });
    const after = (await engine.findConcept('Mover'))!;
    const afterUri = after.representations.get('Mover')!.location.uri;
    expect(afterUri).toBe(beforeUri);
  });
});
