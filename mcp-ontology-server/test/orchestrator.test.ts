/**
 * Test suite for the Layer Orchestrator
 */

import { describe, expect, test } from "bun:test"
import { LayerOrchestrator } from "../src/layers/orchestrator"

describe("LayerOrchestrator", () => {
  test("should initialize all layers", () => {
    const orchestrator = new LayerOrchestrator()
    expect(orchestrator).toBeDefined()
  })

  test("should execute search_files tool", async () => {
    const orchestrator = new LayerOrchestrator()
    
    const result = await orchestrator.executeTool("search_files", {
      pattern: "*.ts",
      workspace: ".",
    })
    
    expect(result).toBeDefined()
    expect(result.metadata).toBeDefined()
    expect(result.metadata.layersUsed).toContain("claude-tools")
  })

  test("should handle unknown tools gracefully", async () => {
    const orchestrator = new LayerOrchestrator()
    
    const result = await orchestrator.executeTool("unknown_tool", {})
    
    expect(result).toBeDefined()
    expect(result.data).toBeNull()
  })

  test("should generate prompts", async () => {
    const orchestrator = new LayerOrchestrator()
    
    const prompt = await orchestrator.generatePrompt("analyze_codebase", {})
    
    expect(prompt).toBeDefined()
    expect(typeof prompt).toBe("string")
    expect(prompt).toContain("Analyze the codebase")
  })

  test("should read resources", async () => {
    const orchestrator = new LayerOrchestrator()
    
    const stats = await orchestrator.readResource("stats://performance")
    
    expect(stats).toBeDefined()
    expect(stats.layers).toBeDefined()
    expect(stats.performance).toBeDefined()
  })
})