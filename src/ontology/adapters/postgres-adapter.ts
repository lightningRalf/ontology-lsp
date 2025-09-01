import type { Concept } from '../../types/core';
import type { StoragePort } from '../storage-port';

// Minimal Postgres adapter implementing StoragePort CRUD using lazy imports and env configuration.
// Env: ONTOLOGY_PG_URL | DATABASE_URL | PG_URL (postgres connection string)
export class PostgresStorageAdapter implements StoragePort {
  private client: any | null = null;
  private connected = false;
  private url: string | null;

  constructor() {
    this.url = process.env.ONTOLOGY_PG_URL || process.env.DATABASE_URL || process.env.PG_URL || null;
  }

  private async getClient(): Promise<any> {
    if (!this.url) {
      throw new Error('PG_ADAPTER_NOT_CONFIGURED: Missing ONTOLOGY_PG_URL / DATABASE_URL');
    }
    if (this.client) return this.client;
    const mod = await import('pg');
    const { Client } = mod as any;
    this.client = new Client({ connectionString: this.url });
    return this.client;
  }

  async initialize(): Promise<void> {
    if (!this.url) return; // allow initialize() in unconfigured envs
    const client = await this.getClient();
    await client.connect();
    this.connected = true;
    await this.createTables();
    await this.createIndices();
  }

  async close(): Promise<void> {
    if (!this.connected || !this.client) return;
    await this.client.end();
    this.connected = false;
    this.client = null;
  }

  private ensureReady(): void {
    if (!this.connected || !this.client) {
      throw new Error('PG_ADAPTER_NOT_READY: Call initialize() with valid configuration');
    }
  }

  private async createTables(): Promise<void> {
    this.ensureReady();
    const q = `
      CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS representations (
        id SERIAL PRIMARY KEY,
        concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        location_uri TEXT NOT NULL,
        location_range JSONB NOT NULL,
        first_seen TIMESTAMP NOT NULL,
        last_seen TIMESTAMP NOT NULL,
        occurrences INT NOT NULL DEFAULT 1,
        context TEXT
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        to_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        evidence JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS evolution_history (
        id SERIAL PRIMARY KEY,
        concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        timestamp TIMESTAMP NOT NULL,
        change_type TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        reason TEXT,
        confidence REAL NOT NULL DEFAULT 0.5
      );

      CREATE TABLE IF NOT EXISTS concept_metadata (
        concept_id TEXT PRIMARY KEY REFERENCES concepts(id) ON DELETE CASCADE,
        category TEXT,
        tags JSONB,
        is_interface BOOLEAN DEFAULT FALSE,
        is_abstract BOOLEAN DEFAULT FALSE,
        is_deprecated BOOLEAN DEFAULT FALSE,
        documentation TEXT
      );
    `;
    await this.client.query(q);
  }

  private async createIndices(): Promise<void> {
    this.ensureReady();
    const q = `
      CREATE INDEX IF NOT EXISTS idx_concepts_canonical_name ON concepts(canonical_name);
      CREATE INDEX IF NOT EXISTS idx_representations_name ON representations(name);
      CREATE INDEX IF NOT EXISTS idx_representations_concept_id ON representations(concept_id);
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_concept_id);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_concept_id);
      CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
      CREATE INDEX IF NOT EXISTS idx_evolution_concept_id ON evolution_history(concept_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_timestamp ON evolution_history(timestamp);
    `;
    await this.client.query(q);
  }

  async saveConcept(concept: Concept): Promise<void> {
    this.ensureReady();
    const c = this.client;
    await c.query('BEGIN');
    try {
      await c.query(
        `INSERT INTO concepts (id, canonical_name, confidence, metadata, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name,
           confidence = EXCLUDED.confidence,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          concept.id,
          concept.canonicalName,
          concept.confidence,
          JSON.stringify(this.serializeConcept(concept)),
        ],
      );

      await c.query('DELETE FROM representations WHERE concept_id = $1', [concept.id]);
      for (const [name, rep] of concept.representations) {
        await c.query(
          `INSERT INTO representations (concept_id, name, location_uri, location_range, first_seen, last_seen, occurrences, context)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            concept.id,
            name,
            rep.location.uri,
            JSON.stringify(rep.location.range),
            rep.firstSeen.toISOString(),
            rep.lastSeen.toISOString(),
            rep.occurrences,
            rep.context || null,
          ],
        );
      }

      await c.query('DELETE FROM relations WHERE from_concept_id = $1', [concept.id]);
      for (const [, relation] of concept.relations) {
        await c.query(
          `INSERT INTO relations (id, from_concept_id, to_concept_id, relation_type, confidence, evidence, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO NOTHING`,
          [
            relation.id,
            concept.id,
            relation.targetConceptId,
            relation.type,
            relation.confidence,
            JSON.stringify(relation.evidence),
            relation.createdAt.toISOString(),
          ],
        );
      }

      await c.query('DELETE FROM evolution_history WHERE concept_id = $1', [concept.id]);
      for (const ev of concept.evolution) {
        await c.query(
          `INSERT INTO evolution_history (concept_id, timestamp, change_type, from_state, to_state, reason, confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            concept.id,
            ev.timestamp.toISOString(),
            ev.type,
            ev.from,
            ev.to,
            ev.reason || null,
            ev.confidence,
          ],
        );
      }

      await c.query(
        `INSERT INTO concept_metadata (concept_id, category, tags, is_interface, is_abstract, is_deprecated, documentation)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (concept_id) DO UPDATE SET category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           is_interface = EXCLUDED.is_interface,
           is_abstract = EXCLUDED.is_abstract,
           is_deprecated = EXCLUDED.is_deprecated,
           documentation = EXCLUDED.documentation`,
        [
          concept.id,
          concept.metadata.category || null,
          JSON.stringify(concept.metadata.tags || []),
          !!(concept.metadata as any).isInterface,
          !!(concept.metadata as any).isAbstract,
          !!(concept.metadata as any).isDeprecated,
          (concept.metadata as any).documentation || null,
        ],
      );

      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  }

  async updateConcept(concept: Concept): Promise<void> {
    await this.saveConcept(concept);
  }

  async deleteConcept(conceptId: string): Promise<void> {
    this.ensureReady();
    await this.client.query('DELETE FROM concepts WHERE id = $1', [conceptId]);
  }

  async loadConcept(conceptId: string): Promise<Concept | null> {
    this.ensureReady();
    const row = await this.client
      .query('SELECT * FROM concepts WHERE id = $1', [conceptId])
      .then((r: any) => r.rows[0]);
    if (!row) return null;
    return await this.deserializeConcept(row);
  }

  async loadAllConcepts(): Promise<Concept[]> {
    this.ensureReady();
    const rows = await this.client
      .query('SELECT * FROM concepts ORDER BY updated_at DESC')
      .then((r: any) => r.rows as any[]);
    const results: Concept[] = [];
    for (const row of rows) {
      try {
        const c = await this.deserializeConcept(row);
        if (c) results.push(c);
      } catch {
        // skip invalid rows
      }
    }
    return results;
  }

  async findConceptsByName(name: string): Promise<Concept[]> {
    this.ensureReady();
    const idRows = await this.client
      .query('SELECT DISTINCT concept_id FROM representations WHERE name ILIKE $1', ['%' + name + '%'])
      .then((r: any) => r.rows as any[]);
    const res: Concept[] = [];
    for (const row of idRows) {
      const c = await this.loadConcept(row.concept_id);
      if (c) res.push(c);
    }
    return res;
  }

  async getConceptStatistics(): Promise<{
    totalConcepts: number;
    totalRepresentations: number;
    totalRelations: number;
    averageRepresentationsPerConcept: number;
  }> {
    this.ensureReady();
    const totalConcepts = await this.client
      .query('SELECT COUNT(*)::int as c FROM concepts')
      .then((r: any) => Number(r.rows[0].c));
    const totalRepresentations = await this.client
      .query('SELECT COUNT(*)::int as c FROM representations')
      .then((r: any) => Number(r.rows[0].c));
    const totalRelations = await this.client
      .query('SELECT COUNT(*)::int as c FROM relations')
      .then((r: any) => Number(r.rows[0].c));
    return {
      totalConcepts,
      totalRepresentations,
      totalRelations,
      averageRepresentationsPerConcept: totalConcepts > 0 ? totalRepresentations / totalConcepts : 0,
    };
  }

  async vacuum(): Promise<void> {
    if (!this.connected) return;
    await this.client.query('VACUUM');
  }
  async analyze(): Promise<void> {
    if (!this.connected) return;
    await this.client.query('ANALYZE');
  }
  async backup(_backupPath: string): Promise<void> {
    // no generic pg backup from client
  }

  private serializeConcept(concept: Concept): any {
    return {
      signature: concept.signature,
    };
  }

  private async deserializeConcept(row: any): Promise<Concept | null> {
    const meta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {};
    const reps = await this.client
      .query('SELECT * FROM representations WHERE concept_id = $1', [row.id])
      .then((r: any) => r.rows as any[]);
    const representations = new Map<string, any>();
    for (const rr of reps) {
      representations.set(rr.name, {
        name: rr.name,
        location: {
          uri: rr.location_uri,
          range: typeof rr.location_range === 'string' ? JSON.parse(rr.location_range) : rr.location_range,
        },
        firstSeen: new Date(rr.first_seen),
        lastSeen: new Date(rr.last_seen),
        occurrences: rr.occurrences,
        context: rr.context,
      });
    }
    const rels = await this.client
      .query('SELECT * FROM relations WHERE from_concept_id = $1', [row.id])
      .then((r: any) => r.rows as any[]);
    const relations = new Map<string, any>();
    for (const re of rels) {
      relations.set(re.to_concept_id, {
        id: re.id,
        targetConceptId: re.to_concept_id,
        type: re.relation_type,
        confidence: re.confidence,
        evidence: re.evidence || [],
        createdAt: new Date(re.created_at),
      });
    }
    const evs = await this.client
      .query('SELECT * FROM evolution_history WHERE concept_id = $1 ORDER BY timestamp DESC', [row.id])
      .then((r: any) => r.rows as any[]);
    const evolution = evs.map((e) => ({
      timestamp: new Date(e.timestamp),
      type: e.change_type as any,
      from: e.from_state,
      to: e.to_state,
      reason: e.reason || '',
      confidence: e.confidence,
    }));
    const metaRow = await this.client
      .query('SELECT * FROM concept_metadata WHERE concept_id = $1', [row.id])
      .then((r: any) => r.rows[0]);
    const metadata = metaRow
      ? {
          category: metaRow.category || undefined,
          tags: metaRow.tags || [],
          isInterface: !!metaRow.is_interface,
          isAbstract: !!metaRow.is_abstract,
          isDeprecated: !!metaRow.is_deprecated,
          documentation: metaRow.documentation || undefined,
        }
      : { tags: [] };
    return {
      id: row.id,
      canonicalName: row.canonical_name,
      representations,
      relations,
      signature: meta.signature || { parameters: [], sideEffects: [], complexity: 0, fingerprint: '' },
      evolution,
      metadata,
      confidence: Number(row.confidence) || 0,
    };
  }
}
