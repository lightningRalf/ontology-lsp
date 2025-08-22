/**
 * Tree-Sitter Layer
 * 
 * AST-based semantic code analysis using the shared BaseTreeSitterService.
 * Integrates with the existing ontology-lsp tree-sitter implementation.
 * Target: 50ms response time for AST operations.
 * 
 * Third-order effect: This layer can now share AST cache with other layers,
 * reducing memory usage and improving performance across the system.
 */

import type { LayerResult } from "./orchestrator.js"
import { getSharedLSPClient, type LSPClient } from "../utils/lsp-client.js"
import { 
  getSharedTreeSitterService, 
  type BaseTreeSitterService,
  type ParsedAST,
  type ASTNode 
} from "../services/base-tree-sitter.js"

export class TreeSitterLayer {
  private lspClient: LSPClient
  private baseLayer: BaseTreeSitterService
  private performanceMetrics: Map<string, number[]>

  constructor() {
    // Connect to actual LSP server via /find endpoint with semantic search
    this.lspClient = getSharedLSPClient()
    
    // Use shared tree-sitter service (fourth-order effect: enables future plugin architecture)
    this.baseLayer = getSharedTreeSitterService()
    
    // Track performance for optimization
    this.performanceMetrics = new Map()
  }

  async enhance(previousResult: LayerResult, args: any): Promise<LayerResult> {
    const startTime = performance.now()
    
    // Enhance the previous result with AST analysis
    const enhanced = { ...previousResult.data }
    
    try {
      // Parse the file to get AST
      if (args.file) {
        const ast = await this.baseLayer.parseFile(args.file)
        
        // Enhance based on the tool being used
        if (args.toolName === "find_definition") {
          enhanced.astDefinition = await this.findDefinitionInAST(ast, args.symbol)
          enhanced.confidence = 0.95
        } else if (args.toolName === "find_references") {
          enhanced.astReferences = await this.findReferencesInAST(ast, args.symbol)
          enhanced.semanticReferences = true
        } else if (args.toolName === "analyze_complexity") {
          enhanced.complexity = await this.baseLayer.analyzeComplexity(ast)
        }
      }
      
      // Add semantic information
      if (enhanced.astDefinition || enhanced.astReferences) {
        enhanced.semantics = await this.extractSemantics(args)
      }
    } catch (error) {
      enhanced.astError = error instanceof Error ? error.message : String(error)
    }
    
    const executionTime = performance.now() - startTime
    this.trackPerformance('enhance', executionTime)
    
    return {
      data: enhanced,
      confidence: Math.min(1.0, previousResult.confidence + 0.2),
      layersUsed: [...previousResult.layersUsed, "tree-sitter"],
      executionTime,
      sufficient: true,
    }
  }

  private async findDefinitionInAST(ast: ParsedAST, symbol: string): Promise<ASTNode | null> {
    return this.baseLayer.findDefinition(ast, symbol)
  }

  private async findReferencesInAST(ast: ParsedAST, symbol: string): Promise<ASTNode[]> {
    return this.baseLayer.findReferences(ast, symbol)
  }

  private inferReferenceType(node: ASTNode): string {
    // Infer if it's a call, property access, import, etc. based on parent context
    const parentType = node.parent?.type
    if (!parentType) return "reference"
    
    switch (parentType) {
      case "call_expression":
        return "call"
      case "member_expression":
        return "property"
      case "import_specifier":
        return "import"
      case "export_specifier":
        return "export"
      default:
        return "reference"
    }
  }

  private async extractSemantics(args: any): Promise<any> {
    return {
      language: this.detectLanguage(args.file),
      scope: await this.determineScope(args),
      imports: await this.extractImports(args.file),
      exports: await this.extractExports(args.file),
    }
  }

  private detectLanguage(file: string): string {
    const ext = file?.split(".").pop()
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript"
      case "js":
      case "jsx":
        return "javascript"
      case "py":
        return "python"
      case "rs":
        return "rust"
      case "go":
        return "go"
      default:
        return "unknown"
    }
  }

  private async determineScope(args: any): Promise<string> {
    // Determine the scope context (function, class, module, etc.)
    if (!args.position || !args.file) return "global"
    
    try {
      const ast = await this.baseLayer.parseFile(args.file)
      // Would use AST to find containing scope at position
      // For now, simplified
      return "function"
    } catch {
      return "global"
    }
  }

  private async extractImports(file: string): Promise<any[]> {
    if (!file) return []
    
    try {
      const ast = await this.baseLayer.parseFile(file)
      const language = this.detectLanguage(file)
      
      let query = ''
      switch (language) {
        case 'typescript':
        case 'javascript':
          query = '(import_statement) @import'
          break
        case 'python':
          query = '(import_statement) @import (import_from_statement) @import'
          break
        default:
          return []
      }
      
      const imports = await this.baseLayer.query(ast, query)
      
      return imports.map(i => ({
        source: i.node.text,
        location: {
          line: i.node.startPosition.row + 1,
          column: i.node.startPosition.column
        }
      }))
    } catch {
      return []
    }
  }

  private async extractExports(file: string): Promise<any[]> {
    if (!file) return []
    
    try {
      const ast = await this.baseLayer.parseFile(file)
      const language = this.detectLanguage(file)
      
      let query = ''
      switch (language) {
        case 'typescript':
        case 'javascript':
          query = '(export_statement) @export'
          break
        case 'python':
          // Python doesn't have explicit exports
          return []
        default:
          return []
      }
      
      const exports = await this.baseLayer.query(ast, query)
      
      return exports.map(e => ({
        name: e.node.text,
        type: e.node.type,
        location: {
          line: e.node.startPosition.row + 1,
          column: e.node.startPosition.column
        }
      }))
    } catch {
      return []
    }
  }

  // Methods called from orchestrator
  async findDefinition(args: any): Promise<any> {
    const startTime = performance.now()
    const { symbol, file } = args
    
    try {
      // Try LSP API first for best semantic accuracy
      const response = await this.lspClient.findDefinition(symbol)
      
      if (response && !response.error && response.definitions?.length > 0) {
        this.trackPerformance('findDefinition', performance.now() - startTime)
        return {
          definitions: response.definitions,
          confidence: 0.95,
          source: 'tree-sitter-lsp'
        }
      }
      
      // Fallback to AST-based search
      if (file) {
        const ast = await this.baseLayer.parseFile(file)
        const definition = await this.baseLayer.findDefinition(ast, symbol)
        
        if (definition) {
          this.trackPerformance('findDefinition', performance.now() - startTime)
          return {
            definitions: [{
              ...definition,
              file // Add file path to location
            }],
            confidence: 0.8,
            source: 'tree-sitter-ast'
          }
        }
      }
      
      // Search across workspace if no file specified
      const workspaceResults = await this.searchWorkspaceForDefinition(symbol)
      this.trackPerformance('findDefinition', performance.now() - startTime)
      
      return workspaceResults
    } catch (error) {
      console.error('TreeSitterLayer.findDefinition error:', error)
      return {
        definitions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async findReferences(args: any): Promise<any> {
    const startTime = performance.now()
    const { symbol, file, includeDeclaration, scope } = args
    
    try {
      // Try LSP API first
      const response = await this.lspClient.findReferences(symbol)
      
      if (response && !response.error && response.references?.length > 0) {
        this.trackPerformance('findReferences', performance.now() - startTime)
        return {
          references: response.references,
          confidence: 0.95,
          source: 'tree-sitter-lsp'
        }
      }
      
      // Fallback to AST-based search
      const references: ASTNode[] = []
      
      if (file) {
        const ast = await this.baseLayer.parseFile(file)
        const fileRefs = await this.baseLayer.findReferences(ast, symbol)
        references.push(...fileRefs.map(ref => ({ ...ref, file })))
      }
      
      // Filter based on includeDeclaration
      const filtered = includeDeclaration ? references : references.filter(ref => {
        // Simple heuristic: declarations often have certain parent types
        return !['variable_declarator', 'function_declaration', 'class_declaration'].includes(ref.type)
      })
      
      this.trackPerformance('findReferences', performance.now() - startTime)
      
      return {
        references: filtered,
        confidence: 0.75,
        source: 'tree-sitter-ast'
      }
    } catch (error) {
      console.error('TreeSitterLayer.findReferences error:', error)
      return {
        references: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async analyzeComplexity(args: any): Promise<any> {
    const startTime = performance.now()
    const { file, metrics = ['cyclomatic', 'cognitive'] } = args
    
    try {
      const ast = await this.baseLayer.parseFile(file)
      const complexity = await this.baseLayer.analyzeComplexity(ast)
      
      this.trackPerformance('analyzeComplexity', performance.now() - startTime)
      
      return {
        file,
        metrics: complexity,
        suggestions: this.generateComplexitySuggestions(complexity),
        confidence: 0.9,
        source: 'tree-sitter'
      }
    } catch (error) {
      console.error('TreeSitterLayer.analyzeComplexity error:', error)
      return {
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async analyzeStructure(source: string): Promise<any> {
    const startTime = performance.now()
    
    try {
      const ast = await this.baseLayer.parseFile(source)
      const language = this.detectLanguage(source)
      
      // Use queries to extract structure
      const structure = {
        classes: await this.extractClasses(ast, language),
        functions: await this.extractFunctions(ast, language),
        interfaces: await this.extractInterfaces(ast, language),
        imports: await this.extractImports(source),
        exports: await this.extractExports(source),
        source: 'tree-sitter'
      }
      
      this.trackPerformance('analyzeStructure', performance.now() - startTime)
      return structure
    } catch (error) {
      console.error('TreeSitterLayer.analyzeStructure error:', error)
      return {
        classes: [],
        functions: [],
        interfaces: [],
        imports: [],
        exports: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async parseCode(code: string): Promise<any> {
    const startTime = performance.now()
    
    try {
      // Detect language from code patterns
      const language = this.detectLanguageFromCode(code)
      const ast = await this.baseLayer.parseCode(code, language)
      
      this.trackPerformance('parseCode', performance.now() - startTime)
      
      return {
        type: 'program',
        language,
        tree: ast.tree.rootNode,
        source: 'tree-sitter'
      }
    } catch (error) {
      return {
        type: 'program',
        children: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async analyzePerformance(target: string): Promise<any> {
    const startTime = performance.now()
    
    try {
      const ast = await this.baseLayer.parseFile(target)
      const language = this.detectLanguage(target)
      
      const analysis = {
        loops: await this.findLoops(ast, language),
        recursion: await this.findRecursion(ast, language),
        largeObjects: await this.findLargeObjects(ast, language),
        inefficientPatterns: await this.findInefficientPatterns(ast, language),
        source: 'tree-sitter'
      }
      
      this.trackPerformance('analyzePerformance', performance.now() - startTime)
      return analysis
    } catch (error) {
      return {
        loops: [],
        recursion: [],
        largeObjects: [],
        inefficientPatterns: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  async analyzeForTesting(target: string): Promise<any> {
    const startTime = performance.now()
    
    try {
      const ast = await this.baseLayer.parseFile(target)
      const language = this.detectLanguage(target)
      
      const analysis = {
        functions: await this.extractTestableUnits(ast, language),
        branches: await this.extractBranches(ast, language),
        sideEffects: await this.identifySideEffects(ast, language),
        dependencies: await this.extractDependencies(ast, language),
        source: 'tree-sitter'
      }
      
      this.trackPerformance('analyzeForTesting', performance.now() - startTime)
      return analysis
    } catch (error) {
      return {
        functions: [],
        branches: [],
        sideEffects: [],
        dependencies: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'tree-sitter'
      }
    }
  }

  // Helper methods
  private generateComplexitySuggestions(complexity: any): string[] {
    const suggestions: string[] = []
    
    if (complexity.cyclomatic > 10) {
      suggestions.push('Consider breaking down complex functions into smaller units')
    }
    if (complexity.nesting > 3) {
      suggestions.push('Reduce nesting levels by using early returns or extracting functions')
    }
    if (complexity.cognitive > 15) {
      suggestions.push('Simplify logic to reduce cognitive load - consider using lookup tables or strategy pattern')
    }
    if (complexity.lines > 100) {
      suggestions.push('File is getting long - consider splitting into modules')
    }
    
    return suggestions
  }

  private async searchWorkspaceForDefinition(symbol: string): Promise<any> {
    // This would search across workspace files
    // For now, return empty
    return {
      definitions: [],
      confidence: 0,
      source: 'tree-sitter-workspace'
    }
  }

  private detectLanguageFromCode(code: string): string {
    // Simple heuristics for language detection
    if (code.includes('import') && code.includes('from')) return 'python'
    if (code.includes('interface') || code.includes(': string')) return 'typescript'
    if (code.includes('const') || code.includes('let') || code.includes('var')) return 'javascript'
    return 'javascript' // default
  }

  private async extractClasses(ast: ParsedAST, language: string): Promise<any[]> {
    const query = language === 'python' 
      ? '(class_definition name: (identifier) @class)'
      : '(class_declaration name: (identifier) @class)'
    
    const matches = await this.baseLayer.query(ast, query)
    return matches.map(m => ({
      name: m.captures.class?.text || m.node.text,
      location: {
        line: m.node.startPosition.row + 1,
        column: m.node.startPosition.column
      }
    }))
  }

  private async extractFunctions(ast: ParsedAST, language: string): Promise<any[]> {
    const query = language === 'python'
      ? '(function_definition name: (identifier) @function)'
      : '(function_declaration name: (identifier) @function)'
    
    const matches = await this.baseLayer.query(ast, query)
    return matches.map(m => ({
      name: m.captures.function?.text || m.node.text,
      location: {
        line: m.node.startPosition.row + 1,
        column: m.node.startPosition.column
      }
    }))
  }

  private async extractInterfaces(ast: ParsedAST, language: string): Promise<any[]> {
    if (language !== 'typescript') return []
    
    const query = '(interface_declaration name: (type_identifier) @interface)'
    const matches = await this.baseLayer.query(ast, query)
    
    return matches.map(m => ({
      name: m.captures.interface?.text || m.node.text,
      location: {
        line: m.node.startPosition.row + 1,
        column: m.node.startPosition.column
      }
    }))
  }

  private async findLoops(ast: ParsedAST, language: string): Promise<any[]> {
    const query = '(for_statement) @loop (while_statement) @loop (do_statement) @loop'
    const matches = await this.baseLayer.query(ast, query)
    
    return matches.map(m => ({
      type: m.node.type,
      location: {
        line: m.node.startPosition.row + 1,
        column: m.node.startPosition.column
      },
      nested: this.isNestedLoop(m.node)
    }))
  }

  private isNestedLoop(node: any): boolean {
    // Check if this loop is inside another loop
    let parent = node.parent
    while (parent) {
      if (['for_statement', 'while_statement', 'do_statement'].includes(parent.type)) {
        return true
      }
      parent = parent.parent
    }
    return false
  }

  private async findRecursion(ast: ParsedAST, language: string): Promise<any[]> {
    // This would require more complex analysis
    // For now, return empty
    return []
  }

  private async findLargeObjects(ast: ParsedAST, language: string): Promise<any[]> {
    // Detect large object literals or arrays
    const query = '(object) @obj (array) @arr'
    const matches = await this.baseLayer.query(ast, query)
    
    return matches
      .filter(m => m.node.childCount > 20) // Large = more than 20 properties/elements
      .map(m => ({
        type: m.node.type,
        size: m.node.childCount,
        location: {
          line: m.node.startPosition.row + 1,
          column: m.node.startPosition.column
        }
      }))
  }

  private async findInefficientPatterns(ast: ParsedAST, language: string): Promise<any[]> {
    const patterns: any[] = []
    
    // Find array operations in loops (potential O(n²) complexity)
    const loopQuery = '(for_statement) @loop (while_statement) @loop'
    const loops = await this.baseLayer.query(ast, loopQuery)
    
    for (const loop of loops) {
      const bodyQuery = '(call_expression) @call'
      const calls = await this.baseLayer.query({ ...ast, tree: { rootNode: loop.node } } as any, bodyQuery)
      
      for (const call of calls) {
        const callText = call.node.text
        if (callText.includes('.push') || callText.includes('.unshift') || callText.includes('.splice')) {
          patterns.push({
            type: 'array-mutation-in-loop',
            location: {
              line: call.node.startPosition.row + 1,
              column: call.node.startPosition.column
            },
            suggestion: 'Consider building a new array instead of mutating in a loop'
          })
        }
      }
    }
    
    return patterns
  }

  private async extractTestableUnits(ast: ParsedAST, language: string): Promise<any[]> {
    const functions = await this.extractFunctions(ast, language)
    const methodQuery = '(method_definition) @method'
    const methods = await this.baseLayer.query(ast, methodQuery)
    
    return [
      ...functions,
      ...methods.map(m => ({
        name: m.node.text?.split('(')[0] || 'unknown',
        type: 'method',
        location: {
          line: m.node.startPosition.row + 1,
          column: m.node.startPosition.column
        }
      }))
    ]
  }

  private async extractBranches(ast: ParsedAST, language: string): Promise<any[]> {
    const query = '(if_statement) @branch (switch_statement) @branch (conditional_expression) @branch'
    const matches = await this.baseLayer.query(ast, query)
    
    return matches.map(m => ({
      type: m.node.type,
      location: {
        line: m.node.startPosition.row + 1,
        column: m.node.startPosition.column
      }
    }))
  }

  private async identifySideEffects(ast: ParsedAST, language: string): Promise<any[]> {
    // Identify potential side effects (mutations, I/O, etc.)
    const sideEffects: any[] = []
    
    // Find console/print statements
    const printQuery = language === 'python' 
      ? '(call (identifier) @fn (#eq? @fn "print"))'
      : '(call_expression (member_expression) @console (#match? @console "console"))'
    
    try {
      const prints = await this.baseLayer.query(ast, printQuery)
      sideEffects.push(...prints.map(p => ({
        type: 'io-operation',
        subtype: 'console',
        location: {
          line: p.node.startPosition.row + 1,
          column: p.node.startPosition.column
        }
      })))
    } catch {
      // Query might fail for unsupported language
    }
    
    return sideEffects
  }

  private async extractDependencies(ast: ParsedAST, language: string): Promise<any[]> {
    const deps: any[] = []
    
    // Extract imports
    const importQuery = language === 'python'
      ? '(import_statement) @import (import_from_statement) @import'
      : '(import_statement) @import'
    
    const imports = await this.baseLayer.query(ast, importQuery)
    deps.push(...imports.map(i => ({
      type: 'import',
      source: i.node.text,
      location: {
        line: i.node.startPosition.row + 1,
        column: i.node.startPosition.column
      }
    })))
    
    // Find require() calls for CommonJS
    if (language === 'javascript') {
      const requireQuery = '(call_expression (identifier) @fn (#eq? @fn "require"))'
      try {
        const requires = await this.baseLayer.query(ast, requireQuery)
        deps.push(...requires.map(r => ({
          type: 'require',
          source: r.node.text,
          location: {
            line: r.node.startPosition.row + 1,
            column: r.node.startPosition.column
          }
        })))
      } catch {
        // Query might fail
      }
    }
    
    return deps
  }

  private trackPerformance(operation: string, time: number) {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, [])
    }
    
    const metrics = this.performanceMetrics.get(operation)!
    metrics.push(time)
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift()
    }
  }

  private getPerformanceStats(operation: string) {
    const metrics = this.performanceMetrics.get(operation)
    if (!metrics || metrics.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 }
    }
    
    const sorted = [...metrics].sort((a, b) => a - b)
    const avg = metrics.reduce((a, b) => a + b, 0) / metrics.length
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    
    return { avg, p50, p95, p99 }
  }

  async getStats(): Promise<any> {
    const cacheStats = this.baseLayer.getCacheStats()
    
    return {
      cacheStats,
      performanceStats: {
        findDefinition: this.getPerformanceStats('findDefinition'),
        findReferences: this.getPerformanceStats('findReferences'),
        analyzeComplexity: this.getPerformanceStats('analyzeComplexity'),
        enhance: this.getPerformanceStats('enhance')
      },
      supportedLanguages: cacheStats.supportedLanguages
    }
  }
}