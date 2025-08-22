/**
 * REAL Integration tests - No mocks, actual network failures
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { LSPClient } from "../../src/utils/lsp-client.js"
import { OntologyLayer } from "../../src/layers/ontology.js"
import { OntologyAPIServer } from "../../../src/api/http-server.js"
import { getTestConfig } from "../../src/config/server-config.js"
import * as path from "path"
import * as net from "net"

describe("Real MCP-LSP Integration (No Mocks)", () => {
  let lspServer: OntologyAPIServer
  const testConfig = getTestConfig()
  const testPort = testConfig.ports.testAPI

  beforeAll(async () => {
    process.env.BUN_ENV = 'test'
    
    lspServer = new OntologyAPIServer({
      port: testPort,
      host: "localhost",
      dbPath: ":memory:",
      workspaceRoot: path.join(__dirname, "../fixtures"),
      cors: true
    })
    
    await lspServer.start()
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterAll(async () => {
    await lspServer.stop()
  })

  describe("Real Network Failures", () => {
    test("should trigger circuit breaker with real timeouts", async () => {
      // Use TEST-NET-1 address (RFC 5737) - guaranteed to not respond
      const failingClient = new LSPClient({
        host: "192.0.2.1", // This IP is reserved for documentation/testing
        port: 80,
        timeout: 50,  // 50ms timeout
        maxRetries: 0
      })

      const failures: Error[] = []
      
      // Trigger 6 real network timeouts
      for (let i = 0; i < 6; i++) {
        try {
          await failingClient.getStats()
        } catch (error: any) {
          failures.push(error)
        }
      }

      // All should have failed with timeout
      expect(failures.length).toBe(6)
      expect(failures[0].message).toContain("aborted") // Real timeout error
      
      // Circuit should now be open
      try {
        await failingClient.getStats()
        expect(true).toBe(false) // Should not reach
      } catch (error: any) {
        expect(error.message).toContain("Circuit breaker is open")
      }
    }, 20000) // Longer timeout for real network failures

    test("should handle server shutdown gracefully", async () => {
      // Create a temporary server we can control
      const tempPort = 7099
      const tempServer = new OntologyAPIServer({
        port: tempPort,
        host: "localhost",
        dbPath: ":memory:",
        workspaceRoot: path.join(__dirname, "../fixtures")
      })
      
      await tempServer.start()
      
      const client = new LSPClient({
        host: "localhost",
        port: tempPort,
        timeout: 1000
      })
      
      // Verify it works
      const stats1 = await client.getStats()
      expect(stats1).toBeDefined()
      
      // Stop the server
      await tempServer.stop()
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Now requests should fail
      try {
        await client.getStats()
        expect(true).toBe(false) // Should not reach
      } catch (error: any) {
        expect(error.message).toContain("fetch failed")
      }
    })

    test("should handle port already in use", async () => {
      // Start a raw TCP server on a port
      const blockingPort = 7098
      const blocker = net.createServer()
      
      await new Promise<void>((resolve) => {
        blocker.listen(blockingPort, () => resolve())
      })
      
      try {
        // Try to start LSP server on same port
        const conflictServer = new OntologyAPIServer({
          port: blockingPort,
          host: "localhost",
          dbPath: ":memory:"
        })
        
        try {
          await conflictServer.start()
          expect(true).toBe(false) // Should not reach
        } catch (error: any) {
          expect(error.message).toContain("EADDRINUSE")
        }
      } finally {
        blocker.close()
      }
    })

    test("should measure real retry backoff timing", async () => {
      const timings: number[] = []
      let lastTime = Date.now()
      
      // Create client with retries
      const retryClient = new LSPClient({
        host: "192.0.2.1", // Unreachable
        port: 80,
        timeout: 50,
        maxRetries: 3
      })
      
      // Track timing of retries
      const originalFetch = global.fetch
      global.fetch = async (...args) => {
        const now = Date.now()
        timings.push(now - lastTime)
        lastTime = now
        return originalFetch(...args)
      }
      
      try {
        await retryClient.getStats()
      } catch (error) {
        // Expected to fail after retries
      }
      
      global.fetch = originalFetch
      
      // Verify exponential backoff
      expect(timings.length).toBe(4) // Initial + 3 retries
      expect(timings[1]).toBeGreaterThan(900) // ~1s
      expect(timings[2]).toBeGreaterThan(1900) // ~2s
      expect(timings[3]).toBeGreaterThan(3900) // ~4s
    }, 30000)
  })

  describe("Real Cache Behavior", () => {
    test("should measure actual cache performance improvement", async () => {
      const client = new LSPClient({
        host: "localhost",
        port: testPort,
        cacheEnabled: true,
        cacheTTL: 5000
      })
      
      // First request - no cache
      const start1 = performance.now()
      const result1 = await client.getStats()
      const time1 = performance.now() - start1
      
      // Second request - should be cached
      const start2 = performance.now()
      const result2 = await client.getStats()
      const time2 = performance.now() - start2
      
      // Third request after cache invalidation
      await new Promise(resolve => setTimeout(resolve, 5100))
      const start3 = performance.now()
      const result3 = await client.getStats()
      const time3 = performance.now() - start3
      
      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
      
      // Cache hit should be at least 10x faster
      expect(time2).toBeLessThan(time1 / 10)
      
      // After expiry, should be slow again
      expect(time3).toBeGreaterThan(time2 * 5)
    }, 10000)
  })

  describe("Real Concurrency Issues", () => {
    test("should handle concurrent requests correctly", async () => {
      const client = new LSPClient({
        host: "localhost",
        port: testPort
      })
      
      // Fire 20 concurrent requests
      const promises = Array(20).fill(0).map((_, i) => 
        client.findSymbol(`TestSymbol${i}`, { fuzzy: true })
      )
      
      const results = await Promise.allSettled(promises)
      
      // All should complete without connection pool exhaustion
      const successful = results.filter(r => r.status === 'fulfilled')
      expect(successful.length).toBeGreaterThan(15) // Most should succeed
    })
  })
})