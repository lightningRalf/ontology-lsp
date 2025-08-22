/**
 * MCP Prompt Definitions
 * 
 * Intelligent, context-aware prompts that leverage the 5-layer architecture.
 */

import { Prompt } from "@modelcontextprotocol/sdk/types.js"

export function createPrompts(): Prompt[] {
  return [
    {
      name: "analyze_codebase",
      description: "Comprehensive codebase analysis using all 5 layers",
      arguments: [
        {
          name: "focus",
          description: "Area to focus on (architecture, quality, performance, security)",
          required: false,
        },
        {
          name: "depth",
          description: "Analysis depth (shallow, medium, deep)",
          required: false,
        },
      ],
    },
    
    {
      name: "suggest_refactoring",
      description: "Get refactoring suggestions based on learned patterns",
      arguments: [
        {
          name: "file",
          description: "File to analyze for refactoring opportunities",
          required: true,
        },
        {
          name: "type",
          description: "Type of refactoring to focus on",
          required: false,
        },
      ],
    },
    
    {
      name: "explain_concept",
      description: "Explain a concept from the ontology with examples",
      arguments: [
        {
          name: "concept",
          description: "Concept name to explain",
          required: true,
        },
        {
          name: "level",
          description: "Explanation level (beginner, intermediate, advanced)",
          required: false,
        },
      ],
    },
    
    {
      name: "find_similar_code",
      description: "Find code similar to a given pattern or example",
      arguments: [
        {
          name: "code",
          description: "Code snippet to find similar patterns for",
          required: true,
        },
        {
          name: "threshold",
          description: "Similarity threshold (0-1)",
          required: false,
        },
      ],
    },
    
    {
      name: "optimize_performance",
      description: "Get performance optimization suggestions",
      arguments: [
        {
          name: "target",
          description: "File or function to optimize",
          required: true,
        },
        {
          name: "metrics",
          description: "Performance metrics to focus on",
          required: false,
        },
      ],
    },
    
    {
      name: "detect_issues",
      description: "Detect potential issues and anti-patterns",
      arguments: [
        {
          name: "scope",
          description: "Scope to analyze (file, directory, project)",
          required: false,
        },
        {
          name: "severity",
          description: "Minimum severity to report (low, medium, high)",
          required: false,
        },
      ],
    },
    
    {
      name: "generate_documentation",
      description: "Generate documentation based on code understanding",
      arguments: [
        {
          name: "target",
          description: "Target to document (file, class, function)",
          required: true,
        },
        {
          name: "format",
          description: "Documentation format (markdown, jsdoc, docstring)",
          required: false,
        },
      ],
    },
    
    {
      name: "migration_plan",
      description: "Create a migration plan for framework or library updates",
      arguments: [
        {
          name: "from",
          description: "Current version or framework",
          required: true,
        },
        {
          name: "to",
          description: "Target version or framework",
          required: true,
        },
      ],
    },
    
    {
      name: "architecture_review",
      description: "Review and suggest architectural improvements",
      arguments: [
        {
          name: "component",
          description: "Component or module to review",
          required: false,
        },
        {
          name: "principles",
          description: "Architectural principles to evaluate against",
          required: false,
        },
      ],
    },
    
    {
      name: "test_generation",
      description: "Generate tests based on code analysis",
      arguments: [
        {
          name: "target",
          description: "Code to generate tests for",
          required: true,
        },
        {
          name: "framework",
          description: "Test framework to use",
          required: false,
        },
        {
          name: "coverage",
          description: "Coverage level (basic, comprehensive, edge-cases)",
          required: false,
        },
      ],
    },
  ]
}