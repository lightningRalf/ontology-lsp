/**
 * Fallback Tree-Sitter Service
 * 
 * Provides basic AST-like functionality when tree-sitter packages aren't available.
 * Uses regex and simple parsing for basic operations.
 * 
 * This ensures the MCP server can still function even without tree-sitter dependencies.
 */

import { LRUCache } from 'lru-cache'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'

export interface ParsedAST {
  tree: any
  language: string
  version: number
  timestamp: number
  checksum: string
}

export interface QueryMatch {
  node: any
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

/**
 * Fallback implementation using regex-based parsing
 */
export class BaseTreeSitterServiceFallback {
  private astCache: LRUCache<string, ParsedAST>
  private fileVersions: Map<string, number>
  private fileContentCache: Map<string, { content: string; checksum: string }>
  
  constructor() {
    this.astCache = new LRUCache<string, ParsedAST>({
      max: 100,
      ttl: 1000 * 60 * 5, // 5 minute TTL
    })
    
    this.fileVersions = new Map()
    this.fileContentCache = new Map()
  }
  
  async parseFile(filePath: string, forceRefresh = false): Promise<ParsedAST> {
    const cacheKey = filePath
    
    if (!forceRefresh) {
      const cached = this.astCache.get(cacheKey)
      if (cached) {
        const currentChecksum = await this.getFileChecksum(filePath)
        if (cached.checksum === currentChecksum) {
          return cached
        }
      }
    }
    
    const content = await this.readFileContent(filePath)
    const checksum = this.calculateChecksum(content)
    const language = this.detectLanguage(filePath)
    
    // Create a simple AST-like structure
    const tree = this.createSimpleAST(content, language)
    
    const version = (this.fileVersions.get(filePath) || 0) + 1
    this.fileVersions.set(filePath, version)
    
    const parsedAST: ParsedAST = {
      tree,
      language,
      version,
      timestamp: Date.now(),
      checksum
    }
    
    this.astCache.set(cacheKey, parsedAST)
    
    return parsedAST
  }
  
  async parseCode(code: string, language: string): Promise<ParsedAST> {
    const tree = this.createSimpleAST(code, language)
    const checksum = this.calculateChecksum(code)
    
    return {
      tree,
      language,
      version: 1,
      timestamp: Date.now(),
      checksum
    }
  }
  
  async query(ast: ParsedAST, queryString: string): Promise<QueryMatch[]> {
    // Simple pattern matching based on query string
    const matches: QueryMatch[] = []
    
    // Extract pattern type from query (e.g., "function_declaration", "class_declaration")
    const patterns = this.extractPatternsFromQuery(queryString)
    
    const traverse = (node: any) => {
      if (!node) return
      
      for (const pattern of patterns) {
        if (node.type === pattern.type) {
          matches.push({
            node,
            captures: { [pattern.capture || 'node']: node },
            pattern: 0
          })
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child)
        }
      }
    }
    
    traverse(ast.tree.rootNode)
    return matches
  }
  
  async findDefinition(ast: ParsedAST, symbol: string): Promise<ASTNode | null> {
    const definitions = this.findInAST(ast.tree.rootNode, symbol, ['definition'])
    return definitions[0] || null
  }
  
  async findReferences(ast: ParsedAST, symbol: string): Promise<ASTNode[]> {
    return this.findInAST(ast.tree.rootNode, symbol, ['reference', 'call'])
  }
  
  async analyzeComplexity(ast: ParsedAST): Promise<{
    cyclomatic: number
    cognitive: number
    nesting: number
    lines: number
  }> {
    const metrics = {
      cyclomatic: 1,
      cognitive: 0,
      nesting: 0,
      lines: 0
    }
    
    const traverse = (node: any, depth: number) => {
      if (!node) return
      
      // Count decision points
      if (['if', 'switch', 'for', 'while', 'catch'].includes(node.type)) {
        metrics.cyclomatic++
        metrics.cognitive += depth
      }
      
      // Track max nesting
      if (['function', 'method', 'class', 'if', 'for', 'while'].includes(node.type)) {
        metrics.nesting = Math.max(metrics.nesting, depth)
      }
      
      if (node.children) {
        for (const child of node.children) {
          const newDepth = ['function', 'method', 'class', 'if', 'for', 'while'].includes(node.type) 
            ? depth + 1 
            : depth
          traverse(child, newDepth)
        }
      }
    }
    
    traverse(ast.tree.rootNode, 0)
    
    // Count lines
    const content = ast.tree.rootNode.text || ''
    metrics.lines = content.split('\n').length
    
    return metrics
  }
  
  /**
   * Create a simple AST-like structure using regex
   */
  private createSimpleAST(content: string, language: string): any {
    const lines = content.split('\n')
    const rootNode: any = {
      type: 'program',
      text: content,
      children: [],
      startPosition: { row: 0, column: 0 },
      endPosition: { row: lines.length - 1, column: lines[lines.length - 1].length },
      childCount: 0
    }
    
    // Language-specific patterns
    const patterns = this.getLanguagePatterns(language)
    
    // Parse functions/methods
    for (const pattern of patterns.functions) {
      const matches = content.matchAll(pattern.regex)
      for (const match of matches) {
        const node = {
          type: pattern.type,
          text: match[0],
          name: match[1] || match[2],
          startPosition: this.getPosition(content, match.index!),
          endPosition: this.getPosition(content, match.index! + match[0].length),
          parent: rootNode
        }
        rootNode.children.push(node)
      }
    }
    
    // Parse classes
    for (const pattern of patterns.classes) {
      const matches = content.matchAll(pattern.regex)
      for (const match of matches) {
        const node = {
          type: pattern.type,
          text: match[0],
          name: match[1],
          startPosition: this.getPosition(content, match.index!),
          endPosition: this.getPosition(content, match.index! + match[0].length),
          parent: rootNode
        }
        rootNode.children.push(node)
      }
    }
    
    // Parse variables
    for (const pattern of patterns.variables) {
      const matches = content.matchAll(pattern.regex)
      for (const match of matches) {
        const node = {
          type: pattern.type,
          text: match[0],
          name: match[1] || match[2],
          startPosition: this.getPosition(content, match.index!),
          endPosition: this.getPosition(content, match.index! + match[0].length),
          parent: rootNode
        }
        rootNode.children.push(node)
      }
    }
    
    rootNode.childCount = rootNode.children.length
    
    return { rootNode }
  }
  
  /**
   * Get language-specific regex patterns
   */
  private getLanguagePatterns(language: string) {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return {
          functions: [
            { regex: /function\s+(\w+)\s*\(/g, type: 'function_declaration' },
            { regex: /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/g, type: 'function_expression' },
            { regex: /(\w+)\s*:\s*(?:async\s+)?(?:function|\(.*?\)\s*=>)/g, type: 'method_definition' }
          ],
          classes: [
            { regex: /class\s+(\w+)/g, type: 'class_declaration' },
            { regex: /interface\s+(\w+)/g, type: 'interface_declaration' }
          ],
          variables: [
            { regex: /(?:const|let|var)\s+(\w+)(?:\s*[:=])/g, type: 'variable_declaration' }
          ]
        }
      
      case 'python':
        return {
          functions: [
            { regex: /def\s+(\w+)\s*\(/g, type: 'function_definition' },
            { regex: /async\s+def\s+(\w+)\s*\(/g, type: 'async_function_definition' }
          ],
          classes: [
            { regex: /class\s+(\w+)(?:\(|\:)/g, type: 'class_definition' }
          ],
          variables: [
            { regex: /^(\w+)\s*=/gm, type: 'assignment' }
          ]
        }
      
      default:
        return {
          functions: [],
          classes: [],
          variables: []
        }
    }
  }
  
  /**
   * Find nodes in AST matching criteria
   */
  private findInAST(rootNode: any, symbol: string, types: string[]): ASTNode[] {
    const results: ASTNode[] = []
    
    const traverse = (node: any) => {
      if (!node) return
      
      // Check if node matches
      if (node.name === symbol || (node.text && node.text.includes(symbol))) {
        results.push({
          type: node.type,
          text: node.text,
          name: node.name,
          location: {
            file: '',
            startLine: node.startPosition?.row + 1 || 1,
            startColumn: node.startPosition?.column || 0,
            endLine: node.endPosition?.row + 1 || 1,
            endColumn: node.endPosition?.column || 0
          }
        })
      }
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child)
        }
      }
    }
    
    traverse(rootNode)
    return results
  }
  
  /**
   * Extract patterns from tree-sitter query string
   */
  private extractPatternsFromQuery(queryString: string): Array<{ type: string; capture?: string }> {
    const patterns: Array<{ type: string; capture?: string }> = []
    
    // Match patterns like (function_declaration) @fn
    const regex = /\((\w+)\)(?:\s+@(\w+))?/g
    let match
    
    while ((match = regex.exec(queryString)) !== null) {
      patterns.push({
        type: match[1],
        capture: match[2]
      })
    }
    
    return patterns
  }
  
  /**
   * Get position in content
   */
  private getPosition(content: string, index: number): { row: number; column: number } {
    const lines = content.substring(0, index).split('\n')
    return {
      row: lines.length - 1,
      column: lines[lines.length - 1].length
    }
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
  
  private async readFileContent(filePath: string): Promise<string> {
    const cached = this.fileContentCache.get(filePath)
    
    if (cached) {
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
  
  private async getFileChecksum(filePath: string): Promise<string> {
    const content = await this.readFileContent(filePath)
    return this.calculateChecksum(content)
  }
  
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }
  
  clearCaches() {
    this.astCache.clear()
    this.fileContentCache.clear()
    this.fileVersions.clear()
  }
  
  getCacheStats() {
    return {
      astCacheSize: this.astCache.size,
      astCacheCapacity: this.astCache.max,
      fileCacheSize: this.fileContentCache.size,
      supportedLanguages: ['typescript', 'javascript', 'python'],
      mode: 'fallback'
    }
  }
}