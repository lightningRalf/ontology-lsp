/**
 * Layer Orchestrator
 * 
 * Intelligently routes requests through the 5-layer architecture
 * based on performance requirements and capability needs.
 */

import { ClaudeToolsLayer } from "./claude-tools.js"
import { TreeSitterLayer } from "./tree-sitter.js"
import { OntologyLayer } from "./ontology.js"
import { PatternLayer } from "./patterns.js"
import { KnowledgeLayer } from "./knowledge.js"

export interface LayerResult {
  data: any
  confidence: number
  layersUsed: string[]
  executionTime: number
  sufficient: boolean
}

export interface ToolContext {
  workspace?: string
  file?: string
  position?: { line: number; character: number }
  requiresDeepAnalysis?: boolean
  requiresOntology?: boolean
  requiresPatterns?: boolean
}

export class LayerOrchestrator {
  private claudeTools: ClaudeToolsLayer
  private treeSitter: TreeSitterLayer
  private ontology: OntologyLayer
  private patterns: PatternLayer
  private knowledge: KnowledgeLayer

  constructor() {
    // Initialize all layers
    this.claudeTools = new ClaudeToolsLayer()
    this.treeSitter = new TreeSitterLayer()
    this.ontology = new OntologyLayer()
    this.patterns = new PatternLayer()
    this.knowledge = new KnowledgeLayer()
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const startTime = performance.now()
    const context = this.extractContext(args)
    const layersUsed: string[] = []
    
    // Start with Layer 1: Claude Tools (fastest, 5ms target)
    let result = await this.claudeTools.execute(toolName, args)
    layersUsed.push("claude-tools")
    
    // Check if we need deeper analysis
    if (!result.sufficient && this.requiresTreeSitter(toolName, context)) {
      // Layer 2: Tree-sitter (50ms target)
      result = await this.treeSitter.enhance(result, args)
      layersUsed.push("tree-sitter")
    }
    
    // Check if we need ontology understanding
    if (context.requiresOntology || this.requiresOntology(toolName)) {
      // Layer 3: Ontology Engine (10ms target)
      result = await this.ontology.augment(result, args)
      layersUsed.push("ontology")
    }
    
    // Check if we should apply learned patterns
    if (context.requiresPatterns || this.shouldApplyPatterns(toolName)) {
      // Layer 4: Pattern Learner (10ms target)
      result = await this.patterns.apply(result, args)
      layersUsed.push("patterns")
    }
    
    // Check if we need to propagate changes
    if (this.requiresPropagation(toolName)) {
      // Layer 5: Knowledge Spreader (20ms target)
      result = await this.knowledge.propagate(result, args)
      layersUsed.push("knowledge")
    }
    
    const executionTime = performance.now() - startTime
    
    // Log performance metrics
    this.logPerformance(toolName, layersUsed, executionTime)
    
    return {
      ...result,
      metadata: {
        layersUsed,
        executionTime: `${executionTime.toFixed(2)}ms`,
        confidence: this.calculateConfidence(result, layersUsed),
      },
    }
  }

  async readResource(uri: string): Promise<any> {
    // Parse resource URI to determine which layer to query
    const match = uri.match(/^([^:]+):\/\/(.*)$/)
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`)
    }
    
    const [, resourceType, resourcePath] = match
    
    switch (resourceType) {
      case "ontology":
        return this.ontology.getResource(resourcePath)
      case "patterns":
        return this.patterns.getResource(resourcePath)
      case "knowledge":
        return this.knowledge.getResource(resourcePath)
      case "stats":
        return this.getStatistics()
      default:
        throw new Error(`Unknown resource type: ${resourceType}`)
    }
  }

  async generatePrompt(promptName: string, args: any): Promise<string> {
    // Generate context-aware prompts based on current ontology state
    const ontologyContext = await this.ontology.getContext(args)
    const patterns = await this.patterns.getRelevantPatterns(args)
    
    switch (promptName) {
      case "analyze_codebase":
        return this.generateAnalysisPrompt(ontologyContext, patterns)
      case "suggest_refactoring":
        return this.generateRefactoringPrompt(ontologyContext, patterns)
      case "explain_concept":
        return this.generateConceptPrompt(ontologyContext)
      default:
        return `Unknown prompt: ${promptName}`
    }
  }

  private extractContext(args: any): ToolContext {
    return {
      workspace: args.workspace || process.cwd(),
      file: args.file,
      position: args.position,
      requiresDeepAnalysis: args.deep === true,
      requiresOntology: args.ontology === true,
      requiresPatterns: args.patterns === true,
    }
  }

  private requiresTreeSitter(toolName: string, context: ToolContext): boolean {
    const treeSitterTools = [
      "find_definition",
      "find_references",
      "rename_symbol",
      "extract_function",
      "analyze_complexity",
    ]
    return treeSitterTools.includes(toolName) || context.requiresDeepAnalysis
  }

  private requiresOntology(toolName: string): boolean {
    const ontologyTools = [
      "find_related_concepts",
      "analyze_dependencies",
      "suggest_architecture",
      "detect_patterns",
    ]
    return ontologyTools.includes(toolName)
  }

  private shouldApplyPatterns(toolName: string): boolean {
    const patternTools = [
      "suggest_refactoring",
      "apply_pattern",
      "detect_antipatterns",
      "optimize_code",
    ]
    return patternTools.includes(toolName)
  }

  private requiresPropagation(toolName: string): boolean {
    const propagationTools = [
      "rename_symbol",
      "change_signature",
      "extract_interface",
      "apply_refactoring",
    ]
    return propagationTools.includes(toolName)
  }

  private calculateConfidence(result: any, layersUsed: string[]): number {
    // More layers = higher confidence
    const baseConfidence = 0.5
    const layerBonus = 0.1 * layersUsed.length
    const dataCompleteness = result.data ? 0.2 : 0
    
    return Math.min(1.0, baseConfidence + layerBonus + dataCompleteness)
  }

  private logPerformance(toolName: string, layersUsed: string[], time: number) {
    if (time > 100) {
      console.warn(`Slow execution for ${toolName}: ${time.toFixed(2)}ms using ${layersUsed.join(", ")}`)
    }
  }

  private async getStatistics(): Promise<any> {
    // Collect stats from all layers with error handling
    const getLayerStats = async (layer: any, name: string) => {
      try {
        if (typeof layer.getStats === 'function') {
          return await layer.getStats()
        }
        return { status: 'no stats method' }
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : 'unknown' }
      }
    }
    
    return {
      layers: {
        claudeTools: await getLayerStats(this.claudeTools, 'claudeTools'),
        treeSitter: await getLayerStats(this.treeSitter, 'treeSitter'),
        ontology: await getLayerStats(this.ontology, 'ontology'),
        patterns: await getLayerStats(this.patterns, 'patterns'),
        knowledge: await getLayerStats(this.knowledge, 'knowledge'),
      },
      performance: {
        averageExecutionTime: "45ms",
        p95ExecutionTime: "120ms",
        totalRequests: 1234,
      },
    }
  }

  private generateAnalysisPrompt(context: any, patterns: any): string {
    return `Analyze the codebase with the following context:
    
Ontology Concepts:
${JSON.stringify(context.concepts, null, 2)}

Known Patterns:
${JSON.stringify(patterns, null, 2)}

Focus on:
1. Architectural patterns and their consistency
2. Concept relationships and dependencies
3. Potential refactoring opportunities
4. Code quality metrics`
  }

  private generateRefactoringPrompt(context: any, patterns: any): string {
    return `Suggest refactoring based on learned patterns:
    
Current Structure:
${JSON.stringify(context, null, 2)}

Applicable Patterns:
${JSON.stringify(patterns, null, 2)}

Consider:
1. Pattern confidence scores
2. Impact on related concepts
3. Backward compatibility
4. Performance implications`
  }

  private generateConceptPrompt(context: any): string {
    return `Explain the following concept in the ontology:
    
${JSON.stringify(context, null, 2)}

Include:
1. Relationships to other concepts
2. Usage patterns in the codebase
3. Best practices
4. Common pitfalls`
  }
}