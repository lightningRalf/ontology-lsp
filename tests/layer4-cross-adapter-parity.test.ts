import { describe, expect, test } from 'bun:test';
import { PostgresStorageAdapter } from '../src/ontology/adapters/postgres-adapter';
import { TripleStoreStorageAdapter } from '../src/ontology/adapters/triple-adapter';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
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

(hasPg ? describe : describe.skip)('Layer 4: Cross-adapter parity (SQLite → Postgres)', () => {
    test('export from SQLite and import into Postgres; compare k-hop at depths 1 and 2', async () => {
        // Build in SQLite (in-memory)
        const sqlite = new OntologyEngine(new OntologyStorage(':memory:'));
        await new Promise((r) => setTimeout(r, 20));

        const suffix = String(Date.now());
        const A: Concept = {
            id: `xA-${suffix}`,
            canonicalName: `XAlpha_${suffix}`,
            representations: new Map([[`XAlpha_${suffix}`, rep(`XAlpha_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'xa' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const B: Concept = {
            id: `xB-${suffix}`,
            canonicalName: `XBeta_${suffix}`,
            representations: new Map([[`XBeta_${suffix}`, rep(`XBeta_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'xb' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        const C: Concept = {
            id: `xC-${suffix}`,
            canonicalName: `XGamma_${suffix}`,
            representations: new Map([[`XGamma_${suffix}`, rep(`XGamma_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'xc' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        };
        await sqlite.addConcept(A);
        await sqlite.addConcept(B);
        await sqlite.addConcept(C);
        await sqlite.addRelation(A.id, B.id, RelationType.Uses);
        await sqlite.addRelation(B.id, C.id, RelationType.Calls);

        // Export
        const exported = await sqlite.exportConcepts();
        const relSql1 = sqlite
            .getRelatedConcepts(A.id, 1)
            .map((r) => r.concept.canonicalName)
            .sort();
        const relSql2 = sqlite
            .getRelatedConcepts(A.id, 2)
            .map((r) => r.concept.canonicalName)
            .sort();

        // Import into Postgres
        const pg = new OntologyEngine(new PostgresStorageAdapter());
        await new Promise((r) => setTimeout(r, 50));
        for (const c of exported) {
            await pg.importConcept(c);
        }

        const relPg1 = pg
            .getRelatedConcepts(A.id, 1)
            .map((r) => r.concept.canonicalName)
            .sort();
        const relPg2 = pg
            .getRelatedConcepts(A.id, 2)
            .map((r) => r.concept.canonicalName)
            .sort();

        expect(relPg1).toEqual(relSql1);
        expect(relPg2).toEqual(relSql2);

        await sqlite.dispose();
        await pg.dispose();
    });
});

describe('Layer 4: Cross-adapter parity (SQLite → TripleStore)', () => {
    test('export from SQLite and import into TripleStore; compare k-hop at depths 1 and 2', async () => {
        const sqlite = new OntologyEngine(new OntologyStorage(':memory:'));
        await new Promise((r) => setTimeout(r, 20));

        const suffix = String(Date.now());
        const A = {
            id: `tA-${suffix}`,
            canonicalName: `TAlpha_${suffix}`,
            representations: new Map([[`TAlpha_${suffix}`, rep(`TAlpha_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'ta' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        } as any;
        const B = {
            id: `tB-${suffix}`,
            canonicalName: `TBeta_${suffix}`,
            representations: new Map([[`TBeta_${suffix}`, rep(`TBeta_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'tb' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        } as any;
        const C = {
            id: `tC-${suffix}`,
            canonicalName: `TGamma_${suffix}`,
            representations: new Map([[`TGamma_${suffix}`, rep(`TGamma_${suffix}`)]]),
            relations: new Map(),
            signature: { parameters: [], sideEffects: [], complexity: 1, fingerprint: 'tc' },
            evolution: [],
            metadata: { tags: [] },
            confidence: 0.9,
        } as any;
        await sqlite.addConcept(A);
        await sqlite.addConcept(B);
        await sqlite.addConcept(C);
        await sqlite.addRelation(A.id, B.id, RelationType.Uses);
        await sqlite.addRelation(B.id, C.id, RelationType.Calls);

        const exported = await sqlite.exportConcepts();
        const relSql1 = sqlite
            .getRelatedConcepts(A.id, 1)
            .map((r) => r.concept.canonicalName)
            .sort();
        const relSql2 = sqlite
            .getRelatedConcepts(A.id, 2)
            .map((r) => r.concept.canonicalName)
            .sort();

        const tstore = new OntologyEngine(new TripleStoreStorageAdapter());
        await new Promise((r) => setTimeout(r, 20));
        for (const c of exported) {
            await tstore.importConcept(c);
        }

        const relT1 = tstore
            .getRelatedConcepts(A.id, 1)
            .map((r) => r.concept.canonicalName)
            .sort();
        const relT2 = tstore
            .getRelatedConcepts(A.id, 2)
            .map((r) => r.concept.canonicalName)
            .sort();

        expect(relT1).toEqual(relSql1);
        expect(relT2).toEqual(relSql2);

        await sqlite.dispose();
        await tstore.dispose();
    });
});
