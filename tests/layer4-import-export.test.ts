import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';

describe('Layer 4: Import/Export parity', () => {
    let engine: OntologyEngine;

    beforeAll(async () => {
        engine = new OntologyEngine(new OntologyStorage(':memory:'));
        await new Promise((r) => setTimeout(r, 10));
    });

    afterAll(async () => {
        await engine.dispose();
    });

    test('imports and exports concepts', async () => {
        await engine.importConcept({
            canonicalName: 'Demo',
            representations: [
                [
                    'Demo',
                    {
                        name: 'Demo',
                        location: {
                            uri: 'file:///demo.ts',
                            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
                        },
                        firstSeen: new Date(),
                        lastSeen: new Date(),
                        occurrences: 1,
                    },
                ],
            ],
            relations: [],
            metadata: { tags: [] },
            evolution: [],
            confidence: 0.9,
        });

        const exported = await engine.exportConcepts();
        expect(Array.isArray(exported)).toBe(true);
        expect(exported.length).toBeGreaterThan(0);
        expect(exported.some((c) => c.canonicalName === 'Demo')).toBe(true);
    });
});
