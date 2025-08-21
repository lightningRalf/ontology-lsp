import { OntologyEngine } from '../src/ontology/ontology-engine';
import { RelationType, Concept, SymbolRepresentation } from '../src/types/core';

describe('Step 3: OntologyEngine', () => {
  let engine: OntologyEngine;
  const rep = (name: string): SymbolRepresentation => ({
    name,
    location: { uri: 'file:///' + name + '.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    firstSeen: new Date(),
    lastSeen: new Date(),
    occurrences: 1
  });
  const baseSignature = { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'fp' };

  beforeAll(async () => {
    engine = new OntologyEngine(':memory:');
    await new Promise(res => setTimeout(res, 50));
    const concept: Concept = {
      id: '1',
      canonicalName: 'Alpha',
      representations: new Map([[ 'Alpha', rep('Alpha') ]]),
      relations: new Map(),
      signature: baseSignature,
      evolution: [],
      metadata: { tags: [] },
      confidence: 0.9
    };
    await engine.addConcept(concept);
  });

  afterAll(async () => {
    await engine.dispose();
  });

  test('finds concept by representation', async () => {
    const found = await engine.findConcept('Alpha');
    expect(found?.canonicalName).toBe('Alpha');
  });

  test('renames concept through evolution', async () => {
    await engine.evolveConcept({ type: 'rename', conceptId: '1', newName: 'Beta' });
    const renamed = await engine.findConcept('Beta');
    expect(renamed?.canonicalName).toBe('Beta');
  });

  test('adds relations and retrieves related concepts', async () => {
    const concept2: Concept = {
      id: '2',
      canonicalName: 'Gamma',
      representations: new Map([[ 'Gamma', rep('Gamma') ]]),
      relations: new Map(),
      signature: baseSignature,
      evolution: [],
      metadata: { tags: [] },
      confidence: 0.9
    };
    await engine.addConcept(concept2);
    await engine.addRelation('1', '2', RelationType.Uses);
    const related = engine.getRelatedConcepts('1');
    expect(related.some(r => r.concept.id === '2')).toBe(true);
  });
});