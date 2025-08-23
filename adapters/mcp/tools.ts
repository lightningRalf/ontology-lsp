/**
 * MCP Tool Definitions
 * These tools are exposed to Claude Code through the MCP protocol
 */

export interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'find_definition',
    description: 'Find where a symbol is defined in the codebase',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol to find (e.g., function name, class name, variable)'
        },
        file: {
          type: 'string',
          description: 'Current file context (optional)'
        },
        line: {
          type: 'number',
          description: 'Current line number (optional)'
        },
        column: {
          type: 'number',
          description: 'Current column number (optional)'
        }
      },
      required: ['symbol']
    }
  },
  
  {
    name: 'find_references',
    description: 'Find all references to a symbol across the codebase',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol to find references for'
        },
        includeDeclaration: {
          type: 'boolean',
          description: 'Include the declaration in results',
          default: false
        },
        includeWrites: {
          type: 'boolean',
          description: 'Include write operations',
          default: true
        },
        includeReads: {
          type: 'boolean',
          description: 'Include read operations',
          default: true
        },
        file: {
          type: 'string',
          description: 'Current file context (optional)'
        }
      },
      required: ['symbol']
    }
  },
  
  {
    name: 'find_implementations',
    description: 'Find implementations of an interface or abstract class',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The interface or abstract class name'
        },
        file: {
          type: 'string',
          description: 'Current file context (optional)'
        }
      },
      required: ['symbol']
    }
  },
  
  {
    name: 'get_hover',
    description: 'Get detailed information about a symbol (type, documentation, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol to get information for'
        },
        file: {
          type: 'string',
          description: 'File containing the symbol'
        },
        line: {
          type: 'number',
          description: 'Line number of the symbol'
        },
        column: {
          type: 'number',
          description: 'Column number of the symbol'
        }
      },
      required: ['symbol', 'file', 'line', 'column']
    }
  },
  
  {
    name: 'get_completions',
    description: 'Get code completion suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: {
          type: 'string',
          description: 'The text typed so far'
        },
        file: {
          type: 'string',
          description: 'Current file'
        },
        line: {
          type: 'number',
          description: 'Current line number'
        },
        column: {
          type: 'number',
          description: 'Current column number'
        },
        triggerCharacter: {
          type: 'string',
          description: 'Character that triggered completion (e.g., ".", "(")'
        }
      },
      required: ['prefix', 'file', 'line', 'column']
    }
  },
  
  {
    name: 'rename_symbol',
    description: 'Rename a symbol across the entire codebase',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol to rename'
        },
        newName: {
          type: 'string',
          description: 'The new name for the symbol'
        },
        file: {
          type: 'string',
          description: 'File containing the symbol'
        },
        line: {
          type: 'number',
          description: 'Line number of the symbol'
        },
        column: {
          type: 'number',
          description: 'Column number of the symbol'
        }
      },
      required: ['symbol', 'newName']
    }
  },
  
  {
    name: 'get_diagnostics',
    description: 'Get code diagnostics (errors, warnings, hints)',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File to analyze (optional, analyzes workspace if not provided)'
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info', 'hint'],
          description: 'Minimum severity level to include'
        }
      }
    }
  },
  
  {
    name: 'learn_pattern',
    description: 'Learn a new code pattern from user actions',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code pattern to learn'
        },
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'use', 'reject'],
          description: 'The action being performed with this pattern'
        },
        context: {
          type: 'string',
          description: 'Additional context about the pattern'
        }
      },
      required: ['code', 'action']
    }
  },
  
  {
    name: 'provide_feedback',
    description: 'Provide feedback on the quality of a previous operation',
    inputSchema: {
      type: 'object',
      properties: {
        operationId: {
          type: 'string',
          description: 'ID of the operation to provide feedback for'
        },
        rating: {
          type: 'string',
          enum: ['positive', 'neutral', 'negative'],
          description: 'Overall rating of the operation'
        },
        comment: {
          type: 'string',
          description: 'Additional comments about the operation'
        },
        suggestion: {
          type: 'string',
          description: 'Suggestions for improvement'
        }
      },
      required: ['operationId', 'rating']
    }
  },
  
  {
    name: 'get_concepts',
    description: 'Get concepts from the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for concepts'
        },
        type: {
          type: 'string',
          enum: ['class', 'function', 'variable', 'module', 'interface', 'type', 'namespace', 'package'],
          description: 'Filter by concept type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 50
        }
      }
    }
  },
  
  {
    name: 'get_relationships',
    description: 'Get relationships between concepts in the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source concept ID or name'
        },
        target: {
          type: 'string',
          description: 'Target concept ID or name'
        },
        type: {
          type: 'string',
          enum: [
            'uses', 'used_by', 
            'extends', 'extended_by',
            'implements', 'implemented_by',
            'imports', 'imported_by',
            'contains', 'contained_by',
            'depends_on', 'depended_on_by'
          ],
          description: 'Filter by relationship type'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 100
        }
      }
    }
  },
  
  // Advanced tools for code understanding
  {
    name: 'analyze_impact',
    description: 'Analyze the impact of changing a symbol',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol to analyze'
        },
        changeType: {
          type: 'string',
          enum: ['rename', 'delete', 'modify_signature', 'change_type'],
          description: 'Type of change being considered'
        }
      },
      required: ['symbol', 'changeType']
    }
  },
  
  {
    name: 'suggest_refactoring',
    description: 'Get refactoring suggestions for a code section',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File to analyze'
        },
        startLine: {
          type: 'number',
          description: 'Start line of code section'
        },
        endLine: {
          type: 'number',
          description: 'End line of code section'
        },
        type: {
          type: 'string',
          enum: ['extract_method', 'extract_variable', 'inline', 'rename', 'simplify'],
          description: 'Type of refactoring to suggest'
        }
      },
      required: ['file', 'startLine', 'endLine']
    }
  },
  
  {
    name: 'find_similar_code',
    description: 'Find code similar to a given pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Code pattern to search for'
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold (0-1)',
          default: 0.7
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 20
        }
      },
      required: ['pattern']
    }
  },
  
  {
    name: 'get_call_hierarchy',
    description: 'Get the call hierarchy for a function',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Function name to analyze'
        },
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both'],
          description: 'Direction of calls to trace',
          default: 'both'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse',
          default: 3
        }
      },
      required: ['symbol']
    }
  },
  
  {
    name: 'get_type_hierarchy',
    description: 'Get the type hierarchy for a class or interface',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Class or interface name'
        },
        direction: {
          type: 'string',
          enum: ['supertypes', 'subtypes', 'both'],
          description: 'Direction of hierarchy to trace',
          default: 'both'
        }
      },
      required: ['symbol']
    }
  }
]