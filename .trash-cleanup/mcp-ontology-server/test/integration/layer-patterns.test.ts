import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { PatternLayer } from "../../src/layers/patterns.js"
import { existsSync, rmSync } from "fs"

describe("PatternLayer Integration Tests", () => {
  let layer: PatternLayer
  const testDbPath = ".ontology/test-patterns.db"
  
  beforeAll(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }
    layer = new PatternLayer()
  })
  
  afterAll(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }
  })
  
  describe("detectPatterns", () => {
    test("should detect singleton pattern", async () => {
      const result = await layer.detectPatterns({
        scope: "src/layers",
        patterns: ["singleton"],
        minConfidence: 0.5
      })
      
      expect(result).toBeDefined()
      expect(result.patterns).toBeInstanceOf(Array)
    })
    
    test("should detect factory pattern", async () => {
      const result = await layer.detectPatterns({
        scope: "src",
        patterns: ["factory"],
        minConfidence: 0.3
      })
      
      expect(result).toBeDefined()
      expect(result.patterns).toBeInstanceOf(Array)
    })
    
    test("should respect confidence threshold", async () => {
      const lowConfidence = await layer.detectPatterns({
        scope: "src",
        patterns: ["singleton", "factory"],
        minConfidence: 0.3
      })
      
      const highConfidence = await layer.detectPatterns({
        scope: "src",
        patterns: ["singleton", "factory"],
        minConfidence: 0.9
      })
      
      expect(lowConfidence).toBeDefined()
      expect(highConfidence).toBeDefined()
      // Low confidence should find more patterns
      expect(lowConfidence.patterns.length).toBeGreaterThanOrEqual(
        highConfidence.patterns.length
      )
    })
    
    test("should detect anti-patterns", async () => {
      const result = await layer.detectPatterns({
        scope: "src",
        patterns: ["antipatterns"],
        minConfidence: 0.5
      })
      
      expect(result).toBeDefined()
      expect(result.patterns).toBeInstanceOf(Array)
    })
  })
  
  describe("suggestRefactoring", () => {
    test("should suggest extract refactoring", async () => {
      const result = await layer.suggestRefactoring({
        file: "src/layers/orchestrator.ts",
        types: ["extract"],
        autoApply: false
      })
      
      expect(result).toBeDefined()
      expect(result.suggestions).toBeInstanceOf(Array)
      
      const extractSuggestions = result.suggestions.filter(
        s => s.type === "extract"
      )
      expect(extractSuggestions.length).toBeGreaterThan(0)
    })
    
    test("should suggest simplification", async () => {
      const result = await layer.suggestRefactoring({
        file: "src/index.ts",
        types: ["simplify"],
        autoApply: false
      })
      
      expect(result).toBeDefined()
      expect(result.suggestions).toBeInstanceOf(Array)
    })
    
    test("should generate applicable patches when requested", async () => {
      const result = await layer.suggestRefactoring({
        file: "src/layers/patterns.ts",
        types: ["rename"],
        autoApply: true
      })
      
      expect(result).toBeDefined()
      if (result.suggestions.length > 0) {
        expect(result.patches).toBeDefined()
      }
    })
  })
  
  describe("learnPattern", () => {
    test("should learn a simple pattern", async () => {
      const result = await layer.learnPattern({
        before: "if (x != null) { return x; } else { return default; }",
        after: "return x ?? default;",
        name: "nullish-coalescing-refactor",
        description: "Replace null check with nullish coalescing"
      })
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.patternId).toBeDefined()
    })
    
    test("should learn complex patterns", async () => {
      const result = await layer.learnPattern({
        before: `
          const result = [];
          for (let i = 0; i < items.length; i++) {
            result.push(transform(items[i]));
          }
          return result;
        `,
        after: "return items.map(transform);",
        name: "for-to-map",
        description: "Convert for loop to map"
      })
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
    
    test("should increase confidence with repeated patterns", async () => {
      // Learn the same pattern multiple times
      const pattern1 = await layer.learnPattern({
        before: "x == null",
        after: "x === null || x === undefined",
        name: "explicit-null-check",
        description: "Make null checks explicit"
      })
      
      const pattern2 = await layer.learnPattern({
        before: "y == null",
        after: "y === null || y === undefined",
        name: "explicit-null-check",
        description: "Make null checks explicit"
      })
      
      expect(pattern1).toBeDefined()
      expect(pattern2).toBeDefined()
      expect(pattern2.confidence).toBeGreaterThan(pattern1.confidence || 0)
    })
  })
  
  describe("analyzeRefactoringImpact", () => {
    test("should analyze impact of extract refactoring", async () => {
      const impact = await layer.analyzeRefactoringImpact({
        type: "extract",
        target: "executeTool",
        parameters: {
          newName: "executeToolWithContext"
        }
      })
      
      expect(impact).toBeDefined()
      expect(impact.affectedFiles).toBeInstanceOf(Array)
      expect(impact.risk).toBeDefined()
    })
    
    test("should analyze impact of rename refactoring", async () => {
      const impact = await layer.analyzeRefactoringImpact({
        type: "rename",
        target: "LayerOrchestrator",
        parameters: {
          newName: "MCPLayerOrchestrator"
        }
      })
      
      expect(impact).toBeDefined()
      expect(impact.affectedFiles).toBeInstanceOf(Array)
      expect(impact.occurrences).toBeGreaterThan(0)
    })
  })
  
  describe("Pattern matching", () => {
    test("should match learned patterns in new code", async () => {
      // Learn a pattern
      await layer.learnPattern({
        before: "arr.length === 0",
        after: "!arr.length",
        name: "empty-array-check",
        description: "Simplify empty array check"
      })
      
      // Find matches
      const matches = await layer.findPatternMatches({
        code: "if (myArray.length === 0) { return null; }",
        patternName: "empty-array-check"
      })
      
      expect(matches).toBeDefined()
      expect(matches.matches).toBeInstanceOf(Array)
      expect(matches.matches.length).toBeGreaterThan(0)
    })
  })
})