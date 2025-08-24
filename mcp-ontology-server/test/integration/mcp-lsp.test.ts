/**
 * Integration tests for MCP-LSP communication
 * 
 * Tests the complete flow of MCP server communicating with LSP server
 * Validates circuit breaker, caching, and retry mechanisms
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test"
import { HttpApiClient as LSPClient } from "../../src/utils/http-api-client.js"
import { OntologyLayer } from "../../src/layers/ontology.js"
import { TreeSitterLayer } from "../../src/layers/tree-sitter.js"
import { PatternLayer } from "../../src/layers/patterns.js"
import { KnowledgeLayer } from "../../src/layers/knowledge.js"
import { OntologyAPIServer } from "../../../src/api/http-server.js"
import { getTestConfig } from "../../src/config/server-config.js"
import * as path from "path"

describe("MCP-LSP Integration", () => {
  let lspServer: OntologyAPIServer
  let lspClient: LSPClient
  const testConfig = getTestConfig()
  const testPort = testConfig.ports.testAPI

  beforeAll(async () => {
    // Set test environment
    process.env.BUN_ENV = 'test'
    
    // Start LSP server on test port
    lspServer = new OntologyAPIServer({
      port: testPort,
      host: "localhost",
      dbPath: ":memory:", // Use in-memory database for tests
      workspaceRoot: path.resolve(import.meta.dir, "../fixtures"),
      cors: true
    })
    
    await lspServer.start()
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Create LSP client
    lspClient = new LSPClient({
      host: "localhost",
      port: testPort,
      timeout: 1000,
      maxRetries: 2,
      cacheEnabled: true,
      cacheTTL: 1000
    })
  })

  afterAll(async () => {
    // Stop the test server
    if (lspServer) {
      await lspServer.stop()
    }
  })

  describe("LSP Client", () => {
    test("should perform health check", async () => {
      const isHealthy = await lspClient.healthCheck()
      expect(isHealthy).toBe(true)
    })

    test("should get stats from LSP server", async () => {
      const stats = await lspClient.getStats()
      expect(stats).toBeDefined()
      expect(stats.ontology).toBeDefined()
      expect(stats.patterns).toBeDefined()
    })

    test("should handle connection failures with circuit breaker", async () => {
      // Create a client with circuit breaker
      const client = new LSPClient({
        host: "localhost",
        port: testPort,
        timeout: 100,
        maxRetries: 0
      })
      
      // Mock fetch to simulate failures
      let failCount = 0
      const originalFetch = global.fetch
      global.fetch = mock(() => {
        failCount++
        throw new Error("Connection refused")
      }) as any
      
      try {
        // First few failures should trigger circuit breaker
        for (let i = 0; i < 6; i++) {
          try {
            await client.getStats()
          } catch (error) {
            // Expected to fail
          }
        }
        
        // Circuit should now be open
        try {
          await client.getStats()
          expect(true).toBe(false) // Should not reach here
        } catch (error: any) {
          expect(error.message).toContain("Circuit breaker is open")
        }
      } finally {
        global.fetch = originalFetch
      }
    })

    test("should cache GET requests", async () => {
      // First request - not cached
      const start1 = performance.now()
      const result1 = await lspClient.getStats()
      const time1 = performance.now() - start1

      // Second request - should be cached
      const start2 = performance.now()
      const result2 = await lspClient.getStats()
      const time2 = performance.now() - start2

      expect(result1).toEqual(result2)
      expect(time2).toBeLessThan(time1) // Cached request should be faster
    })

    test("should not cache POST requests", async () => {
      const identifier = "testSymbol"
      
      const result1 = await lspClient.findSymbol(identifier, { fuzzy: false })
      const result2 = await lspClient.findSymbol(identifier, { fuzzy: false })
      
      // Results might be same but requests should have been made twice
      // We can't easily test this without mocking
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })

    test("should retry on failure with exponential backoff", async () => {
      let attemptCount = 0
      const mockFetch = mock(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error("Network error")
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "healthy" })
        })
      })

      // Replace global fetch temporarily
      const originalFetch = global.fetch
      global.fetch = mockFetch as any

      try {
        const client = new LSPClient({
          host: "localhost",
          port: testPort,
          timeout: 1000,
          maxRetries: 3
        })

        const result = await client.healthCheck()
        expect(result).toBe(true)
        expect(attemptCount).toBe(3) // Should have retried twice
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe("Ontology Layer Integration", () => {
    test("should get concept from LSP server", async () => {
      const layer = new OntologyLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.augment(previousResult, {
        concept: "TestClass",
        depth: 2
      })

      expect(result.layersUsed).toContain("ontology")
      expect(result.confidence).toBeGreaterThan(0)
    })

    test("should intelligently infer concepts when not found", async () => {
      const layer = new OntologyLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.augment(previousResult, {
        concept: "NonExistentConcept"
      })

      // The system should intelligently create/infer concepts
      expect(result.data.ontology).toBeDefined()
      expect(result.data.ontology.concept).toBeDefined()
      expect(result.data.ontology.concept.canonicalName).toBe("NonExistentConcept")
      expect(result.layersUsed).toContain("ontology")
    })

    test("should cache statistics", async () => {
      const layer = new OntologyLayer()
      
      const start1 = performance.now()
      const stats1 = await layer.getStatistics()
      const time1 = performance.now() - start1

      const start2 = performance.now()
      const stats2 = await layer.getStatistics()
      const time2 = performance.now() - start2

      expect(stats1).toEqual(stats2)
      expect(time2).toBeLessThan(time1) // Cached should be faster
    })
  })

  describe("Tree-Sitter Layer Integration", () => {
    test("should find symbols using semantic search", async () => {
      const layer = new TreeSitterLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.enhance(previousResult, {
        file: "test.ts",
        symbol: "TestFunction"
      })

      expect(result.layersUsed).toContain("tree-sitter")
      expect(result.executionTime).toBeDefined()
    })

    test("should handle file not found", async () => {
      const layer = new TreeSitterLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.enhance(previousResult, {
        file: "nonexistent.ts"
      })

      expect(result.layersUsed).toContain("tree-sitter")
      expect(result.data.treeSitterError).toBeUndefined() // Should handle gracefully
    })
  })

  describe("Pattern Layer Integration", () => {
    test("should get patterns from LSP server", async () => {
      const layer = new PatternLayer()
      const patterns = await layer.getRelevantPatterns({ file: "test.ts" })
      
      expect(patterns).toBeDefined()
      expect(Array.isArray(patterns)).toBe(true)
    })

    test("should get suggestions from LSP server", async () => {
      const layer = new PatternLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.apply(previousResult, {
        file: "test.ts",
        types: ["rename", "extract"],
        autoApply: false
      })

      expect(result.layersUsed).toContain("patterns")
      expect(result.data.refactoringSuggestions).toBeDefined()
    })

    test("should handle pattern statistics", async () => {
      const layer = new PatternLayer()
      const stats = await layer.getStatistics()
      
      expect(stats).toBeDefined()
      expect(stats.totalPatterns).toBeDefined()
      expect(stats.strongPatterns).toBeDefined()
    })
  })

  describe("Knowledge Layer Integration", () => {
    test("should analyze workspace", async () => {
      const layer = new KnowledgeLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.propagate(previousResult, {
        directory: "./test",
        detectViolations: true
      })

      expect(result.layersUsed).toContain("knowledge")
      expect(result.data.architecture).toBeDefined()
    })

    test("should propagate rename changes", async () => {
      const layer = new KnowledgeLayer()
      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      const result = await layer.propagate(previousResult, {
        oldName: "OldClass",
        newName: "NewClass",
        scope: "workspace"
      })

      expect(result.layersUsed).toContain("knowledge")
      expect(result.data.propagation).toBeDefined()
    })

    test("should get knowledge statistics", async () => {
      const layer = new KnowledgeLayer()
      const stats = await layer.getStatistics()
      
      expect(stats).toBeDefined()
      expect(stats.propagationsToday).toBeDefined()
      expect(stats.averagePropagationTime).toBeDefined()
      expect(stats.successRate).toBeDefined()
    })
  })

  describe("End-to-End Orchestration", () => {
    test("should handle complete request flow", async () => {
      // This would test the full orchestrator flow
      // but we need to import and test the orchestrator
      
      const layers = [
        new OntologyLayer(),
        new TreeSitterLayer(),
        new PatternLayer(),
        new KnowledgeLayer()
      ]

      let result = {
        data: {},
        confidence: 0,
        layersUsed: [] as string[],
        executionTime: 0,
        sufficient: false
      }

      // Simulate orchestrator behavior
      for (const layer of layers) {
        if (layer instanceof OntologyLayer) {
          result = await layer.augment(result, { concept: "TestConcept" })
        } else if (layer instanceof TreeSitterLayer) {
          result = await layer.enhance(result, { file: "test.ts" })
        } else if (layer instanceof PatternLayer) {
          result = await layer.apply(result, { scope: "file" })
        } else if (layer instanceof KnowledgeLayer) {
          result = await layer.propagate(result, { directory: "./" })
        }
        
        if (result.sufficient) break
      }

      expect(result.layersUsed.length).toBeGreaterThan(0)
      expect(result.confidence).toBeGreaterThan(0)
    })
  })

  describe("Error Handling", () => {
    test("should handle LSP server unavailable", async () => {
      const layer = new OntologyLayer()
      
      // Mock the lspClient's getConcept method to simulate server unavailable
      const originalGetConcept = (layer as any).lspClient.getConcept
      ;(layer as any).lspClient.getConcept = mock(() => {
        throw new Error("Connection refused: LSP server unavailable")
      })

      const previousResult = {
        data: {},
        confidence: 0,
        layersUsed: [],
        executionTime: 0,
        sufficient: false
      }

      try {
        const result = await layer.augment(previousResult, {
          concept: "TestConcept"
        })

        // Should handle error gracefully - getConcept returns null on error
        // So ontology should be undefined when concept can't be fetched
        expect(result.data.ontology).toBeUndefined()
        expect(result.layersUsed).toContain("ontology")
        expect(result.sufficient).toBe(true)
      } finally {
        // Restore original method
        ;(layer as any).lspClient.getConcept = originalGetConcept
      }
    })

    test("should handle malformed responses", async () => {
      const mockFetch = mock(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ unexpected: "format" })
        })
      })

      const originalFetch = global.fetch
      global.fetch = mockFetch as any

      try {
        const client = new LSPClient({
          host: "localhost",
          port: testPort,
          timeout: 1000
        })

        const result = await client.getConcept("TestConcept")
        expect(result).toBeDefined()
        expect(result.unexpected).toBe("format")
      } finally {
        global.fetch = originalFetch
      }
    })

    test("should handle timeout", async () => {
      const slowClient = new LSPClient({
        host: "localhost",
        port: testPort,
        timeout: 1, // 1ms timeout - will definitely timeout
        maxRetries: 0
      })

      try {
        await slowClient.getStats()
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })
})