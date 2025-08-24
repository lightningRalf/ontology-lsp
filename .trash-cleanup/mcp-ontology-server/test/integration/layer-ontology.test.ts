import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { OntologyLayer } from "../../src/layers/ontology.js"
import { existsSync, rmSync } from "fs"

describe("OntologyLayer Integration Tests", () => {
  let layer: OntologyLayer
  const testDbPath = ".ontology/test-ontology.db"
  
  beforeAll(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }
    layer = new OntologyLayer()
  })
  
  afterAll(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }
  })
  
  describe("findRelatedConcepts", () => {
    test("should find concepts related to a symbol", async () => {
      const result = await layer.findRelatedConcepts({
        concept: "Server",
        relationTypes: ["uses", "usedBy"],
        depth: 1
      })
      
      expect(result).toBeDefined()
      expect(result.concepts).toBeInstanceOf(Array)
    })
    
    test("should respect depth parameter", async () => {
      const depth1 = await layer.findRelatedConcepts({
        concept: "Layer",
        depth: 1
      })
      
      const depth2 = await layer.findRelatedConcepts({
        concept: "Layer",
        depth: 2
      })
      
      expect(depth1).toBeDefined()
      expect(depth2).toBeDefined()
      // Depth 2 should potentially find more concepts
    })
    
    test("should filter by relation types", async () => {
      const usesOnly = await layer.findRelatedConcepts({
        concept: "OntologyLayer",
        relationTypes: ["uses"]
      })
      
      const all = await layer.findRelatedConcepts({
        concept: "OntologyLayer",
        relationTypes: ["uses", "usedBy", "extends", "implements"]
      })
      
      expect(usesOnly).toBeDefined()
      expect(all).toBeDefined()
    })
  })
  
  describe("analyzeDependencies", () => {
    test("should analyze file dependencies", async () => {
      const result = await layer.analyzeDependencies({
        target: "src/index.ts",
        detectCycles: true
      })
      
      expect(result).toBeDefined()
      expect(result.dependencies).toBeDefined()
      expect(result.dependencies.direct).toBeInstanceOf(Array)
    })
    
    test("should detect circular dependencies", async () => {
      const result = await layer.analyzeDependencies({
        target: "src/layers/orchestrator.ts",
        detectCycles: true,
        includeTransitive: true
      })
      
      expect(result).toBeDefined()
      expect(result.dependencies).toBeDefined()
      expect(result.dependencies.cycles).toBeInstanceOf(Array)
    })
    
    test("should include transitive dependencies when requested", async () => {
      const withoutTransitive = await layer.analyzeDependencies({
        target: "src/index.ts",
        includeTransitive: false
      })
      
      const withTransitive = await layer.analyzeDependencies({
        target: "src/index.ts",
        includeTransitive: true
      })
      
      expect(withoutTransitive).toBeDefined()
      expect(withTransitive).toBeDefined()
      expect(withTransitive.dependencies.transitive).toBeDefined()
    })
  })
  
  describe("Concept storage", () => {
    test("should store and retrieve concepts", async () => {
      // Add a concept
      const stored = await layer.storeConcept({
        name: "TestConcept",
        type: "class",
        file: "test.ts",
        line: 10
      })
      
      expect(stored).toBeDefined()
      expect(stored.success).toBe(true)
      
      // Find the concept
      const found = await layer.findConcept("TestConcept")
      
      expect(found).toBeDefined()
      expect(found.name).toBe("TestConcept")
    })
    
    test("should store relationships between concepts", async () => {
      // Add two concepts
      await layer.storeConcept({
        name: "ParentConcept",
        type: "class"
      })
      
      await layer.storeConcept({
        name: "ChildConcept",
        type: "class"
      })
      
      // Add relationship
      const relationship = await layer.addRelationship({
        from: "ParentConcept",
        to: "ChildConcept",
        type: "extends"
      })
      
      expect(relationship).toBeDefined()
      expect(relationship.success).toBe(true)
      
      // Query relationship
      const related = await layer.findRelatedConcepts({
        concept: "ParentConcept",
        relationTypes: ["extends"]
      })
      
      expect(related.concepts).toContainEqual(
        expect.objectContaining({ name: "ChildConcept" })
      )
    })
  })
  
  describe("Refactoring context", () => {
    test("should provide refactoring context", async () => {
      const context = await layer.getRefactoringContext({
        file: "src/index.ts",
        symbol: "OntologyMCPServer"
      })
      
      expect(context).toBeDefined()
      expect(context.relatedConcepts).toBeInstanceOf(Array)
      expect(context.dependencies).toBeDefined()
    })
  })
})