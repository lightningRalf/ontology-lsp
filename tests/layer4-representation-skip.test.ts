import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
import type { Concept, SymbolRepresentation } from '../src/types/core';
import { ensureTestDirectories, testPaths } from './test-helpers';

describe('Layer 4: Representation persistence guards', () => {
    const DB_PATH = testPaths.testDb('ontology-rep-guard');
    let engine1: OntologyEngine;

    beforeAll(async () => {
        ensureTestDirectories();
        engine1 = new OntologyEngine(new OntologyStorage(DB_PATH));
        await new Promise((r) => setTimeout(r, 20));
    });

    afterAll(async () => {
        await engine1.dispose();
    });

    test('skips malformed representations without crashing', async () => {
        const validRep: SymbolRepresentation = {
            name: 'GoodRep',
            location: {
                uri: 'file:///good.ts',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
            },
            firstSeen: new Date(),
            lastSeen: new Date(),
            occurrences: 1,
        };

        // Malformed: missing/invalid uri
        const badRep: any = {
            name: 'BadRep',
            location: { uri: '', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
            firstSeen: new Date(),
            lastSeen: new Date(),
            occurrences: 1,
        } as any;

        const concept: Concept = {
            id: 'rep-guard-1',
            canonicalName: 'SkipDemo',
            representations: new Map<string, SymbolRepresentation>([
                ['GoodRep', validRep],
                ['BadRep', badRep],
            ] as any),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'fp' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };

        // Should not throw
        await engine1.addConcept(concept);

        // New engine loads from DB; should only see valid representation
        const engine2 = new OntologyEngine(new OntologyStorage(DB_PATH));
        await new Promise((r) => setTimeout(r, 30));
        const loaded = await engine2.findConcept('SkipDemo');
        expect(loaded).toBeTruthy();
        expect(loaded && loaded.representations.size).toBe(1);
        expect(loaded && loaded.representations.has('GoodRep')).toBe(true);
        expect(loaded && loaded.representations.has('BadRep')).toBe(false);
        await engine2.dispose();
    });
});
