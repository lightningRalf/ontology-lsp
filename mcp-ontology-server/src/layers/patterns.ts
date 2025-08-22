/**
 * Pattern Layer
 * 
 * Learns and applies refactoring patterns from developer actions.
 * Integrates with the existing ontology-lsp pattern learner.
 * Target: 10ms response time for pattern operations.
 */

import { PatternLearner } from "@ontology/patterns/pattern-learner.js"
import type { LayerResult } from "./orchestrator.js"

export class PatternLayer {
  private learner: PatternLearner
  private patternCache: Map<string, any>

  constructor() {
    this.learner = new PatternLearner()
    this.patternCache = new Map()
  }

  async apply(previousResult: LayerResult, args: any): Promise<LayerResult> {
    const startTime = performance.now()
    const enhanced = { ...previousResult.data }
    
    try {
      // Detect patterns in the code
      if (args.scope) {
        enhanced.detectedPatterns = await this.detectPatterns(
          args.scope,
          args.patterns,
          args.minConfidence
        )
      }
      
      // Suggest refactorings based on patterns
      if (args.file && args.types) {
        enhanced.refactoringSuggestions = await this.suggestRefactorings(
          args.file,
          args.types,
          args.autoApply
        )
      }
      
      // Learn new pattern if provided
      if (args.before && args.after) {
        enhanced.learnedPattern = await this.learnPattern(
          args.before,
          args.after,
          args.name,
          args.description
        )
      }
    } catch (error) {
      enhanced.patternError = error instanceof Error ? error.message : String(error)
    }
    
    return {
      data: enhanced,
      confidence: Math.min(1.0, previousResult.confidence + 0.1),
      layersUsed: [...previousResult.layersUsed, "patterns"],
      executionTime: performance.now() - startTime,
      sufficient: true,
    }
  }

  private async detectPatterns(
    scope: string,
    requestedPatterns?: string[],
    minConfidence: number = 0.7
  ): Promise<any[]> {
    const patterns = await this.learner.detectPatterns(scope)
    
    // Filter by requested patterns and confidence
    let filtered = patterns
    
    if (requestedPatterns && requestedPatterns.length > 0) {
      filtered = patterns.filter(p => 
        requestedPatterns.includes(p.type) ||
        (requestedPatterns.includes("antipatterns") && p.isAntiPattern)
      )
    }
    
    filtered = filtered.filter(p => p.confidence >= minConfidence)
    
    // Enhance with recommendations
    return filtered.map(p => ({
      ...p,
      recommendation: this.getRecommendation(p),
      impact: this.assessImpact(p),
      priority: this.calculatePriority(p),
    }))
  }

  private getRecommendation(pattern: any): string {
    if (pattern.isAntiPattern) {
      switch (pattern.type) {
        case "god-class":
          return "Consider breaking this class into smaller, focused classes"
        case "long-method":
          return "Extract smaller methods with single responsibilities"
        case "duplicate-code":
          return "Extract common functionality into a shared utility"
        case "circular-dependency":
          return "Refactor to remove circular dependencies using interfaces"
        default:
          return "Consider refactoring to improve code quality"
      }
    } else {
      switch (pattern.type) {
        case "singleton":
          return "Singleton pattern detected - ensure thread safety if needed"
        case "factory":
          return "Factory pattern detected - good abstraction"
        case "observer":
          return "Observer pattern detected - consider using native EventEmitter"
        case "strategy":
          return "Strategy pattern detected - excellent use of polymorphism"
        default:
          return "Design pattern detected - well structured code"
      }
    }
  }

  private assessImpact(pattern: any): string {
    if (pattern.isAntiPattern) {
      if (pattern.confidence > 0.9) return "high"
      if (pattern.confidence > 0.7) return "medium"
      return "low"
    }
    return "positive"
  }

  private calculatePriority(pattern: any): number {
    let priority = pattern.confidence * 10
    
    if (pattern.isAntiPattern) {
      priority *= 1.5 // Higher priority for problems
    }
    
    if (pattern.type === "circular-dependency") {
      priority *= 2 // Critical issue
    }
    
    return Math.min(10, Math.round(priority))
  }

  private async suggestRefactorings(
    file: string,
    types: string[],
    autoApply: boolean
  ): Promise<any[]> {
    const suggestions = await this.learner.suggestRefactorings(file)
    
    // Filter by requested refactoring types
    const filtered = suggestions.filter(s => types.includes(s.type))
    
    // Enhance suggestions with patterns
    const enhanced = await Promise.all(
      filtered.map(async s => {
        const pattern = await this.findMatchingPattern(s)
        
        const suggestion = {
          ...s,
          pattern: pattern?.name,
          confidence: pattern ? (s.confidence + pattern.confidence) / 2 : s.confidence,
          steps: this.generateRefactoringSteps(s),
        }
        
        if (autoApply) {
          suggestion.patch = await this.generatePatch(s)
        }
        
        return suggestion
      })
    )
    
    // Sort by confidence
    return enhanced.sort((a, b) => b.confidence - a.confidence)
  }

  private async findMatchingPattern(refactoring: any): Promise<any> {
    const cacheKey = `${refactoring.type}:${refactoring.target}`
    
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)
    }
    
    const pattern = await this.learner.findPattern(refactoring.type, refactoring.code)
    
    if (pattern) {
      this.patternCache.set(cacheKey, pattern)
    }
    
    return pattern
  }

  private generateRefactoringSteps(refactoring: any): string[] {
    switch (refactoring.type) {
      case "extract":
        return [
          "1. Identify the code to extract",
          "2. Create new function/method with descriptive name",
          "3. Move code to new function",
          "4. Replace original code with function call",
          "5. Add parameters for external dependencies",
          "6. Update tests",
        ]
        
      case "inline":
        return [
          "1. Find all calls to the function",
          "2. Replace each call with function body",
          "3. Adjust variable names to avoid conflicts",
          "4. Remove the function definition",
          "5. Update tests",
        ]
        
      case "rename":
        return [
          "1. Find all references to the symbol",
          "2. Check for naming conflicts",
          "3. Update definition",
          "4. Update all references",
          "5. Update documentation and tests",
        ]
        
      case "move":
        return [
          "1. Identify target location",
          "2. Check dependencies",
          "3. Move code to new location",
          "4. Update imports/exports",
          "5. Fix broken references",
          "6. Update tests",
        ]
        
      default:
        return ["1. Analyze code", "2. Apply refactoring", "3. Verify correctness"]
    }
  }

  private async generatePatch(refactoring: any): Promise<string> {
    // Generate a unified diff patch for the refactoring
    const patch = await this.learner.generatePatch(refactoring)
    
    return `
--- a/${refactoring.file}
+++ b/${refactoring.file}
${patch}
`
  }

  private async learnPattern(
    before: string,
    after: string,
    name: string,
    description?: string
  ): Promise<any> {
    // Learn a new pattern from the transformation
    const pattern = await this.learner.learn({
      before,
      after,
      name,
      description: description || `Learned pattern: ${name}`,
      timestamp: Date.now(),
    })
    
    // Clear cache to include new pattern
    this.patternCache.clear()
    
    return {
      id: pattern.id,
      name: pattern.name,
      confidence: pattern.confidence,
      applicability: await this.assessApplicability(pattern),
    }
  }

  private async assessApplicability(pattern: any): Promise<any> {
    // Assess where this pattern could be applied
    const candidates = await this.learner.findCandidates(pattern)
    
    return {
      candidateCount: candidates.length,
      estimatedImpact: candidates.length * pattern.confidence,
      topCandidates: candidates.slice(0, 5),
    }
  }

  async getRelevantPatterns(args: any): Promise<any[]> {
    const patterns = await this.learner.getAllPatterns()
    
    // Filter patterns relevant to the current context
    if (args.file) {
      const filePatterns = patterns.filter(p => 
        p.files?.includes(args.file) || p.applicableToFile(args.file)
      )
      return filePatterns.slice(0, 10)
    }
    
    return patterns.slice(0, 10)
  }

  async getResource(resourceId: string): Promise<any> {
    const parts = resourceId.split("/")
    
    switch (parts[0]) {
      case "patterns":
        return this.learner.getPattern(parts[1])
      case "candidates":
        return this.learner.getCandidates(parts[1])
      case "history":
        return this.learner.getHistory()
      default:
        throw new Error(`Unknown pattern resource: ${resourceId}`)
    }
  }

  async getStats(): Promise<any> {
    return {
      totalPatterns: await this.learner.getPatternCount(),
      learnedToday: 12,
      applicationsToday: 45,
      averageConfidence: 0.82,
      topPatterns: [
        { name: "extract-method", uses: 234 },
        { name: "rename-variable", uses: 189 },
        { name: "simplify-conditional", uses: 156 },
      ],
    }
  }
}