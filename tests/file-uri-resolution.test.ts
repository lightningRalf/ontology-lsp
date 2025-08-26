/**
 * Red tests for file URI resolution fix
 * These tests should FAIL initially, then pass after implementation
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { MCPAdapter } from '../src/adapters/mcp-adapter';
import { CodeAnalyzer } from '../src/core/unified-analyzer';
import { LayerManager } from '../src/core/layer-manager';
import { SharedServices } from '../src/core/services/shared-services';
import { EventBusService as EventBus } from '../src/core/services/event-bus-service';
import { AsyncEnhancedGrep } from '../src/layers/enhanced-search-tools-async';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('File URI Resolution - Red Tests', () => {
  let analyzer: CodeAnalyzer;
  let mcpAdapter: MCPAdapter;
  const testDir = '/tmp/test-file-uri-resolution';

  beforeAll(async () => {
    // Create test files
    await fs.mkdir(testDir, { recursive: true });
    
    // Create a file with AsyncEnhancedGrep class
    await fs.writeFile(
      path.join(testDir, 'async-grep.ts'),
      `export class AsyncEnhancedGrep {
        constructor() {}
        async search(pattern: string) {
          return [];
        }
      }`
    );
    
    // Create another file that uses it
    await fs.writeFile(
      path.join(testDir, 'user.ts'),
      `import { AsyncEnhancedGrep } from './async-grep';
      const grep = new AsyncEnhancedGrep();`
    );

    // Initialize dependencies
    const eventBus = new EventBus();
    const layerManager = new LayerManager(eventBus);
    const sharedServices = new SharedServices({
      cache: {
        maxSize: 100,
        ttl: 60000
      },
      fileSystem: {
        watchForChanges: false
      },
      logging: {
        level: 'error'
      }
    }, eventBus);
    
    // Initialize analyzer with proper dependencies
    analyzer = new CodeAnalyzer(
      layerManager,
      sharedServices,
      {
        workspaceRoot: testDir,
        cacheEnabled: false,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
        performanceTracking: true
      },
      eventBus
    );
    
    // Initialize the analyzer
    await analyzer.initialize();
    
    mcpAdapter = new MCPAdapter(analyzer);
  });

  describe('MCP Adapter File Discovery', () => {
    test('should discover actual file location when no file context provided', async () => {
      // Call find_definition without file context
      const result = await mcpAdapter.handleToolCall('find_definition', {
        symbol: 'AsyncEnhancedGrep'
        // Note: no 'file' parameter provided
      });

      // Should find the definition
      expect(result.definitions).toBeDefined();
      expect(result.definitions.length).toBeGreaterThan(0);
      
      // Should have the actual file URI, not 'file://unknown'
      const definition = result.definitions[0];
      expect(definition.uri).not.toBe('file://unknown');
      expect(definition.uri).toContain('async-grep.ts');
      expect(definition.uri).toMatch(/^file:\/\//);
    });

    test('should handle symbol not found gracefully', async () => {
      const result = await mcpAdapter.handleToolCall('find_definition', {
        symbol: 'NonExistentSymbol'
      });

      // Should return empty results, not file://unknown
      expect(result.definitions).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    test('should use provided file context when available', async () => {
      const result = await mcpAdapter.handleToolCall('find_definition', {
        symbol: 'AsyncEnhancedGrep',
        file: path.join(testDir, 'user.ts')
      });

      // Should still find the definition
      expect(result.definitions).toBeDefined();
      expect(result.definitions.length).toBeGreaterThan(0);
      
      // Should have correct file URI
      const definition = result.definitions[0];
      expect(definition.uri).toContain('async-grep.ts');
    });
  });

  describe('Core Analyzer URI Validation', () => {
    test('should reject file://unknown URIs', async () => {
      const request = {
        uri: 'file://unknown',
        position: { line: 0, character: 0 },
        identifier: 'SomeSymbol'
      };

      const result = await analyzer.findDefinition(request);
      
      // Should not return results with file://unknown
      if (result.definitions && result.definitions.length > 0) {
        result.definitions.forEach(def => {
          expect(def.uri).not.toBe('file://unknown');
        });
      }
    });

    test('should validate URI format', async () => {
      const invalidUris = [
        'unknown',
        '//unknown',
        'file:unknown',
        'file//unknown',
        ''
      ];

      for (const uri of invalidUris) {
        const request = {
          uri,
          position: { line: 0, character: 0 },
          identifier: 'Symbol'
        };

        const result = await analyzer.findDefinition(request);
        
        // Should either fix the URI or return no results
        if (result.definitions && result.definitions.length > 0) {
          result.definitions.forEach(def => {
            expect(def.uri).toMatch(/^file:\/\//);
            expect(def.uri).not.toBe('file://unknown');
          });
        }
      }
    });
  });

  describe('Symbol Locator Integration', () => {
    test('should locate symbols across workspace', async () => {
      // This tests the new SymbolLocator functionality
      const locator = analyzer.getSymbolLocator?.() || analyzer;
      
      // Find AsyncEnhancedGrep without file context
      const locations = await locator.locateSymbol?.('AsyncEnhancedGrep') || [];
      
      expect(locations).toBeDefined();
      expect(locations.length).toBeGreaterThan(0);
      expect(locations[0].uri).toContain('async-grep.ts');
    });

    test('should cache symbol locations for performance', async () => {
      const locator = analyzer.getSymbolLocator?.() || analyzer;
      
      // First call - should search
      const start1 = Date.now();
      const locations1 = await locator.locateSymbol?.('AsyncEnhancedGrep') || [];
      const time1 = Date.now() - start1;
      
      // Second call - should use cache
      const start2 = Date.now();
      const locations2 = await locator.locateSymbol?.('AsyncEnhancedGrep') || [];
      const time2 = Date.now() - start2;
      
      expect(locations2).toEqual(locations1);
      expect(time2).toBeLessThan(time1 / 2); // Cache should be at least 2x faster
    });
  });

  describe('Error Handling', () => {
    test('should distinguish between "not found" and "location unknown"', async () => {
      // Test conceptual match without file location
      const result = await mcpAdapter.handleToolCall('find_definition', {
        symbol: 'ConceptualSymbol' // Symbol that exists conceptually but not in files
      });

      if (result.definitions && result.definitions.length > 0) {
        result.definitions.forEach(def => {
          // Should either have a valid URI or indicate it's conceptual
          if (def.source === 'conceptual') {
            expect(def.confidence).toBeLessThan(1.0);
          } else {
            expect(def.uri).toMatch(/^file:\/\//);
            expect(def.uri).not.toBe('file://unknown');
          }
        });
      }
    });

    test('should provide helpful error messages', async () => {
      const result = await mcpAdapter.handleToolCall('find_definition', {
        symbol: '' // Empty symbol
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('symbol');
    });
  });
});

// Export a test runner function for easy execution
export async function runFileUriTests() {
  console.log('Running File URI Resolution Tests...');
  console.log('These should FAIL before implementation (red tests)');
  console.log('----------------------------------------');
}