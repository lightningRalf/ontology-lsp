/**
 * CacheService - Unified caching layer supporting memory and Redis/Valkey
 * Provides high-performance caching for all layers with LRU eviction
 */

import {
  CacheConfig,
  CacheEntry,
  CacheKey,
  EventBus,
  CoreError
} from '../types.js';

/**
 * Memory cache implementation with LRU eviction
 */
class MemoryCache {
  private cache = new Map<CacheKey, CacheEntry<any>>();
  private accessOrder = new Map<CacheKey, number>();
  private accessCounter = 0;
  private maxSize: number;
  private defaultTtl: number;

  constructor(maxSize: number, defaultTtl: number) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
  }

  get<T>(key: CacheKey): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);
    entry.hits++;

    return entry.data;
  }

  set<T>(key: CacheKey, data: T, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl || this.defaultTtl;
    
    // Calculate approximate size (rough estimation)
    const size = this.estimateSize(data);
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: entryTtl,
      hits: 0,
      size
    };

    // Evict if necessary before adding
    this.evictIfNecessary();

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  delete(key: CacheKey): boolean {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): {
    size: number;
    totalHits: number;
    avgHits: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const timestamps = entries.map(e => e.timestamp);
    
    return {
      size: this.cache.size,
      totalHits,
      avgHits: entries.length > 0 ? totalHits / entries.length : 0,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0
    };
  }

  private evictIfNecessary(): void {
    if (this.cache.size < this.maxSize) {
      return;
    }

    // Find LRU entry
    let lruKey: CacheKey | null = null;
    let lruAccess = Infinity;
    
    for (const [key, access] of this.accessOrder.entries()) {
      if (access < lruAccess) {
        lruAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  private estimateSize(data: any): number {
    // Rough size estimation
    if (typeof data === 'string') {
      return data.length * 2; // UTF-16
    }
    if (typeof data === 'object') {
      return JSON.stringify(data).length * 2;
    }
    return 8; // Default for primitives
  }
}

/**
 * Redis/Valkey cache implementation (future enhancement)
 */
class RedisCache {
  private connected = false;

  async get<T>(key: CacheKey): Promise<T | null> {
    // TODO: Implement Redis connection
    throw new CoreError('Redis cache not implemented yet', 'NOT_IMPLEMENTED');
  }

  async set<T>(key: CacheKey, data: T, ttl?: number): Promise<void> {
    // TODO: Implement Redis connection
    throw new CoreError('Redis cache not implemented yet', 'NOT_IMPLEMENTED');
  }

  async delete(key: CacheKey): Promise<boolean> {
    throw new CoreError('Redis cache not implemented yet', 'NOT_IMPLEMENTED');
  }

  async clear(): Promise<void> {
    throw new CoreError('Redis cache not implemented yet', 'NOT_IMPLEMENTED');
  }
}

/**
 * Unified cache service that manages memory and distributed caching
 */
export class CacheService {
  private memoryCache: MemoryCache;
  private redisCache?: RedisCache;
  private config: CacheConfig;
  private eventBus: EventBus;
  private hitCount = 0;
  private missCount = 0;
  private initialized = false;

  constructor(config: CacheConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    
    this.memoryCache = new MemoryCache(
      Math.floor(config.memory.maxSize / 1024), // Convert bytes to approximate entries
      config.memory.ttl
    );

    if (config.strategy === 'redis' || config.strategy === 'hybrid') {
      if (config.redis) {
        this.redisCache = new RedisCache();
      } else {
        console.warn('Redis cache requested but no Redis configuration provided');
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize Redis if configured
      if (this.redisCache && this.config.redis) {
        // TODO: Initialize Redis connection
        console.log('Redis cache will be implemented in future version');
      }

      this.initialized = true;
      
      this.eventBus.emit('cache-service:initialized', {
        strategy: this.config.strategy,
        memoryMaxSize: this.config.memory.maxSize,
        redisConfigured: !!this.config.redis,
        timestamp: Date.now()
      });
    } catch (error) {
      this.eventBus.emit('cache-service:error', {
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

    this.memoryCache.clear();
    
    if (this.redisCache) {
      await this.redisCache.clear().catch(error => {
        console.error('Error clearing Redis cache:', error);
      });
    }

    this.initialized = false;
    
    this.eventBus.emit('cache-service:disposed', {
      finalStats: this.getStats(),
      timestamp: Date.now()
    });
  }

  async get<T>(key: CacheKey): Promise<T | null> {
    if (!this.initialized) {
      return null;
    }

    try {
      // Try memory cache first (fastest)
      const memoryResult = this.memoryCache.get<T>(key);
      if (memoryResult !== null) {
        this.hitCount++;
        this.eventBus.emit('cache-service:hit', {
          key,
          source: 'memory',
          timestamp: Date.now()
        });
        return memoryResult;
      }

      // Try Redis cache if available and configured
      if (this.redisCache && this.config.strategy !== 'memory') {
        try {
          const redisResult = await this.redisCache.get<T>(key);
          if (redisResult !== null) {
            // Cache in memory for faster future access
            this.memoryCache.set(key, redisResult, this.config.redis?.ttl);
            this.hitCount++;
            this.eventBus.emit('cache-service:hit', {
              key,
              source: 'redis',
              timestamp: Date.now()
            });
            return redisResult;
          }
        } catch (error) {
          console.warn('Redis cache error:', error);
          // Continue to miss count
        }
      }

      this.missCount++;
      this.eventBus.emit('cache-service:miss', {
        key,
        timestamp: Date.now()
      });
      return null;

    } catch (error) {
      this.eventBus.emit('cache-service:error', {
        operation: 'get',
        key,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      return null;
    }
  }

  async set<T>(key: CacheKey, data: T, ttl?: number): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Always cache in memory
      this.memoryCache.set(key, data, ttl);

      // Also cache in Redis if available and configured
      if (this.redisCache && this.config.strategy !== 'memory') {
        try {
          await this.redisCache.set(key, data, ttl || this.config.redis?.ttl);
        } catch (error) {
          console.warn('Redis cache set error:', error);
          // Memory cache still works
        }
      }

      this.eventBus.emit('cache-service:set', {
        key,
        ttl: ttl || this.config.memory.ttl,
        timestamp: Date.now()
      });

    } catch (error) {
      this.eventBus.emit('cache-service:error', {
        operation: 'set',
        key,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  async delete(key: CacheKey): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      let deleted = false;
      
      // Delete from memory
      if (this.memoryCache.delete(key)) {
        deleted = true;
      }

      // Delete from Redis if available
      if (this.redisCache && this.config.strategy !== 'memory') {
        try {
          if (await this.redisCache.delete(key)) {
            deleted = true;
          }
        } catch (error) {
          console.warn('Redis cache delete error:', error);
        }
      }

      if (deleted) {
        this.eventBus.emit('cache-service:delete', {
          key,
          timestamp: Date.now()
        });
      }

      return deleted;

    } catch (error) {
      this.eventBus.emit('cache-service:error', {
        operation: 'delete',
        key,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      return false;
    }
  }

  async clear(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.memoryCache.clear();
      
      if (this.redisCache && this.config.strategy !== 'memory') {
        try {
          await this.redisCache.clear();
        } catch (error) {
          console.warn('Redis cache clear error:', error);
        }
      }

      this.hitCount = 0;
      this.missCount = 0;

      this.eventBus.emit('cache-service:clear', {
        timestamp: Date.now()
      });

    } catch (error) {
      this.eventBus.emit('cache-service:error', {
        operation: 'clear',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  getStats(): {
    hitCount: number;
    missCount: number;
    hitRate: number;
    memoryStats: any;
    redisConnected: boolean;
    strategy: string;
  } {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate,
      memoryStats: this.memoryCache.getStats(),
      redisConnected: !!this.redisCache,
      strategy: this.config.strategy
    };
  }

  isHealthy(): boolean {
    if (!this.initialized) {
      return false;
    }

    // Memory cache should always be available
    if (this.memoryCache.size() >= 0) {
      // Check hit rate - should be reasonable
      const stats = this.getStats();
      if (stats.hitRate < 0.1 && stats.hitCount + stats.missCount > 100) {
        // Very low hit rate with significant traffic might indicate issues
        return false;
      }
      return true;
    }

    return false;
  }

  getDiagnostics(): Record<string, any> {
    return {
      initialized: this.initialized,
      config: this.config,
      stats: this.getStats(),
      healthy: this.isHealthy(),
      timestamp: Date.now()
    };
  }
}
