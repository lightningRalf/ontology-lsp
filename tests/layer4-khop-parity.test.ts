import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
import { type Concept, RelationType, type SymbolRepresentation } from '../src/types/core';

const TMP_DB = '/tmp/ontology-khop-parity.db';

const rep = (name: string): SymbolRepresentation => ({
    name,
    location: {
        uri: 'file:///' + name + '.ts',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    },
    firstSeen: new Date(),
    lastSeen: new Date(),
    occurrences: 1,
});

describe('Layer 4: k-hop parity (SQLite)', () => {
    let engine: OntologyEngine;

    beforeAll(async () => {
        try {
            if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB);
        } catch {}
        engine = new OntologyEngine(new OntologyStorage(TMP_DB));
        // wait a tick for initialization
        await new Promise((r) => setTimeout(r, 20));

        const A: Concept = {
            id: 'A',
            canonicalName: 'Alpha',
            representations: new Map([['Alpha', rep('Alpha')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'a' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const B: Concept = {
            id: 'B',
            canonicalName: 'Beta',
            representations: new Map([['Beta', rep('Beta')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'b' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const C: Concept = {
            id: 'C',
            canonicalName: 'Gamma',
            representations: new Map([['Gamma', rep('Gamma')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'c' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };

        await engine.addConcept(A);
        await engine.addConcept(B);
        await engine.addConcept(C);

        await engine.addRelation('A', 'B', RelationType.Uses);
        await engine.addRelation('B', 'C', RelationType.Calls);
    });

    afterAll(async () => {
        await engine.dispose();
        try {
            if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB);
        } catch {}
    });

    test('k-hop traversal includes 2-hop relations', () => {
        const related = engine.getRelatedConcepts('A', 2);
        const names = related.map((r) => r.concept.canonicalName);
        expect(names).toContain('Beta');
        expect(names).toContain('Gamma');
    });

    test('persistence across restart preserves concepts and relations', async () => {
        await engine.dispose();

        const engine2 = new OntologyEngine(new OntologyStorage(TMP_DB));
        await new Promise((r) => setTimeout(r, 20));

        const foundA = await engine2.findConcept('Alpha');
        expect(foundA?.canonicalName).toBe('Alpha');

        const related2 = engine2.getRelatedConcepts('A', 2);
        const names2 = related2.map((r) => r.concept.canonicalName);
        expect(names2).toContain('Beta');
        expect(names2).toContain('Gamma');

        await engine2.dispose();
    });
});
