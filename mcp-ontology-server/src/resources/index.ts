/**
 * MCP Resource Definitions
 * 
 * Exposes ontology state and codebase insights as MCP resources.
 */

import { Resource } from "@modelcontextprotocol/sdk/types.js"
import type { LayerOrchestrator } from "../layers/orchestrator.js"

export async function createResources(orchestrator: LayerOrchestrator): Promise<Resource[]> {
  return [
    // Ontology resources
    {
      uri: "ontology://concepts",
      name: "Ontology Concepts",
      description: "All concepts in the ontology knowledge graph",
      mimeType: "application/json",
    },
    
    {
      uri: "ontology://relationships",
      name: "Concept Relationships",
      description: "Relationships between concepts in the ontology",
      mimeType: "application/json",
    },
    
    {
      uri: "ontology://graph",
      name: "Knowledge Graph",
      description: "Complete ontology knowledge graph structure",
      mimeType: "application/json",
    },
    
    // Pattern resources
    {
      uri: "patterns://learned",
      name: "Learned Patterns",
      description: "Refactoring patterns learned from developer actions",
      mimeType: "application/json",
    },
    
    {
      uri: "patterns://candidates",
      name: "Pattern Candidates",
      description: "Code locations that could benefit from learned patterns",
      mimeType: "application/json",
    },
    
    {
      uri: "patterns://history",
      name: "Pattern History",
      description: "History of pattern learning and applications",
      mimeType: "application/json",
    },
    
    // Knowledge resources
    {
      uri: "knowledge://propagations",
      name: "Recent Propagations",
      description: "Recent knowledge and change propagations",
      mimeType: "application/json",
    },
    
    {
      uri: "knowledge://impact",
      name: "Impact Analysis",
      description: "Impact analysis for recent changes",
      mimeType: "application/json",
    },
    
    // Statistics resources
    {
      uri: "stats://performance",
      name: "Performance Statistics",
      description: "Performance metrics for all layers",
      mimeType: "application/json",
    },
    
    {
      uri: "stats://usage",
      name: "Usage Statistics",
      description: "Usage statistics and patterns",
      mimeType: "application/json",
    },
    
    // Codebase resources
    {
      uri: "codebase://summary",
      name: "Codebase Summary",
      description: "High-level summary of the codebase structure",
      mimeType: "application/json",
    },
    
    {
      uri: "codebase://quality",
      name: "Code Quality Metrics",
      description: "Code quality metrics and technical debt analysis",
      mimeType: "application/json",
    },
    
    {
      uri: "codebase://dependencies",
      name: "Dependency Graph",
      description: "Complete dependency graph of the codebase",
      mimeType: "application/json",
    },
    
    {
      uri: "codebase://architecture",
      name: "Architecture Overview",
      description: "Architectural patterns and structure",
      mimeType: "application/json",
    },
  ]
}