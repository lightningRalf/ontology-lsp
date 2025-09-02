import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OntologyEngine } from '../src/ontology/ontology-engine';
import { OntologyStorage } from '../src/ontology/storage';
import { ensureTestDirectories, testPaths } from './test-helpers';

describe('Layer 4: DB cleanup of malformed entries', () => {
    const DB = testPaths.testDb('ontology-cleanup');

    beforeAll(() => {
        ensureTestDirectories();
    });

    afterAll(async () => {
        // nothing
    });

    test('initialization cleans invalid representation rows', async () => {
        // 1) Initialize schema via storage
        const tmpEngine = new OntologyEngine(new OntologyStorage(DB));
        await new Promise((r) => setTimeout(r, 20));
        await tmpEngine.dispose();

        // 2) Seed bad rows directly via SQLite
        const db = new Database(DB);
        // Insert a concept
        db.prepare(`INSERT OR REPLACE INTO concepts (id, canonical_name, confidence, metadata, updated_at)
      VALUES ('c-clean', 'Cleaner', 0.9, '{}', strftime('%s','now'))
    `).run();
        // Insert malformed representations (empty uri, invalid json)
        db.prepare(`INSERT INTO representations (concept_id, name, location_uri, location_range, first_seen, last_seen, occurrences, context)
      VALUES ('c-clean', 'Bad1', '', '{', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, NULL)
    `).run();
        db.prepare(`INSERT INTO representations (concept_id, name, location_uri, location_range, first_seen, last_seen, occurrences, context)
      VALUES ('c-clean', 'Bad2', '', '{"start": {"line": "x", "character": 0}, "end": {"line": 0, "character": 0}}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, NULL)
    `).run();
        db.close();

        // 3) Re-initialize engine; storage.initialize should clean
        const engine = new OntologyEngine(new OntologyStorage(DB));
        await new Promise((r) => setTimeout(r, 30));

        // 4) Verify DB has no invalid representations remaining
        const db2 = new Database(DB);
        const countBad = db2
            .prepare(`
      SELECT COUNT(*) AS c FROM representations
      WHERE location_uri IS NULL OR TRIM(location_uri) = '' OR json_valid(location_range) = 0
         OR (json_valid(location_range) = 1 AND (
               json_type(json_extract(location_range,'$.start.line')) NOT IN ('integer') OR
               json_type(json_extract(location_range,'$.start.character')) NOT IN ('integer') OR
               json_type(json_extract(location_range,'$.end.line')) NOT IN ('integer') OR
               json_type(json_extract(location_range,'$.end.character')) NOT IN ('integer')
             ))
    `)
            .get() as any;
        db2.close();

        expect(countBad.c).toBe(0);

        await engine.dispose();
    });
});
