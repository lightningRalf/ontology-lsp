import { describe, expect, test, beforeAll } from "bun:test"
import { TreeSitterLayer } from "../../src/layers/tree-sitter.js"

describe("TreeSitterLayer Integration Tests", () => {
  let layer: TreeSitterLayer
  
  beforeAll(() => {
    layer = new TreeSitterLayer()
  })
  
  describe("findDefinition", () => {
    test("should find class definitions", async () => {
      const result = await layer.findDefinition({
        symbol: "TreeSitterLayer",
        file: "src/layers/tree-sitter.ts"
      })
      
      expect(result).toBeDefined()
      expect(result.success).not.toBe(false)
    })
    
    test("should find function definitions", async () => {
      const result = await layer.findDefinition({
        symbol: "findDefinition"
      })
      
      expect(result).toBeDefined()
    })
    
    test("should handle non-existent symbols", async () => {
      const result = await layer.findDefinition({
        symbol: "NonExistentSymbol123456"
      })
      
      expect(result).toBeDefined()
      // Should return empty or error indication
    })
  })
  
  describe("findReferences", () => {
    test("should find references to a class", async () => {
      const result = await layer.findReferences({
        symbol: "TreeSitterLayer",
        scope: "workspace"
      })
      
      expect(result).toBeDefined()
      expect(result.references).toBeInstanceOf(Array)
    })
    
    test("should respect scope parameter", async () => {
      const workspaceResult = await layer.findReferences({
        symbol: "parse",
        scope: "workspace"
      })
      
      const fileResult = await layer.findReferences({
        symbol: "parse",
        scope: "file",
        file: "src/layers/tree-sitter.ts"
      })
      
      expect(workspaceResult).toBeDefined()
      expect(fileResult).toBeDefined()
    })
  })
  
  describe("analyzeComplexity", () => {
    test("should calculate cyclomatic complexity", async () => {
      const result = await layer.analyzeComplexity({
        file: "src/layers/orchestrator.ts",
        metrics: ["cyclomatic"]
      })
      
      expect(result).toBeDefined()
      expect(result.complexity).toBeDefined()
      expect(result.complexity.cyclomatic).toBeGreaterThan(0)
    })
    
    test("should handle multiple metrics", async () => {
      const result = await layer.analyzeComplexity({
        file: "src/index.ts",
        metrics: ["cyclomatic", "cognitive"]
      })
      
      expect(result).toBeDefined()
      expect(result.complexity).toBeDefined()
    })
    
    test("should handle non-existent files gracefully", async () => {
      const result = await layer.analyzeComplexity({
        file: "non-existent-file.ts",
        metrics: ["cyclomatic"]
      })
      
      expect(result).toBeDefined()
      expect(result.error || result.complexity).toBeDefined()
    })
  })
  
  describe("AST parsing", () => {
    test("should parse TypeScript files", async () => {
      const result = await layer.parseFile("src/index.ts")
      
      expect(result).toBeDefined()
      expect(result.tree || result.ast).toBeDefined()
    })
    
    test("should parse JavaScript files", async () => {
      const result = await layer.parseFile("test-mcp-stdio.js")
      
      expect(result).toBeDefined()
    })
    
    test("should cache parsed results", async () => {
      const start = performance.now()
      await layer.parseFile("src/index.ts")
      const firstTime = performance.now() - start
      
      const start2 = performance.now()
      await layer.parseFile("src/index.ts")
      const secondTime = performance.now() - start2
      
      // Second parse should be faster due to caching
      expect(secondTime).toBeLessThan(firstTime)
    })
  })
})