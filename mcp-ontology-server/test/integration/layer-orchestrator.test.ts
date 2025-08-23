import { describe, expect, test, beforeAll } from "bun:test"
import { LayerOrchestrator } from "../../src/layers/orchestrator.js"

describe("LayerOrchestrator Integration Tests", () => {
  let orchestrator: LayerOrchestrator
  
  beforeAll(() => {
    orchestrator = new LayerOrchestrator()
  })
  
  describe("Tool routing", () => {
    test("should route search_files to Claude tools layer", async () => {
      const result = await orchestrator.executeTool("search_files", {
        pattern: "**/*.ts",
        workspace: "src"
      })
      
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.layersUsed).toContain("claude-tools")
    })
    
    test("should route find_definition through multiple layers", async () => {
      const result = await orchestrator.executeTool("find_definition", {
        symbol: "LayerOrchestrator"
      })
      
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.layersUsed.length).toBeGreaterThan(1)
    })
    
    test("should route analyze_complexity to tree-sitter layer", async () => {
      const result = await orchestrator.executeTool("analyze_complexity", {
        file: "src/index.ts",
        metrics: ["cyclomatic"]
      })
      
      expect(result).toBeDefined()
      expect(result.layersUsed).toContain("tree-sitter")
    })
    
    test("should route find_related_concepts to ontology layer", async () => {
      const result = await orchestrator.executeTool("find_related_concepts", {
        concept: "Server",
        depth: 1
      })
      
      expect(result).toBeDefined()
      expect(result.layersUsed).toContain("ontology")
    })
    
    test("should route detect_patterns to patterns layer", async () => {
      const result = await orchestrator.executeTool("detect_patterns", {
        scope: "src",
        patterns: ["singleton"],
        minConfidence: 0.5
      })
      
      expect(result).toBeDefined()
      expect(result.layersUsed).toContain("patterns")
    })
    
    test("should route rename_symbol through tree-sitter and knowledge layers", async () => {
      const result = await orchestrator.executeTool("rename_symbol", {
        oldName: "test",
        newName: "renamed",
        preview: true
      })
      
      expect(result).toBeDefined()
      expect(result.layersUsed).toContain("tree-sitter")
      expect(result.layersUsed).toContain("knowledge")
    })
  })
  
  describe("Result merging", () => {
    test("should merge results from multiple layers", async () => {
      const result = await orchestrator.executeTool("find_references", {
        symbol: "executeTool",
        scope: "workspace"
      })
      
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      // Should combine tree-sitter and ontology results
      expect(result.layersUsed.length).toBeGreaterThanOrEqual(2)
    })
    
    test("should enhance refactoring suggestions with ontology", async () => {
      const result = await orchestrator.executeTool("suggest_refactoring", {
        file: "src/index.ts",
        types: ["extract"]
      })
      
      expect(result).toBeDefined()
      expect(result.layersUsed).toContain("patterns")
      // May also use ontology for context
    })
  })
  
  describe("Performance tracking", () => {
    test("should track execution time", async () => {
      const result = await orchestrator.executeTool("grep_content", {
        pattern: "test",
        files: "**/*.ts"
      })
      
      expect(result).toBeDefined()
      expect(result.executionTime).toBeGreaterThan(0)
      expect(result.executionTime).toBeLessThan(1000) // Should be fast
    })
    
    test("should meet performance targets for each layer", async () => {
      // Layer 1: 5ms target
      const layer1Result = await orchestrator.executeTool("search_files", {
        pattern: "*.ts"
      })
      expect(layer1Result.executionTime).toBeLessThan(50) // Allow some overhead
      
      // Layer 2: 50ms target
      const layer2Result = await orchestrator.executeTool("analyze_complexity", {
        file: "src/index.ts",
        metrics: ["cyclomatic"]
      })
      expect(layer2Result.executionTime).toBeLessThan(200)
      
      // Layer 3: 10ms target
      const layer3Result = await orchestrator.executeTool("find_related_concepts", {
        concept: "test",
        depth: 1
      })
      expect(layer3Result.executionTime).toBeLessThan(100)
    })
  })
  
  describe("Error handling", () => {
    test("should handle non-existent tools gracefully", async () => {
      const result = await orchestrator.executeTool("non_existent_tool", {})
      
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.data.error || result.data.success === false).toBe(true)
    })
    
    test("should handle layer failures gracefully", async () => {
      const result = await orchestrator.executeTool("find_definition", {
        symbol: "NonExistentSymbol123456789"
      })
      
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      // Should still return a result even if symbol not found
    })
    
    test("should handle invalid arguments", async () => {
      const result = await orchestrator.executeTool("analyze_complexity", {
        // Missing required 'file' parameter
        metrics: ["cyclomatic"]
      })
      
      expect(result).toBeDefined()
      expect(result.data.error || result.data.complexity).toBeDefined()
    })
  })
  
  describe("Context extraction", () => {
    test("should extract workspace context", async () => {
      const context = orchestrator.extractContext({
        workspace: "/test/workspace",
        file: "test.ts"
      })
      
      expect(context).toBeDefined()
      expect(context.workspace).toBe("/test/workspace")
      expect(context.file).toBe("test.ts")
    })
    
    test("should identify when deep analysis is required", async () => {
      const context = orchestrator.extractContext({
        symbol: "ComplexClass",
        includeInherited: true,
        depth: 3
      })
      
      expect(context).toBeDefined()
      expect(context.requiresDeepAnalysis).toBe(true)
    })
  })
  
  describe("Prompt generation", () => {
    test("should generate prompts based on ontology state", async () => {
      const prompt = await orchestrator.generatePrompt("refactoring_guide", {
        file: "src/index.ts"
      })
      
      expect(prompt).toBeDefined()
      expect(typeof prompt).toBe("string")
      expect(prompt.length).toBeGreaterThan(0)
    })
  })
})