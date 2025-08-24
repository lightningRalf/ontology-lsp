/**
 * MCP Tool Definitions
 * 
 * Exposes the full power of the 5-layer ontology system through MCP tools.
 * Tools are organized by capability and performance characteristics.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js"

export function createTools(): Tool[] {
  return [
    // Fast search tools (Layer 1: Claude Tools - 5ms)
    {
      name: "search_files",
      description: "Fast file search using glob patterns and content matching",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern for file matching (e.g., '**/*.ts')",
          },
          content: {
            type: "string",
            description: "Optional content to search for within files",
          },
          workspace: {
            type: "string",
            description: "Workspace directory (defaults to current)",
          },
        },
        required: ["pattern"],
      },
    },
    
    {
      name: "grep_content",
      description: "Fast content search with regex support",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for",
          },
          files: {
            type: "string",
            description: "File glob pattern to search within",
          },
          context: {
            type: "number",
            description: "Number of context lines to include",
            default: 2,
          },
        },
        required: ["pattern"],
      },
    },

    // Semantic analysis tools (Layer 2: Tree-sitter - 50ms)
    {
      name: "find_definition",
      description: "Find symbol definition with fuzzy matching and semantic understanding",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol name to find (supports fuzzy matching)",
          },
          file: {
            type: "string",
            description: "Current file context",
          },
          position: {
            type: "object",
            properties: {
              line: { type: "number" },
              character: { type: "number" },
            },
            description: "Cursor position for context",
          },
        },
        required: ["symbol"],
      },
    },

    {
      name: "find_references",
      description: "Find all references to a symbol across the codebase",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol to find references for",
          },
          includeDeclaration: {
            type: "boolean",
            description: "Include the declaration in results",
            default: false,
          },
          scope: {
            type: "string",
            enum: ["workspace", "file", "function"],
            description: "Search scope",
            default: "workspace",
          },
        },
        required: ["symbol"],
      },
    },

    {
      name: "analyze_complexity",
      description: "Analyze code complexity and suggest improvements",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "File to analyze",
          },
          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["cyclomatic", "cognitive", "halstead", "maintainability"],
            },
            description: "Complexity metrics to calculate",
          },
        },
        required: ["file"],
      },
    },

    // Ontology tools (Layer 3: Ontology Engine - 10ms)
    {
      name: "find_related_concepts",
      description: "Find concepts related to a given symbol or pattern",
      inputSchema: {
        type: "object",
        properties: {
          concept: {
            type: "string",
            description: "Concept or symbol to find relations for",
          },
          relationTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["uses", "usedBy", "extends", "implements", "similar", "dependency"],
            },
            description: "Types of relationships to include",
          },
          depth: {
            type: "number",
            description: "Depth of relationship traversal",
            default: 2,
          },
        },
        required: ["concept"],
      },
    },

    {
      name: "analyze_dependencies",
      description: "Analyze dependency graph and detect issues",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "File or module to analyze dependencies for",
          },
          detectCycles: {
            type: "boolean",
            description: "Detect circular dependencies",
            default: true,
          },
          includeTransitive: {
            type: "boolean",
            description: "Include transitive dependencies",
            default: false,
          },
        },
        required: ["target"],
      },
    },

    // Pattern tools (Layer 4: Pattern Learner - 10ms)
    {
      name: "detect_patterns",
      description: "Detect design patterns and anti-patterns in code",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: "Directory or file to analyze",
          },
          patterns: {
            type: "array",
            items: {
              type: "string",
              enum: ["singleton", "factory", "observer", "strategy", "adapter", "antipatterns"],
            },
            description: "Patterns to detect",
          },
          minConfidence: {
            type: "number",
            description: "Minimum confidence threshold (0-1)",
            default: 0.7,
          },
        },
        required: ["scope"],
      },
    },

    {
      name: "suggest_refactoring",
      description: "Suggest refactoring based on learned patterns",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "File to analyze for refactoring",
          },
          types: {
            type: "array",
            items: {
              type: "string",
              enum: ["extract", "inline", "rename", "move", "simplify", "optimize"],
            },
            description: "Types of refactoring to consider",
          },
          autoApply: {
            type: "boolean",
            description: "Generate applicable patches",
            default: false,
          },
        },
        required: ["file"],
      },
    },

    {
      name: "learn_pattern",
      description: "Learn a new pattern from user's refactoring",
      inputSchema: {
        type: "object",
        properties: {
          before: {
            type: "string",
            description: "Code before refactoring",
          },
          after: {
            type: "string",
            description: "Code after refactoring",
          },
          name: {
            type: "string",
            description: "Name for this pattern",
          },
          description: {
            type: "string",
            description: "Description of the pattern",
          },
        },
        required: ["before", "after", "name"],
      },
    },

    // Propagation tools (Layer 5: Knowledge Spreader - 20ms)
    {
      name: "rename_symbol",
      description: "Rename symbol with intelligent propagation across related concepts",
      inputSchema: {
        type: "object",
        properties: {
          oldName: {
            type: "string",
            description: "Current symbol name",
          },
          newName: {
            type: "string",
            description: "New symbol name",
          },
          scope: {
            type: "string",
            enum: ["exact", "related", "similar"],
            description: "Propagation scope",
            default: "exact",
          },
          preview: {
            type: "boolean",
            description: "Preview changes without applying",
            default: true,
          },
        },
        required: ["oldName", "newName"],
      },
    },

    {
      name: "apply_refactoring",
      description: "Apply refactoring with intelligent change propagation",
      inputSchema: {
        type: "object",
        properties: {
          refactoring: {
            type: "object",
            description: "Refactoring specification",
            properties: {
              type: {
                type: "string",
                enum: ["extract", "inline", "move", "rename"],
              },
              target: {
                type: "string",
                description: "Target element",
              },
              parameters: {
                type: "object",
                description: "Refactoring-specific parameters",
              },
            },
            required: ["type", "target"],
          },
          propagate: {
            type: "boolean",
            description: "Propagate changes to related code",
            default: true,
          },
        },
        required: ["refactoring"],
      },
    },

    {
      name: "extract_interface",
      description: "Extract interface with automatic implementation updates",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source class or object",
          },
          name: {
            type: "string",
            description: "Interface name",
          },
          members: {
            type: "array",
            items: { type: "string" },
            description: "Members to include in interface",
          },
          updateImplementations: {
            type: "boolean",
            description: "Update existing implementations",
            default: true,
          },
        },
        required: ["source", "name"],
      },
    },

    // Multi-layer tools
    {
      name: "explain_code",
      description: "Explain code using semantic and ontological understanding",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Code snippet to explain",
          },
          file: {
            type: "string",
            description: "File context",
          },
          level: {
            type: "string",
            enum: ["basic", "intermediate", "advanced"],
            description: "Explanation detail level",
            default: "intermediate",
          },
        },
        required: ["code"],
      },
    },

    {
      name: "optimize_performance",
      description: "Analyze and optimize code performance using learned patterns",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "File or function to optimize",
          },
          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["time", "memory", "complexity", "io"],
            },
            description: "Performance aspects to optimize",
          },
          constraints: {
            type: "object",
            description: "Optimization constraints",
            properties: {
              maintainApi: { type: "boolean", default: true },
              maxComplexity: { type: "number" },
            },
          },
        },
        required: ["target"],
      },
    },

    {
      name: "generate_tests",
      description: "Generate tests based on code understanding and patterns",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "File or function to generate tests for",
          },
          framework: {
            type: "string",
            enum: ["bun", "jest", "vitest", "mocha", "auto"],
            description: "Test framework to use",
            default: "auto",
          },
          coverage: {
            type: "string",
            enum: ["basic", "comprehensive", "edge-cases"],
            description: "Test coverage level",
            default: "comprehensive",
          },
        },
        required: ["target"],
      },
    },
  ]
}