import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PostgresStorageAdapter } from '../src/ontology/adapters/postgres-adapter';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { type Concept, RelationType, type SymbolRepresentation } from '../src/types/core';

const hasPg = !!(process.env.ONTOLOGY_PG_URL || process.env.DATABASE_URL || process.env.PGURL || process.env.PG_URL);

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

(hasPg ? describe : describe.skip)('Layer 4: Postgres parity', () => {
    let engine: OntologyEngine;

    beforeAll(async () => {
        const pg = new PostgresStorageAdapter();
        engine = new OntologyEngine(pg);
        await new Promise((r) => setTimeout(r, 50));
    });

    afterAll(async () => {
        await engine.dispose();
    });

    test('basic CRUD parity and k-hop', async () => {
        const A: Concept = {
            id: 'pg-A',
            canonicalName: 'PgAlpha',
            representations: new Map([['PgAlpha', rep('PgAlpha')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'pg-a' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const B: Concept = {
            id: 'pg-B',
            canonicalName: 'PgBeta',
            representations: new Map([['PgBeta', rep('PgBeta')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'pg-b' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const C: Concept = {
            id: 'pg-C',
            canonicalName: 'PgGamma',
            representations: new Map([['PgGamma', rep('PgGamma')]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'pg-c' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };

        await engine.addConcept(A);
        await engine.addConcept(B);
        await engine.addConcept(C);
        await engine.addRelation('pg-A', 'pg-B', RelationType.Uses);
        await engine.addRelation('pg-B', 'pg-C', RelationType.Calls);

        const related = engine.getRelatedConcepts('pg-A', 2);
        const names = related.map((r) => r.concept.canonicalName);
        expect(names).toContain('PgBeta');
        expect(names).toContain('PgGamma');

        const foundA = await engine.findConcept('PgAlpha');
        expect(foundA?.canonicalName).toBe('PgAlpha');
    });
});
