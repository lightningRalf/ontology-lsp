/**
 * Base Tree-Sitter Service
 * 
 * Shared AST parsing infrastructure for all layers.
 * Provides centralized caching, multi-language support, and query capabilities.
 * 
 * Design Principles:
 * - Language-agnostic interface
 * - Efficient caching with LRU eviction
 * - Incremental parsing support
 * - Thread-safe operations
 * - Graceful fallback when tree-sitter packages aren't available
 */

import { LRUCache } from 'lru-cache'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { BaseTreeSitterServiceFallback } from './base-tree-sitter-fallback.js'

export interface ParsedAST {
  tree: any // Parser.Tree or fallback tree
  language: string
  version: number
  timestamp: number
  checksum: string
}

export interface QueryMatch {
  node: any // Parser.SyntaxNode or fallback node
  captures: Record<string, any>
  pattern: number
}

export interface ASTLocation {
  file: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface ASTNode {
  type: string
  text?: string
  name?: string
  location: ASTLocation
  children?: ASTNode[]
  parent?: ASTNode
}

export class BaseTreeSitterService {
  private parsers: Map<string, any>
  private astCache: LRUCache<string, ParsedAST>
  private fileVersions: Map<string, number>
  private queryCache: Map<string, any>
  private fileContentCache: Map<string, { content: string; checksum: string }>
  private fallbackService?: BaseTreeSitterServiceFallback
  private isUsingFallback: boolean = false
  private Parser: any
  
  constructor() {
    this.parsers = new Map()
    this.fileVersions = new Map()
    this.queryCache = new Map()
    this.fileContentCache = new Map()
    
    // Initialize caches with LRU eviction
    this.astCache = new LRUCache<string, ParsedAST>({
      max: 100, // Max 100 ASTs in cache
      ttl: 1000 * 60 * 5, // 5 minute TTL
      sizeCalculation: (ast) => {
        if (this.isUsingFallback) {
          return 1
        }
        return ast.tree.rootNode?.descendantCount || 1
      },
      maxSize: 1000000, // Max 1M nodes total
      dispose: (ast) => {
        // Clean up tree when evicted (only for real tree-sitter)
        if (!this.isUsingFallback && ast.tree.delete) {
          ast.tree.delete()
        }
      }
    })
    
    // Try to initialize tree-sitter parsers
    this.initializeParsers()
  }
  
  private async initializeParsers() {
    try {
      // Try to load tree-sitter packages dynamically
      const [ParserModule, TypeScriptModule, JavaScriptModule, PythonModule] = await Promise.all([
        import('tree-sitter').catch(() => null),
        import('tree-sitter-typescript').catch(() => null),
        import('tree-sitter-javascript').catch(() => null),
        import('tree-sitter-python').catch(() => null)
      ])
      
      if (ParserModule && TypeScriptModule && JavaScriptModule) {
        this.Parser = ParserModule.default
        
        // TypeScript parser
        const tsParser = new this.Parser()
        tsParser.setLanguage(TypeScriptModule.default.typescript)
        this.parsers.set('typescript', tsParser)
        this.parsers.set('ts', tsParser)
        this.parsers.set('tsx', tsParser)
        
        // JavaScript parser
        const jsParser = new this.Parser()
        jsParser.setLanguage(JavaScriptModule.default)
        this.parsers.set('javascript', jsParser)
        this.parsers.set('js', jsParser)
        this.parsers.set('jsx', jsParser)
        
        // Python parser if available
        if (PythonModule) {
          const pyParser = new this.Parser()
          pyParser.setLanguage(PythonModule.default)
          this.parsers.set('python', pyParser)
          this.parsers.set('py', pyParser)
        }
        
        console.log('Tree-sitter parsers initialized successfully')
      } else {
        throw new Error('Some tree-sitter packages not available')
      }
    } catch (error) {
      console.warn('Tree-sitter packages not available, using fallback implementation:', error)
      this.isUsingFallback = true
      this.fallbackService = new BaseTreeSitterServiceFallback()
    }
  }
  
  /**
   * Parse a file and return its AST
   * Implements intelligent caching and incremental parsing
   */
  async parseFile(filePath: string, forceRefresh = false): Promise<ParsedAST> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.parseFile(filePath, forceRefresh)
    }
    
    const cacheKey = this.getCacheKey(filePath)
    
    // Check cache first
    if (!forceRefresh) {
      const cached = this.astCache.get(cacheKey)
      if (cached) {
        // Verify file hasn't changed
        const currentChecksum = await this.getFileChecksum(filePath)
        if (cached.checksum === currentChecksum) {
          return cached
        }
      }
    }
    
    // Read file content
    const content = await this.readFileContent(filePath)
    const checksum = this.calculateChecksum(content)
    const language = this.detectLanguage(filePath)
    const parser = this.parsers.get(language)
    
    if (!parser) {
      // Use fallback for unsupported languages
      if (this.fallbackService) {
        return this.fallbackService.parseFile(filePath, forceRefresh)
      }
      throw new Error(`No parser available for language: ${language}`)
    }
    
    // Check if we can do incremental parsing
    const oldAST = this.astCache.get(cacheKey)
    let tree: any
    
    if (oldAST && oldAST.checksum !== checksum && !this.isUsingFallback) {
      // Incremental parsing - reuse old tree
      tree = parser.parse(content, oldAST.tree)
      if (oldAST.tree.delete) {
        oldAST.tree.delete() // Clean up old tree
      }
    } else {
      // Full parse
      tree = parser.parse(content)
    }
    
    // Update version
    const version = (this.fileVersions.get(filePath) || 0) + 1
    this.fileVersions.set(filePath, version)
    
    // Create parsed AST object
    const parsedAST: ParsedAST = {
      tree,
      language,
      version,
      timestamp: Date.now(),
      checksum
    }
    
    // Cache it
    this.astCache.set(cacheKey, parsedAST)
    
    return parsedAST
  }
  
  /**
   * Parse code snippet directly without file
   */
  async parseCode(code: string, language: string): Promise<ParsedAST> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.parseCode(code, language)
    }
    
    const parser = this.parsers.get(language)
    
    if (!parser) {
      if (this.fallbackService) {
        return this.fallbackService.parseCode(code, language)
      }
      throw new Error(`No parser available for language: ${language}`)
    }
    
    const tree = parser.parse(code)
    const checksum = this.calculateChecksum(code)
    
    return {
      tree,
      language,
      version: 1,
      timestamp: Date.now(),
      checksum
    }
  }
  
  /**
   * Execute a tree-sitter query on an AST
   */
  async query(ast: ParsedAST, queryString: string): Promise<QueryMatch[]> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.query(ast, queryString)
    }
    
    const parser = this.parsers.get(ast.language)
    if (!parser) {
      if (this.fallbackService) {
        return this.fallbackService.query(ast, queryString)
      }
      throw new Error(`No parser for language: ${ast.language}`)
    }
    
    // Check query cache
    const queryCacheKey = `${ast.language}:${queryString}`
    let query = this.queryCache.get(queryCacheKey)
    
    if (!query) {
      try {
        query = parser.getLanguage().query(queryString)
        this.queryCache.set(queryCacheKey, query)
      } catch (error) {
        // Query syntax might be invalid, return empty results
        console.warn(`Invalid query for ${ast.language}: ${queryString}`)
        return []
      }
    }
    
    // Execute query
    const matches = query.matches(ast.tree.rootNode)
    
    // Transform matches to our format
    return matches.map((match: any) => ({
      node: match.captures[0]?.node,
      captures: match.captures.reduce((acc: any, capture: any) => {
        if (capture.name) {
          acc[capture.name] = capture.node
        }
        return acc
      }, {} as Record<string, any>),
      pattern: match.pattern
    }))
  }
  
  /**
   * Find definition of a symbol in AST
   */
  async findDefinition(ast: ParsedAST, symbol: string): Promise<ASTNode | null> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.findDefinition(ast, symbol)
    }
    
    const queries = this.getDefinitionQueries(ast.language)
    
    for (const queryString of queries) {
      const matches = await this.query(ast, queryString)
      
      for (const match of matches) {
        const node = match.node
        if (node && (node.text === symbol || this.getNodeName(node) === symbol)) {
          return this.nodeToASTNode(node)
        }
      }
    }
    
    return null
  }
  
  /**
   * Find all references to a symbol in AST
   */
  async findReferences(ast: ParsedAST, symbol: string): Promise<ASTNode[]> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.findReferences(ast, symbol)
    }
    
    const query = `(identifier) @ref`
    const matches = await this.query(ast, query)
    
    return matches
      .filter(match => match.node && match.node.text === symbol)
      .map(match => this.nodeToASTNode(match.node))
  }
  
  /**
   * Analyze complexity of an AST
   */
  async analyzeComplexity(ast: ParsedAST): Promise<{
    cyclomatic: number
    cognitive: number
    nesting: number
    lines: number
  }> {
    if (this.isUsingFallback && this.fallbackService) {
      return this.fallbackService.analyzeComplexity(ast)
    }
    
    const metrics = {
      cyclomatic: 1,
      cognitive: 0,
      nesting: 0,
      lines: ast.tree.rootNode?.endPosition?.row + 1 || 0
    }
    
    // Count decision points
    const decisionQuery = this.getComplexityQuery(ast.language)
    const decisions = await this.query(ast, decisionQuery)
    metrics.cyclomatic += decisions.length
    
    // Calculate cognitive complexity
    metrics.cognitive = await this.calculateCognitiveComplexity(ast)
    
    // Calculate max nesting
    if (ast.tree.rootNode) {
      metrics.nesting = this.calculateMaxNesting(ast.tree.rootNode)
    }
    
    return metrics
  }
  
  /**
   * Get definition queries for a language
   */
  private getDefinitionQueries(language: string): string[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return [
          '(function_declaration name: (identifier) @def)',
          '(class_declaration name: (identifier) @def)',
          '(interface_declaration name: (type_identifier) @def)',
          '(type_alias_declaration name: (type_identifier) @def)',
          '(variable_declarator name: (identifier) @def)',
          '(method_definition name: (property_identifier) @def)'
        ]
      case 'python':
        return [
          '(function_definition name: (identifier) @def)',
          '(class_definition name: (identifier) @def)',
          '(assignment left: (identifier) @def)'
        ]
      default:
        return ['(identifier) @def']
    }
  }
  
  /**
   * Get complexity query for a language
   */
  private getComplexityQuery(language: string): string {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return `
          (if_statement) @decision
          (switch_statement) @decision
          (for_statement) @decision
          (while_statement) @decision
          (do_statement) @decision
          (conditional_expression) @decision
          (catch_clause) @decision
        `
      case 'python':
        return `
          (if_statement) @decision
          (for_statement) @decision
          (while_statement) @decision
          (try_statement) @decision
          (conditional_expression) @decision
        `
      default:
        return '(if_statement) @decision'
    }
  }
  
  /**
   * Calculate cognitive complexity
   */
  private async calculateCognitiveComplexity(ast: ParsedAST): Promise<number> {
    if (!ast.tree.rootNode) return 0
    
    let complexity = 0
    
    const traverse = (node: any, depth: number) => {
      // Increment for nesting
      if (this.isNestingNode(node)) {
        complexity += depth
      }
      
      // Increment for logical operators
      if (node.type === 'binary_expression') {
        const operator = node.childForFieldName ? node.childForFieldName('operator') : null
        if (operator && ['&&', '||'].includes(operator.text || '')) {
          complexity++
        }
      }
      
      // Traverse children
      if (node.childCount) {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (child) {
            const newDepth = this.isNestingNode(node) ? depth + 1 : depth
            traverse(child, newDepth)
          }
        }
      }
    }
    
    traverse(ast.tree.rootNode, 0)
    return complexity
  }
  
  /**
   * Calculate maximum nesting depth
   */
  private calculateMaxNesting(node: any, depth = 0): number {
    let maxDepth = depth
    
    if (node.childCount) {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) {
          const childDepth = this.isNestingNode(child) ? depth + 1 : depth
          maxDepth = Math.max(maxDepth, this.calculateMaxNesting(child, childDepth))
        }
      }
    }
    
    return maxDepth
  }
  
  /**
   * Check if node increases nesting
   */
  private isNestingNode(node: any): boolean {
    const nestingTypes = [
      'if_statement', 'switch_statement', 'for_statement',
      'while_statement', 'do_statement', 'try_statement',
      'function_declaration', 'arrow_function', 'method_definition',
      'class_declaration', 'block_statement'
    ]
    return nestingTypes.includes(node.type)
  }
  
  /**
   * Convert tree-sitter node to our AST node format
   */
  private nodeToASTNode(node: any): ASTNode {
    return {
      type: node.type,
      text: node.text?.substring(0, 100), // Limit text length
      name: this.getNodeName(node),
      location: {
        file: '', // Will be filled by caller
        startLine: node.startPosition?.row + 1 || 1,
        startColumn: node.startPosition?.column || 0,
        endLine: node.endPosition?.row + 1 || 1,
        endColumn: node.endPosition?.column || 0
      }
    }
  }
  
  /**
   * Extract name from a node if possible
   */
  private getNodeName(node: any): string | undefined {
    if (!node.childForFieldName) return undefined
    const nameNode = node.childForFieldName('name')
    return nameNode?.text
  }
  
  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'javascript'
      case 'py':
        return 'python'
      default:
        return 'unknown'
    }
  }
  
  /**
   * Read file content with caching
   */
  private async readFileContent(filePath: string): Promise<string> {
    const cached = this.fileContentCache.get(filePath)
    
    if (cached) {
      // Verify checksum
      const content = await readFile(filePath, 'utf-8')
      const checksum = this.calculateChecksum(content)
      
      if (cached.checksum === checksum) {
        return cached.content
      }
    }
    
    const content = await readFile(filePath, 'utf-8')
    const checksum = this.calculateChecksum(content)
    
    this.fileContentCache.set(filePath, { content, checksum })
    
    return content
  }
  
  /**
   * Get file checksum for change detection
   */
  private async getFileChecksum(filePath: string): Promise<string> {
    const content = await this.readFileContent(filePath)
    return this.calculateChecksum(content)
  }
  
  /**
   * Calculate checksum of content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }
  
  /**
   * Get cache key for a file
   */
  private getCacheKey(filePath: string): string {
    return filePath
  }
  
  /**
   * Clear all caches
   */
  clearCaches() {
    if (this.fallbackService) {
      this.fallbackService.clearCaches()
    }
    this.astCache.clear()
    this.queryCache.clear()
    this.fileContentCache.clear()
    this.fileVersions.clear()
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (this.fallbackService) {
      return this.fallbackService.getCacheStats()
    }
    
    return {
      astCacheSize: this.astCache.size,
      astCacheCapacity: this.astCache.max,
      queryCacheSize: this.queryCache.size,
      fileCacheSize: this.fileContentCache.size,
      calculatedSize: this.astCache.calculatedSize,
      supportedLanguages: Array.from(this.parsers.keys()),
      mode: this.isUsingFallback ? 'fallback' : 'full'
    }
  }
}

// Singleton instance for sharing across layers
let sharedInstance: BaseTreeSitterService | null = null

export function getSharedTreeSitterService(): BaseTreeSitterService {
  if (!sharedInstance) {
    sharedInstance = new BaseTreeSitterService()
  }
  return sharedInstance
}