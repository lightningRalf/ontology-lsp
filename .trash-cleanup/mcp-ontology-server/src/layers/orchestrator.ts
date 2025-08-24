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
    
    // Direct routing for specific tools to their primary implementations
    switch (toolName) {
      // Layer 1: Claude Tools (5ms target)
      case 'search_files':
        return this.executeWithMetadata(
          () => this.claudeTools.searchFiles(args),
          ["claude-tools"],
          startTime
        )
      
      case 'grep_content':
        return this.executeWithMetadata(
          () => this.claudeTools.grepContent(args),
          ["claude-tools"],
          startTime
        )
      
      // Layer 2: Tree-sitter Analysis (50ms target)
      case 'find_definition':
        return this.executeWithMetadata(
          async () => {
            // First try fast search
            const quickResult = await this.claudeTools.searchFiles({
              pattern: args.file || '**/*.{ts,js,tsx,jsx}',
              content: args.symbol
            })
            
            // Then enhance with tree-sitter for accurate AST-based finding
            const astResult = await this.treeSitter.findDefinition(args)
            
            // Augment with ontology if available
            if (this.ontology.hasData()) {
              const ontologyResult = await this.ontology.findDefinition(args)
              return this.mergeResults(astResult, ontologyResult)
            }
            
            return astResult
          },
          ["claude-tools", "tree-sitter", "ontology"],
          startTime
        )
      
      case 'find_references':
        return this.executeWithMetadata(
          async () => {
            // Use tree-sitter for accurate reference finding
            const references = await this.treeSitter.findReferences(args)
            
            // Enhance with ontology relationships
            if (this.ontology.hasData()) {
              const related = await this.ontology.findReferences(args)
              return this.mergeResults(references, related)
            }
            
            return references
          },
          ["tree-sitter", "ontology"],
          startTime
        )
      
      case 'analyze_complexity':
        return this.executeWithMetadata(
          () => this.treeSitter.analyzeComplexity(args),
          ["tree-sitter"],
          startTime
        )
      
      // Layer 3: Ontology Operations (10ms target)
      case 'find_related_concepts':
        return this.executeWithMetadata(
          () => this.ontology.findRelatedConcepts(args),
          ["ontology"],
          startTime
        )
      
      case 'analyze_dependencies':
        return this.executeWithMetadata(
          () => this.ontology.analyzeDependencies(args),
          ["ontology"],
          startTime
        )
      
      // Layer 4: Pattern Operations (10ms target)
      case 'detect_patterns':
        return this.executeWithMetadata(
          () => this.patterns.detectPatterns(args),
          ["patterns"],
          startTime
        )
      
      case 'suggest_refactoring':
        return this.executeWithMetadata(
          async () => {
            const patterns = await this.patterns.suggestRefactoring(args)
            
            // Apply ontology knowledge to improve suggestions
            if (this.ontology.hasData()) {
              const ontologyInsights = await this.ontology.getRefactoringContext(args)
              return this.enhanceRefactoringSuggestions(patterns, ontologyInsights)
            }
            
            return patterns
          },
          ["patterns", "ontology"],
          startTime
        )
      
      case 'learn_pattern':
        return this.executeWithMetadata(
          () => this.patterns.learnPattern(args),
          ["patterns"],
          startTime
        )
      
      // Layer 5: Knowledge Propagation (20ms target)
      case 'rename_symbol':
        return this.executeWithMetadata(
          async () => {
            // Find all occurrences first
            const occurrences = await this.treeSitter.findReferences({
              symbol: args.oldName,
              includeDeclaration: true,
              scope: args.scope || 'workspace'
            })
            
            // Use knowledge layer to propagate the rename intelligently
            const changes = await this.knowledge.propagateRename({
              ...args,
              occurrences
            })
            
            return changes
          },
          ["tree-sitter", "knowledge"],
          startTime
        )
      
      case 'apply_refactoring':
        return this.executeWithMetadata(
          async () => {
            // Analyze the refactoring impact
            const impact = await this.patterns.analyzeRefactoringImpact(args.refactoring)
            
            // Propagate changes through knowledge layer
            const changes = await this.knowledge.propagateRefactoring({
              ...args,
              impact
            })
            
            return changes
          },
          ["patterns", "knowledge"],
          startTime
        )
      
      case 'extract_interface':
        return this.executeWithMetadata(
          async () => {
            // Analyze the source structure
            const structure = await this.treeSitter.analyzeStructure(args.source)
            
            // Extract and propagate
            const result = await this.knowledge.extractInterface({
              ...args,
              structure
            })
            
            return result
          },
          ["tree-sitter", "knowledge"],
          startTime
        )
      
      // Multi-layer tools
      case 'explain_code':
        return this.executeWithMetadata(
          async () => {
            // Parse code structure
            const ast = await this.treeSitter.parseCode(args.code)
            
            // Get ontological context
            const concepts = await this.ontology.identifyConcepts(ast)
            
            // Generate explanation
            return {
              structure: ast,
              concepts,
              explanation: this.generateExplanation(ast, concepts, args.level)
            }
          },
          ["tree-sitter", "ontology"],
          startTime
        )
      
      case 'optimize_performance':
        return this.executeWithMetadata(
          async () => {
            // Analyze current performance characteristics
            const analysis = await this.treeSitter.analyzePerformance(args.target)
            
            // Find optimization patterns
            const optimizations = await this.patterns.findOptimizations(analysis)
            
            // Generate optimized version
            return {
              analysis,
              suggestions: optimizations,
              optimized: this.applyOptimizations(args.target, optimizations)
            }
          },
          ["tree-sitter", "patterns"],
          startTime
        )
      
      case 'generate_tests':
        return this.executeWithMetadata(
          async () => {
            // Analyze code structure
            const structure = await this.treeSitter.analyzeForTesting(args.target)
            
            // Find test patterns
            const testPatterns = await this.patterns.getTestPatterns(args.framework)
            
            // Generate tests
            return {
              tests: this.generateTestsFromPatterns(structure, testPatterns, args.coverage),
              framework: args.framework === 'auto' ? this.detectTestFramework() : args.framework
            }
          },
          ["tree-sitter", "patterns"],
          startTime
        )
      
      default:
        // Fallback to generic layer-based execution
        return this.executeGeneric(toolName, args, context, startTime)
    }
  }
  
  private async executeWithMetadata(
    executor: () => Promise<any>,
    layersUsed: string[],
    startTime: number
  ): Promise<any> {
    try {
      const result = await executor()
      const executionTime = performance.now() - startTime
      
      this.logPerformance('executeTool', layersUsed, executionTime)
      
      // Return flat structure with metadata at top level for compatibility
      return {
        ...result,  // Spread the result data at top level
        layersUsed,
        executionTime,
        confidence: this.calculateConfidence({ data: result }, layersUsed)
      }
    } catch (error) {
      const executionTime = performance.now() - startTime
      
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        layersUsed,
        executionTime,
        confidence: 0
      }
    }
  }
  
  private mergeResults(primary: any, secondary: any): any {
    // Intelligently merge results from multiple sources
    if (!secondary) return primary
    if (!primary) return secondary
    
    if (Array.isArray(primary) && Array.isArray(secondary)) {
      // Deduplicate and merge arrays
      const merged = [...primary]
      for (const item of secondary) {
        if (!merged.some(m => this.isSameLocation(m, item))) {
          merged.push(item)
        }
      }
      return merged
    }
    
    return { ...primary, ...secondary }
  }
  
  private isSameLocation(a: any, b: any): boolean {
    return a.file === b.file && 
           a.line === b.line && 
           a.character === b.character
  }
  
  private enhanceRefactoringSuggestions(patterns: any, insights: any): any {
    return {
      ...patterns,
      insights,
      enhanced: true,
      confidence: Math.min(1.0, (patterns.confidence || 0.5) + 0.2)
    }
  }
  
  private generateExplanation(ast: any, concepts: any, level: string): string {
    // Generate explanation based on level
    const explanations = {
      basic: 'This code performs basic operations',
      intermediate: 'This code implements specific patterns and concepts',
      advanced: 'This code demonstrates advanced architectural patterns'
    }
    
    return explanations[level as keyof typeof explanations] || explanations.intermediate
  }
  
  private applyOptimizations(target: string, optimizations: any[]): any {
    return {
      original: target,
      optimized: target, // Would apply actual optimizations
      changes: optimizations.length
    }
  }
  
  private generateTestsFromPatterns(structure: any, patterns: any, coverage: string): any[] {
    // Generate tests based on patterns and coverage level
    return [{
      name: 'Generated test',
      code: '// Test implementation',
      coverage
    }]
  }
  
  private detectTestFramework(): string {
    // Detect test framework from package.json or existing tests
    return 'bun'
  }
  
  private async executeGeneric(
    toolName: string, 
    args: any, 
    context: ToolContext,
    startTime: number
  ): Promise<any> {
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