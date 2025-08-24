import { describe, expect, test, beforeAll } from "bun:test"
import { KnowledgeLayer } from "../../src/layers/knowledge.js"

describe("KnowledgeLayer Integration Tests", () => {
  let layer: KnowledgeLayer
  
  beforeAll(() => {
    layer = new KnowledgeLayer()
  })
  
  describe("propagateRename", () => {
    test("should propagate simple renames", async () => {
      const result = await layer.propagateRename({
        oldName: "testFunction",
        newName: "renamedTestFunction",
        occurrences: [
          { file: "src/test.ts", line: 10, character: 5 },
          { file: "src/test.ts", line: 20, character: 10 },
          { file: "src/other.ts", line: 15, character: 8 }
        ],
        preview: true
      })
      
      expect(result).toBeDefined()
      expect(result.changes).toBeInstanceOf(Array)
      expect(result.changes.length).toBe(3)
    })
    
    test("should handle related symbol renames", async () => {
      const result = await layer.propagateRename({
        oldName: "getUserData",
        newName: "fetchUserProfile",
        scope: "related",
        occurrences: [
          { file: "src/api.ts", line: 10 }
        ],
        preview: true
      })
      
      expect(result).toBeDefined()
      expect(result.changes).toBeInstanceOf(Array)
      expect(result.relatedChanges).toBeInstanceOf(Array)
      // Should suggest renaming getUserDataAsync, getUserDataFromCache, etc.
    })
    
    test("should respect scope parameter", async () => {
      const exactScope = await layer.propagateRename({
        oldName: "config",
        newName: "configuration",
        scope: "exact",
        occurrences: [],
        preview: true
      })
      
      const similarScope = await layer.propagateRename({
        oldName: "config",
        newName: "configuration",
        scope: "similar",
        occurrences: [],
        preview: true
      })
      
      expect(exactScope).toBeDefined()
      expect(similarScope).toBeDefined()
      // Similar scope should find more potential renames
      expect(similarScope.relatedChanges?.length || 0).toBeGreaterThanOrEqual(
        exactScope.relatedChanges?.length || 0
      )
    })
  })
  
  describe("propagateRefactoring", () => {
    test("should propagate extract refactoring", async () => {
      const result = await layer.propagateRefactoring({
        refactoring: {
          type: "extract",
          target: "validateInput",
          parameters: {
            newName: "validateAndSanitizeInput",
            scope: "function"
          }
        },
        impact: {
          affectedFiles: ["src/validator.ts", "src/api.ts"],
          occurrences: 5,
          risk: "low"
        },
        propagate: true
      })
      
      expect(result).toBeDefined()
      expect(result.changes).toBeInstanceOf(Array)
      expect(result.propagatedTo).toBeInstanceOf(Array)
    })
    
    test("should propagate inline refactoring", async () => {
      const result = await layer.propagateRefactoring({
        refactoring: {
          type: "inline",
          target: "CONSTANTS.MAX_RETRIES",
          parameters: {}
        },
        impact: {
          affectedFiles: ["src/config.ts"],
          occurrences: 3,
          risk: "medium"
        },
        propagate: true
      })
      
      expect(result).toBeDefined()
      expect(result.changes).toBeInstanceOf(Array)
    })
    
    test("should handle move refactoring", async () => {
      const result = await layer.propagateRefactoring({
        refactoring: {
          type: "move",
          target: "utils/helpers.ts",
          parameters: {
            destination: "lib/utilities/helpers.ts"
          }
        },
        impact: {
          affectedFiles: ["src/index.ts", "src/api.ts", "tests/helpers.test.ts"],
          occurrences: 10,
          risk: "high"
        },
        propagate: true
      })
      
      expect(result).toBeDefined()
      expect(result.changes).toBeInstanceOf(Array)
      expect(result.importUpdates).toBeInstanceOf(Array)
    })
  })
  
  describe("extractInterface", () => {
    test("should extract interface from class", async () => {
      const result = await layer.extractInterface({
        source: "DatabaseConnection",
        name: "IDatabaseConnection",
        members: ["connect", "disconnect", "query"],
        updateImplementations: false
      })
      
      expect(result).toBeDefined()
      expect(result.interface).toBeDefined()
      expect(result.interface.name).toBe("IDatabaseConnection")
      expect(result.interface.members).toBeInstanceOf(Array)
    })
    
    test("should update implementations when requested", async () => {
      const result = await layer.extractInterface({
        source: "BaseService",
        name: "IService",
        updateImplementations: true
      })
      
      expect(result).toBeDefined()
      expect(result.interface).toBeDefined()
      expect(result.updatedImplementations).toBeInstanceOf(Array)
    })
    
    test("should handle selective member extraction", async () => {
      const result = await layer.extractInterface({
        source: "ComplexClass",
        name: "ISimpleInterface",
        members: ["publicMethod1", "publicMethod2"],
        updateImplementations: false
      })
      
      expect(result).toBeDefined()
      expect(result.interface.members.length).toBe(2)
    })
  })
  
  describe("Architectural rules", () => {
    test("should apply layer separation rules", async () => {
      const result = await layer.checkArchitecturalRules({
        change: {
          type: "import",
          from: "src/layers/patterns.ts",
          to: "src/layers/claude-tools.ts"
        }
      })
      
      expect(result).toBeDefined()
      expect(result.allowed).toBeDefined()
      if (!result.allowed) {
        expect(result.reason).toBeDefined()
      }
    })
    
    test("should enforce dependency direction", async () => {
      const result = await layer.checkArchitecturalRules({
        change: {
          type: "import",
          from: "src/index.ts",
          to: "src/layers/orchestrator.ts"
        }
      })
      
      expect(result).toBeDefined()
      expect(result.allowed).toBe(true)
    })
  })
  
  describe("Change impact analysis", () => {
    test("should analyze cascading changes", async () => {
      const impact = await layer.analyzeChangeImpact({
        file: "src/layers/orchestrator.ts",
        change: {
          type: "signature",
          function: "executeTool",
          newSignature: "async executeTool(name: string, args: any, context: Context)"
        }
      })
      
      expect(impact).toBeDefined()
      expect(impact.directImpact).toBeInstanceOf(Array)
      expect(impact.indirectImpact).toBeInstanceOf(Array)
      expect(impact.breakingChanges).toBeDefined()
    })
    
    test("should identify breaking changes", async () => {
      const impact = await layer.analyzeChangeImpact({
        file: "src/index.ts",
        change: {
          type: "removal",
          element: "OntologyMCPServer"
        }
      })
      
      expect(impact).toBeDefined()
      expect(impact.breakingChanges).toBe(true)
      expect(impact.affectedConsumers).toBeInstanceOf(Array)
    })
  })
})