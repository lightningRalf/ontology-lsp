/**
 * MCP Translator
 * Translates between MCP protocol format and Core API format
 */

import {
  FindDefinitionParams,
  FindDefinitionResult,
  FindReferencesParams,
  FindReferencesResult,
  FindImplementationsParams,
  FindImplementationsResult,
  HoverParams,
  HoverResult,
  CompletionParams,
  CompletionResult,
  RenameParams,
  RenameResult,
  DiagnosticParams,
  DiagnosticResult,
  PatternParams,
  PatternAction,
  FeedbackParams,
  ConceptParams,
  ConceptResult,
  RelationshipParams,
  RelationshipResult,
  Location,
  WorkspaceContext
} from '../../core/types/api.js'

export class MCPTranslator {
  /**
   * Translate MCP find definition request to core format
   */
  translateFindDefinitionRequest(mcpArgs: any): FindDefinitionParams {
    return {
      symbol: mcpArgs.symbol,
      location: mcpArgs.file ? {
        uri: mcpArgs.file,
        line: mcpArgs.line || 0,
        column: mcpArgs.column || 0
      } : undefined,
      context: this.extractContext(mcpArgs),
      includeDeclaration: mcpArgs.includeDeclaration || false
    }
  }
  
  /**
   * Translate core find definition result to MCP format
   */
  translateFindDefinitionResponse(result: FindDefinitionResult): any {
    if (result.definitions.length === 0) {
      return {
        message: 'No definitions found',
        confidence: result.confidence
      }
    }
    
    return {
      definitions: result.definitions.map(def => ({
        file: def.location.uri,
        line: def.location.line,
        column: def.location.column,
        name: def.name,
        kind: def.kind,
        detail: def.detail,
        documentation: def.documentation,
        confidence: def.confidence
      })),
      totalFound: result.definitions.length,
      confidence: result.confidence,
      sources: result.source
    }
  }
  
  /**
   * Translate MCP find references request to core format
   */
  translateFindReferencesRequest(mcpArgs: any): FindReferencesParams {
    return {
      symbol: mcpArgs.symbol,
      location: mcpArgs.file ? {
        uri: mcpArgs.file,
        line: mcpArgs.line || 0,
        column: mcpArgs.column || 0
      } : undefined,
      context: this.extractContext(mcpArgs),
      includeDeclaration: mcpArgs.includeDeclaration || false,
      includeWrites: mcpArgs.includeWrites !== false,
      includeReads: mcpArgs.includeReads !== false
    }
  }
  
  /**
   * Translate core find references result to MCP format
   */
  translateFindReferencesResponse(result: FindReferencesResult): any {
    if (result.references.length === 0) {
      return {
        message: 'No references found',
        total: 0
      }
    }
    
    // Group references by file for better readability
    const byFile = new Map<string, any[]>()
    
    for (const ref of result.references) {
      const file = ref.location.uri
      if (!byFile.has(file)) {
        byFile.set(file, [])
      }
      byFile.get(file)!.push({
        line: ref.location.line,
        column: ref.location.column,
        kind: ref.kind,
        preview: ref.preview,
        confidence: ref.confidence
      })
    }
    
    // Convert to array format
    const files = Array.from(byFile.entries()).map(([file, refs]) => ({
      file,
      references: refs,
      count: refs.length
    }))
    
    return {
      files,
      totalReferences: result.total,
      truncated: result.truncated,
      summary: `Found ${result.total} references across ${files.length} files`
    }
  }
  
  /**
   * Translate MCP find implementations request to core format
   */
  translateFindImplementationsRequest(mcpArgs: any): FindImplementationsParams {
    return {
      symbol: mcpArgs.symbol,
      location: mcpArgs.file ? {
        uri: mcpArgs.file,
        line: mcpArgs.line || 0,
        column: mcpArgs.column || 0
      } : undefined,
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate core find implementations result to MCP format
   */
  translateFindImplementationsResponse(result: FindImplementationsResult): any {
    if (result.implementations.length === 0) {
      return {
        message: 'No implementations found',
        confidence: result.confidence
      }
    }
    
    return {
      implementations: result.implementations.map(impl => ({
        file: impl.location.uri,
        line: impl.location.line,
        column: impl.location.column,
        name: impl.name,
        kind: impl.kind,
        detail: impl.detail,
        confidence: impl.confidence
      })),
      totalFound: result.implementations.length,
      confidence: result.confidence
    }
  }
  
  /**
   * Translate MCP hover request to core format
   */
  translateHoverRequest(mcpArgs: any): HoverParams {
    return {
      symbol: mcpArgs.symbol,
      location: {
        uri: mcpArgs.file,
        line: mcpArgs.line,
        column: mcpArgs.column
      },
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate core hover result to MCP format
   */
  translateHoverResponse(result: HoverResult): any {
    return {
      content: result.content.value,
      contentType: result.content.kind,
      range: result.range ? {
        start: {
          line: result.range.start.line,
          column: result.range.start.column
        },
        end: {
          line: result.range.end.line,
          column: result.range.end.column
        }
      } : undefined
    }
  }
  
  /**
   * Translate MCP completion request to core format
   */
  translateCompletionRequest(mcpArgs: any): CompletionParams {
    return {
      prefix: mcpArgs.prefix,
      location: {
        uri: mcpArgs.file,
        line: mcpArgs.line,
        column: mcpArgs.column
      },
      context: this.extractContext(mcpArgs),
      triggerCharacter: mcpArgs.triggerCharacter,
      selectedCompletion: mcpArgs.selectedCompletion
    }
  }
  
  /**
   * Translate core completion result to MCP format
   */
  translateCompletionResponse(result: CompletionResult): any {
    return {
      completions: result.items.map(item => ({
        label: item.label,
        kind: item.kind,
        detail: item.detail,
        documentation: item.documentation,
        insertText: item.insertText,
        score: item.score,
        source: item.source
      })),
      isIncomplete: result.isIncomplete,
      totalCompletions: result.items.length
    }
  }
  
  /**
   * Translate MCP rename request to core format
   */
  translateRenameRequest(mcpArgs: any): RenameParams {
    return {
      symbol: mcpArgs.symbol,
      newName: mcpArgs.newName,
      location: {
        uri: mcpArgs.file || '',
        line: mcpArgs.line || 0,
        column: mcpArgs.column || 0
      },
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate core rename result to MCP format
   */
  translateRenameResponse(result: RenameResult): any {
    // Group edits by file
    const editsByFile = new Map<string, any[]>()
    
    for (const workspaceEdit of result.edits) {
      const file = workspaceEdit.uri
      if (!editsByFile.has(file)) {
        editsByFile.set(file, [])
      }
      
      for (const edit of workspaceEdit.edits) {
        editsByFile.get(file)!.push({
          range: {
            start: {
              line: edit.range.start.line,
              column: edit.range.start.column
            },
            end: {
              line: edit.range.end.line,
              column: edit.range.end.column
            }
          },
          newText: edit.newText
        })
      }
    }
    
    // Convert to array format
    const files = Array.from(editsByFile.entries()).map(([file, edits]) => ({
      file,
      edits,
      editCount: edits.length
    }))
    
    return {
      files,
      affectedFiles: result.affectedFiles,
      preview: result.preview,
      summary: `Renaming will affect ${result.affectedFiles.length} files`
    }
  }
  
  /**
   * Translate MCP diagnostic request to core format
   */
  translateDiagnosticRequest(mcpArgs: any): DiagnosticParams {
    return {
      uri: mcpArgs.file,
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate core diagnostic result to MCP format
   */
  translateDiagnosticResponse(result: DiagnosticResult): any {
    // Group diagnostics by severity
    const bySeverity = {
      errors: [] as any[],
      warnings: [] as any[],
      info: [] as any[],
      hints: [] as any[]
    }
    
    for (const diag of result.diagnostics) {
      const item = {
        range: {
          start: {
            line: diag.range.start.line,
            column: diag.range.start.column
          },
          end: {
            line: diag.range.end.line,
            column: diag.range.end.column
          }
        },
        message: diag.message,
        code: diag.code,
        source: diag.source,
        relatedInformation: diag.relatedInformation?.map(info => ({
          location: {
            file: info.location.uri,
            line: info.location.line,
            column: info.location.column
          },
          message: info.message
        }))
      }
      
      switch (diag.severity) {
        case 1: bySeverity.errors.push(item); break
        case 2: bySeverity.warnings.push(item); break
        case 3: bySeverity.info.push(item); break
        case 4: bySeverity.hints.push(item); break
      }
    }
    
    return {
      diagnostics: bySeverity,
      summary: {
        errors: bySeverity.errors.length,
        warnings: bySeverity.warnings.length,
        info: bySeverity.info.length,
        hints: bySeverity.hints.length,
        total: result.diagnostics.length
      }
    }
  }
  
  /**
   * Translate MCP pattern request to core format
   */
  translatePatternRequest(mcpArgs: any): PatternParams {
    return {
      code: mcpArgs.code,
      action: mcpArgs.action as PatternAction,
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate MCP feedback request to core format
   */
  translateFeedbackRequest(mcpArgs: any): FeedbackParams {
    return {
      operationId: mcpArgs.operationId,
      rating: mcpArgs.rating,
      comment: mcpArgs.comment,
      suggestion: mcpArgs.suggestion
    }
  }
  
  /**
   * Translate MCP concept request to core format
   */
  translateConceptRequest(mcpArgs: any): ConceptParams {
    return {
      query: mcpArgs.query,
      type: mcpArgs.type,
      limit: mcpArgs.limit || 50,
      context: this.extractContext(mcpArgs)
    }
  }
  
  /**
   * Translate core concept result to MCP format
   */
  translateConceptResponse(result: ConceptResult): any {
    return {
      concepts: result.concepts.map(concept => ({
        id: concept.id,
        name: concept.name,
        type: concept.type,
        description: concept.description,
        metadata: concept.metadata,
        confidence: concept.confidence
      })),
      total: result.total,
      averageConfidence: result.confidence
    }
  }
  
  /**
   * Translate MCP relationship request to core format
   */
  translateRelationshipRequest(mcpArgs: any): RelationshipParams {
    return {
      source: mcpArgs.source,
      target: mcpArgs.target,
      type: mcpArgs.type,
      limit: mcpArgs.limit || 100
    }
  }
  
  /**
   * Translate core relationship result to MCP format
   */
  translateRelationshipResponse(result: RelationshipResult): any {
    // Group relationships by type for better readability
    const byType = new Map<string, any[]>()
    
    for (const rel of result.relationships) {
      if (!byType.has(rel.type)) {
        byType.set(rel.type, [])
      }
      byType.get(rel.type)!.push({
        source: rel.source,
        target: rel.target,
        confidence: rel.confidence,
        metadata: rel.metadata
      })
    }
    
    // Convert to array format
    const types = Array.from(byType.entries()).map(([type, rels]) => ({
      type,
      relationships: rels,
      count: rels.length
    }))
    
    return {
      relationshipTypes: types,
      total: result.total,
      summary: `Found ${result.total} relationships across ${types.length} types`
    }
  }
  
  /**
   * Extract workspace context from MCP arguments
   */
  private extractContext(mcpArgs: any): WorkspaceContext | undefined {
    if (!mcpArgs.workspace && !mcpArgs.rootUri) {
      return undefined
    }
    
    return {
      rootUri: mcpArgs.rootUri || mcpArgs.workspace || process.cwd(),
      workspaceFolders: mcpArgs.workspaceFolders,
      configuration: mcpArgs.configuration
    }
  }
  
  /**
   * Format error for MCP response
   */
  formatError(error: Error): any {
    return {
      error: true,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  }
}