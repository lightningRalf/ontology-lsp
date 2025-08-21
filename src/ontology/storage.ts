// Ontology Storage - SQLite-based persistence for concepts and relations
import Database from 'better-sqlite3';
import { Concept, Relation } from '../types/core.js';
import * as path from 'path';
import * as fs from 'fs';

export class OntologyStorage {
    private db: Database.Database;
    
    constructor(private dbPath: string) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
    }
    
    async initialize(): Promise<void> {
        this.createTables();
        this.createIndices();
    }
    
    private createTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                canonical_name TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.5,
                data JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS representations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                concept_id TEXT NOT NULL,
                name TEXT NOT NULL,
                location_uri TEXT NOT NULL,
                location_range JSON NOT NULL,
                first_seen TIMESTAMP NOT NULL,
                last_seen TIMESTAMP NOT NULL,
                occurrences INTEGER NOT NULL DEFAULT 1,
                context TEXT,
                FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS relations (
                id TEXT PRIMARY KEY,
                from_concept_id TEXT NOT NULL,
                to_concept_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.5,
                evidence JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (from_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
                FOREIGN KEY (to_concept_id) REFERENCES concepts(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS evolution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                concept_id TEXT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                change_type TEXT NOT NULL,
                from_state TEXT NOT NULL,
                to_state TEXT NOT NULL,
                reason TEXT,
                confidence REAL NOT NULL DEFAULT 0.5,
                FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS concept_metadata (
                concept_id TEXT PRIMARY KEY,
                category TEXT,
                tags JSON,
                is_interface BOOLEAN DEFAULT FALSE,
                is_abstract BOOLEAN DEFAULT FALSE,
                is_deprecated BOOLEAN DEFAULT FALSE,
                documentation TEXT,
                FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
            );
        `);
    }
    
    private createIndices(): void {
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_concepts_canonical_name 
                ON concepts(canonical_name);
            
            CREATE INDEX IF NOT EXISTS idx_representations_name 
                ON representations(name);
            CREATE INDEX IF NOT EXISTS idx_representations_concept_id 
                ON representations(concept_id);
            
            CREATE INDEX IF NOT EXISTS idx_relations_from 
                ON relations(from_concept_id);
            CREATE INDEX IF NOT EXISTS idx_relations_to 
                ON relations(to_concept_id);
            CREATE INDEX IF NOT EXISTS idx_relations_type 
                ON relations(relation_type);
            
            CREATE INDEX IF NOT EXISTS idx_evolution_concept_id 
                ON evolution_history(concept_id);
            CREATE INDEX IF NOT EXISTS idx_evolution_timestamp 
                ON evolution_history(timestamp);
        `);
    }
    
    async saveConcept(concept: Concept): Promise<void> {
        const transaction = this.db.transaction(() => {
            // Save main concept
            const conceptStmt = this.db.prepare(`
                INSERT OR REPLACE INTO concepts (id, canonical_name, confidence, data, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            conceptStmt.run(
                concept.id,
                concept.canonicalName,
                concept.confidence,
                JSON.stringify(this.serializeConcept(concept))
            );
            
            // Clear existing representations
            const clearRepsStmt = this.db.prepare(`
                DELETE FROM representations WHERE concept_id = ?
            `);
            clearRepsStmt.run(concept.id);
            
            // Save representations
            const repStmt = this.db.prepare(`
                INSERT INTO representations 
                (concept_id, name, location_uri, location_range, first_seen, last_seen, occurrences, context)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const [name, rep] of concept.representations) {
                repStmt.run(
                    concept.id,
                    name,
                    rep.location.uri,
                    JSON.stringify(rep.location.range),
                    rep.firstSeen.toISOString(),
                    rep.lastSeen.toISOString(),
                    rep.occurrences,
                    rep.context || null
                );
            }
            
            // Save relations
            const clearRelationsStmt = this.db.prepare(`
                DELETE FROM relations WHERE from_concept_id = ?
            `);
            clearRelationsStmt.run(concept.id);
            
            const relationStmt = this.db.prepare(`
                INSERT OR REPLACE INTO relations 
                (id, from_concept_id, to_concept_id, relation_type, confidence, evidence, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const [_, relation] of concept.relations) {
                relationStmt.run(
                    relation.id,
                    concept.id,
                    relation.targetConceptId,
                    relation.type,
                    relation.confidence,
                    JSON.stringify(relation.evidence),
                    relation.createdAt.toISOString()
                );
            }
            
            // Save evolution history
            const clearEvolutionStmt = this.db.prepare(`
                DELETE FROM evolution_history WHERE concept_id = ?
            `);
            clearEvolutionStmt.run(concept.id);
            
            const evolutionStmt = this.db.prepare(`
                INSERT INTO evolution_history 
                (concept_id, timestamp, change_type, from_state, to_state, reason, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const evolution of concept.evolution) {
                evolutionStmt.run(
                    concept.id,
                    evolution.timestamp.toISOString(),
                    evolution.type,
                    evolution.from,
                    evolution.to,
                    evolution.reason,
                    evolution.confidence
                );
            }
            
            // Save metadata
            const metadataStmt = this.db.prepare(`
                INSERT OR REPLACE INTO concept_metadata 
                (concept_id, category, tags, is_interface, is_abstract, is_deprecated, documentation)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            metadataStmt.run(
                concept.id,
                concept.metadata.category || null,
                JSON.stringify(concept.metadata.tags || []),
                concept.metadata.isInterface || false,
                concept.metadata.isAbstract || false,
                concept.metadata.isDeprecated || false,
                concept.metadata.documentation || null
            );
        });
        
        transaction();
    }
    
    async updateConcept(concept: Concept): Promise<void> {
        await this.saveConcept(concept); // Same as save for now
    }
    
    async loadConcept(conceptId: string): Promise<Concept | null> {
        const conceptRow = this.db.prepare(`
            SELECT * FROM concepts WHERE id = ?
        `).get(conceptId);
        
        if (!conceptRow) return null;
        
        return this.deserializeConcept(conceptRow);
    }
    
    async loadAllConcepts(): Promise<Concept[]> {
        const conceptRows = this.db.prepare(`
            SELECT * FROM concepts ORDER BY updated_at DESC
        `).all();
        
        const concepts: Concept[] = [];
        
        for (const row of conceptRows) {
            try {
                const concept = await this.deserializeConcept(row);
                if (concept) {
                    concepts.push(concept);
                }
            } catch (error) {
                console.warn(`Failed to deserialize concept ${row.id}:`, error);
            }
        }
        
        return concepts;
    }
    
    async deleteConcept(conceptId: string): Promise<void> {
        const transaction = this.db.transaction(() => {
            // Relations and other dependent records will be deleted by CASCADE
            this.db.prepare(`DELETE FROM concepts WHERE id = ?`).run(conceptId);
        });
        
        transaction();
    }
    
    async findConceptsByName(name: string): Promise<Concept[]> {
        const conceptIds = this.db.prepare(`
            SELECT DISTINCT concept_id FROM representations WHERE name LIKE ?
        `).all(`%${name}%`).map(row => row.concept_id);
        
        const concepts: Concept[] = [];
        
        for (const id of conceptIds) {
            const concept = await this.loadConcept(id);
            if (concept) {
                concepts.push(concept);
            }
        }
        
        return concepts;
    }
    
    async getConceptStatistics(): Promise<{
        totalConcepts: number;
        totalRepresentations: number;
        totalRelations: number;
        averageRepresentationsPerConcept: number;
    }> {
        const stats = this.db.prepare(`
            SELECT 
                COUNT(*) as total_concepts,
                (SELECT COUNT(*) FROM representations) as total_representations,
                (SELECT COUNT(*) FROM relations) as total_relations
            FROM concepts
        `).get();
        
        return {
            totalConcepts: stats.total_concepts,
            totalRepresentations: stats.total_representations,
            totalRelations: stats.total_relations,
            averageRepresentationsPerConcept: 
                stats.total_concepts > 0 ? stats.total_representations / stats.total_concepts : 0
        };
    }
    
    private async deserializeConcept(row: any): Promise<Concept | null> {
        try {
            const data = JSON.parse(row.data);
            
            // Load representations
            const repRows = this.db.prepare(`
                SELECT * FROM representations WHERE concept_id = ?
            `).all(row.id);
            
            const representations = new Map();
            for (const repRow of repRows) {
                representations.set(repRow.name, {
                    name: repRow.name,
                    location: {
                        uri: repRow.location_uri,
                        range: JSON.parse(repRow.location_range)
                    },
                    firstSeen: new Date(repRow.first_seen),
                    lastSeen: new Date(repRow.last_seen),
                    occurrences: repRow.occurrences,
                    context: repRow.context
                });
            }
            
            // Load relations
            const relationRows = this.db.prepare(`
                SELECT * FROM relations WHERE from_concept_id = ?
            `).all(row.id);
            
            const relations = new Map();
            for (const relRow of relationRows) {
                relations.set(relRow.to_concept_id, {
                    id: relRow.id,
                    targetConceptId: relRow.to_concept_id,
                    type: relRow.relation_type,
                    confidence: relRow.confidence,
                    evidence: JSON.parse(relRow.evidence || '[]'),
                    createdAt: new Date(relRow.created_at)
                });
            }
            
            // Load evolution history
            const evolutionRows = this.db.prepare(`
                SELECT * FROM evolution_history WHERE concept_id = ? ORDER BY timestamp DESC
            `).all(row.id);
            
            const evolution = evolutionRows.map(evRow => ({
                timestamp: new Date(evRow.timestamp),
                type: evRow.change_type,
                from: evRow.from_state,
                to: evRow.to_state,
                reason: evRow.reason,
                confidence: evRow.confidence
            }));
            
            // Load metadata
            const metadataRow = this.db.prepare(`
                SELECT * FROM concept_metadata WHERE concept_id = ?
            `).get(row.id);
            
            const metadata = metadataRow ? {
                category: metadataRow.category,
                tags: JSON.parse(metadataRow.tags || '[]'),
                isInterface: metadataRow.is_interface,
                isAbstract: metadataRow.is_abstract,
                isDeprecated: metadataRow.is_deprecated,
                documentation: metadataRow.documentation
            } : {
                tags: []
            };
            
            return {
                id: row.id,
                canonicalName: row.canonical_name,
                representations,
                relations,
                signature: data.signature || {
                    parameters: [],
                    sideEffects: [],
                    complexity: 0,
                    fingerprint: ''
                },
                evolution,
                metadata,
                confidence: row.confidence
            };
            
        } catch (error) {
            console.error(`Failed to deserialize concept ${row.id}:`, error);
            return null;
        }
    }
    
    private serializeConcept(concept: Concept): any {
        return {
            signature: concept.signature,
            // Other serializable data can be added here
        };
    }
    
    async close(): Promise<void> {
        this.db.close();
    }
    
    // Maintenance methods
    async vacuum(): Promise<void> {
        this.db.exec('VACUUM');
    }
    
    async analyze(): Promise<void> {
        this.db.exec('ANALYZE');
    }
    
    async backup(backupPath: string): Promise<void> {
        await this.db.backup(backupPath);
    }
}