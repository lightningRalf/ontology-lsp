/**
 * DatabaseService - Unified database layer using Bun's native SQLite
 * Provides schema management, connection pooling, and query optimization
 */

import { Database } from 'bun:sqlite';
import { EventBus, CoreError } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

export interface DatabaseConfig {
  path: string;
  maxConnections?: number;
  busyTimeout?: number;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
}

/**
 * Database schema definitions for the unified system
 */
const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Core concepts table
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  signature_fingerprint TEXT,
  confidence REAL NOT NULL DEFAULT 0.0,
  category TEXT,
  is_interface INTEGER DEFAULT 0,
  is_abstract INTEGER DEFAULT 0,
  is_deprecated INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  metadata TEXT -- JSON metadata
);

-- Symbol representations table
CREATE TABLE IF NOT EXISTS symbol_representations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id TEXT NOT NULL,
  name TEXT NOT NULL,
  uri TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  start_character INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_character INTEGER NOT NULL,
  first_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  occurrences INTEGER DEFAULT 1,
  context TEXT,
  FOREIGN KEY (concept_id) REFERENCES concepts (id) ON DELETE CASCADE
);

-- Concept relationships table
CREATE TABLE IF NOT EXISTS concept_relationships (
  id TEXT PRIMARY KEY,
  source_concept_id TEXT NOT NULL,
  target_concept_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  evidence TEXT, -- JSON array of evidence
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (source_concept_id) REFERENCES concepts (id) ON DELETE CASCADE,
  FOREIGN KEY (target_concept_id) REFERENCES concepts (id) ON DELETE CASCADE,
  UNIQUE(source_concept_id, target_concept_id, relationship_type)
);

-- Evolution history table
CREATE TABLE IF NOT EXISTS evolution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  reason TEXT,
  confidence REAL NOT NULL DEFAULT 0.0,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (concept_id) REFERENCES concepts (id) ON DELETE CASCADE
);

-- Patterns table
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  from_pattern TEXT NOT NULL, -- JSON representation
  to_pattern TEXT NOT NULL,   -- JSON representation
  confidence REAL NOT NULL DEFAULT 0.0,
  occurrences INTEGER DEFAULT 1,
  category TEXT NOT NULL,
  last_applied INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  examples TEXT -- JSON array of examples
);

-- Usage analytics table
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  identifier TEXT NOT NULL,
  language TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  latency INTEGER, -- milliseconds
  cache_hit INTEGER DEFAULT 0,
  user_id TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Learning feedback table
CREATE TABLE IF NOT EXISTS learning_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  suggestion TEXT NOT NULL,
  actual_choice TEXT,
  confidence REAL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  operation TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds
  cache_hit INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Learning system tables
-- Code evolution events table
CREATE TABLE IF NOT EXISTS evolution_events (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  event_type TEXT NOT NULL,
  change_summary TEXT,
  impact_score REAL NOT NULL DEFAULT 0.0,
  architectural_impact TEXT,
  commit_hash TEXT,
  author TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  metadata TEXT -- JSON metadata
);

-- Team knowledge table for shared patterns
CREATE TABLE IF NOT EXISTS team_knowledge (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  pattern_id TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_feedback TEXT,
  adoption_count INTEGER DEFAULT 0,
  confidence_vote REAL,
  shared_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  validated_at INTEGER,
  last_used INTEGER,
  expertise_score REAL DEFAULT 0.0
);

-- Learning pipeline executions table
CREATE TABLE IF NOT EXISTS learning_pipeline_executions (
  id TEXT PRIMARY KEY,
  pipeline_type TEXT NOT NULL,
  input_data TEXT NOT NULL, -- JSON
  execution_status TEXT NOT NULL DEFAULT 'pending',
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration INTEGER,
  error_message TEXT,
  results TEXT, -- JSON
  confidence_scores TEXT -- JSON
);

-- Feedback corrections table for detailed learning
CREATE TABLE IF NOT EXISTS feedback_corrections (
  id TEXT PRIMARY KEY,
  original_feedback_id INTEGER NOT NULL,
  correction_type TEXT NOT NULL,
  original_suggestion TEXT NOT NULL,
  corrected_suggestion TEXT NOT NULL,
  correction_context TEXT,
  learning_weight REAL NOT NULL DEFAULT 1.0,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (original_feedback_id) REFERENCES learning_feedback (id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_concepts_canonical_name ON concepts (canonical_name);
CREATE INDEX IF NOT EXISTS idx_concepts_fingerprint ON concepts (signature_fingerprint);
CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts (category);

CREATE INDEX IF NOT EXISTS idx_symbol_representations_concept_id ON symbol_representations (concept_id);
CREATE INDEX IF NOT EXISTS idx_symbol_representations_name ON symbol_representations (name);
CREATE INDEX IF NOT EXISTS idx_symbol_representations_uri ON symbol_representations (uri);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON concept_relationships (source_concept_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON concept_relationships (target_concept_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON concept_relationships (relationship_type);

CREATE INDEX IF NOT EXISTS idx_evolution_concept_id ON evolution_history (concept_id);
CREATE INDEX IF NOT EXISTS idx_evolution_timestamp ON evolution_history (timestamp);

CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns (category);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns (confidence);

CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events (event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_identifier ON usage_events (identifier);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events (timestamp);

CREATE INDEX IF NOT EXISTS idx_feedback_request_id ON learning_feedback (request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON learning_feedback (timestamp);

CREATE INDEX IF NOT EXISTS idx_performance_layer ON performance_metrics (layer);
CREATE INDEX IF NOT EXISTS idx_performance_operation ON performance_metrics (operation);
CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics (timestamp);

-- Learning system indexes
CREATE INDEX IF NOT EXISTS idx_evolution_events_file_path ON evolution_events (file_path);
CREATE INDEX IF NOT EXISTS idx_evolution_events_type ON evolution_events (event_type);
CREATE INDEX IF NOT EXISTS idx_evolution_events_timestamp ON evolution_events (timestamp);

CREATE INDEX IF NOT EXISTS idx_team_knowledge_member_id ON team_knowledge (member_id);
CREATE INDEX IF NOT EXISTS idx_team_knowledge_pattern_id ON team_knowledge (pattern_id);
CREATE INDEX IF NOT EXISTS idx_team_knowledge_status ON team_knowledge (validation_status);

CREATE INDEX IF NOT EXISTS idx_pipeline_executions_type ON learning_pipeline_executions (pipeline_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_executions_status ON learning_pipeline_executions (execution_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_executions_start_time ON learning_pipeline_executions (start_time);

CREATE INDEX IF NOT EXISTS idx_feedback_corrections_original_id ON feedback_corrections (original_feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_corrections_type ON feedback_corrections (correction_type);
CREATE INDEX IF NOT EXISTS idx_feedback_corrections_applied_at ON feedback_corrections (applied_at);
`;

/**
 * Connection pool for SQLite databases
 */
class ConnectionPool {
  private connections: Database[] = [];
  private maxConnections: number;
  private activeConnections = 0;
  private waitQueue: Array<{ resolve: (db: Database) => void; reject: (error: Error) => void }> = [];

  constructor(dbPath: string, maxConnections: number = 10) {
    this.maxConnections = maxConnections;
    
    // Pre-create connections
    for (let i = 0; i < maxConnections; i++) {
      try {
        const db = new Database(dbPath);
        this.connections.push(db);
      } catch (error) {
        console.error(`Failed to create database connection ${i}:`, error);
        break;
      }
    }
  }

  async acquire(): Promise<Database> {
    if (this.connections.length > 0) {
      const db = this.connections.pop()!;
      this.activeConnections++;
      return db;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
      
      // Set timeout for waiting
      setTimeout(() => {
        const index = this.waitQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          reject(new CoreError('Database connection timeout', 'DB_TIMEOUT'));
        }
      }, 5000); // 5 second timeout
    });
  }

  release(db: Database): void {
    this.activeConnections--;
    
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      this.activeConnections++;
      waiter.resolve(db);
    } else {
      this.connections.push(db);
    }
  }

  async dispose(): Promise<void> {
    // Close all connections
    for (const db of this.connections) {
      try {
        db.close();
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
    this.connections.length = 0;
    
    // Reject any waiting requests
    for (const waiter of this.waitQueue) {
      waiter.reject(new CoreError('Database service shutting down', 'DB_SHUTDOWN'));
    }
    this.waitQueue.length = 0;
  }

  getStats(): {
    maxConnections: number;
    availableConnections: number;
    activeConnections: number;
    waitingRequests: number;
  } {
    return {
      maxConnections: this.maxConnections,
      availableConnections: this.connections.length,
      activeConnections: this.activeConnections,
      waitingRequests: this.waitQueue.length
    };
  }
}

/**
 * Unified database service using Bun's native SQLite
 */
export class DatabaseService {
  private pool?: ConnectionPool;
  private config: DatabaseConfig;
  private eventBus: EventBus;
  private initialized = false;
  private schemaVersion = 0;

  constructor(config: DatabaseConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.config.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create connection pool
      this.pool = new ConnectionPool(
        this.config.path,
        this.config.maxConnections || 10
      );

      // Initialize database schema
      await this.initializeSchema();
      
      this.initialized = true;
      
      this.eventBus.emit('database-service:initialized', {
        dbPath: this.config.path,
        schemaVersion: this.schemaVersion,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.eventBus.emit('database-service:error', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    if (this.pool) {
      await this.pool.dispose();
    }

    this.initialized = false;
    
    this.eventBus.emit('database-service:disposed', {
      timestamp: Date.now()
    });
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.initialized || !this.pool) {
      throw new CoreError('Database service not initialized', 'DB_NOT_INITIALIZED');
    }

    const db = await this.pool.acquire();
    
    try {
      const stmt = db.prepare(sql);
      const result = stmt.all(...params) as T[];
      return result;
    } catch (error) {
      this.eventBus.emit('database-service:query-error', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw new CoreError(
        `Database query failed: ${error instanceof Error ? error.message : String(error)}`,
        'DB_QUERY_ERROR'
      );
    } finally {
      this.pool.release(db);
    }
  }

  /**
   * Execute a single query and return first result
   */
  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a query that doesn't return data (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    if (!this.initialized || !this.pool) {
      throw new CoreError('Database service not initialized', 'DB_NOT_INITIALIZED');
    }

    const db = await this.pool.acquire();
    
    try {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid)
      };
    } catch (error) {
      this.eventBus.emit('database-service:execute-error', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw new CoreError(
        `Database execute failed: ${error instanceof Error ? error.message : String(error)}`,
        'DB_EXECUTE_ERROR'
      );
    } finally {
      this.pool.release(db);
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (query: (sql: string, params?: any[]) => Promise<any>) => Promise<T>): Promise<T> {
    if (!this.initialized || !this.pool) {
      throw new CoreError('Database service not initialized', 'DB_NOT_INITIALIZED');
    }

    const db = await this.pool.acquire();
    
    try {
      // Start transaction
      db.exec('BEGIN TRANSACTION');
      
      const transactionQuery = async (sql: string, params: any[] = []) => {
        const stmt = db.prepare(sql);
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      };
      
      const result = await callback(transactionQuery);
      
      // Commit transaction
      db.exec('COMMIT');
      
      return result;
      
    } catch (error) {
      // Rollback on error
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      
      this.eventBus.emit('database-service:transaction-error', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      throw new CoreError(
        `Database transaction failed: ${error instanceof Error ? error.message : String(error)}`,
        'DB_TRANSACTION_ERROR'
      );
    } finally {
      this.pool.release(db);
    }
  }

  private async initializeSchema(): Promise<void> {
    if (!this.pool) {
      throw new CoreError('Connection pool not available', 'DB_POOL_ERROR');
    }

    const db = await this.pool.acquire();
    
    try {
      // Configure SQLite for better performance
      if (this.config.enableWAL !== false) {
        db.exec('PRAGMA journal_mode = WAL');
      }
      if (this.config.enableForeignKeys !== false) {
        db.exec('PRAGMA foreign_keys = ON');
      }
      if (this.config.busyTimeout) {
        db.exec(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);
      }
      
      // Execute schema SQL
      db.exec(SCHEMA_SQL);
      
      // Check/update schema version
      const versionResult = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
      this.schemaVersion = versionResult.version || 0;
      
      if (this.schemaVersion < SCHEMA_VERSION) {
        // Insert new schema version
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
        this.schemaVersion = SCHEMA_VERSION;
      }
      
    } catch (error) {
      throw new CoreError(
        `Schema initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'DB_SCHEMA_ERROR'
      );
    } finally {
      this.pool.release(db);
    }
  }

  /**
   * Get database statistics and health information
   */
  async getStats(): Promise<{
    schemaVersion: number;
    connectionPool: any;
    tableStats: Record<string, number>;
    dbSize: number;
  }> {
    const tableStats: Record<string, number> = {};
    
    // Get row counts for main tables
    const tables = [
      'concepts', 'symbol_representations', 'concept_relationships',
      'evolution_history', 'patterns', 'usage_events', 'learning_feedback',
      'performance_metrics', 'evolution_events', 'team_knowledge',
      'learning_pipeline_executions', 'feedback_corrections'
    ];
    
    for (const table of tables) {
      try {
        const result = await this.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
        tableStats[table] = result?.count || 0;
      } catch (error) {
        tableStats[table] = -1; // Error indicator
      }
    }
    
    // Get database file size
    let dbSize = 0;
    try {
      const stats = fs.statSync(this.config.path);
      dbSize = stats.size;
    } catch (error) {
      // File might not exist yet
    }
    
    return {
      schemaVersion: this.schemaVersion,
      connectionPool: this.pool?.getStats() || {},
      tableStats,
      dbSize
    };
  }

  isHealthy(): boolean {
    return this.initialized && !!this.pool;
  }

  getDiagnostics(): Record<string, any> {
    return {
      initialized: this.initialized,
      config: this.config,
      schemaVersion: this.schemaVersion,
      connectionPool: this.pool?.getStats(),
      healthy: this.isHealthy(),
      timestamp: Date.now()
    };
  }
}
