#!/usr/bin/env bun
/**
 * Simplified STDIO Server Entry Point
 * 
 * This runs the MCP server with stdio transport, using the CLI as the backend.
 * Much simpler than the layered approach - just delegates to CLI commands.
 */

import { SimpleMCPServer } from "./index-simple.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

async function main() {
  console.error("Starting Ontology MCP Server (CLI-based) with stdio transport...")
  
  const server = new SimpleMCPServer()
  const transport = new StdioServerTransport()
  
  await server.connect(transport)
  
  console.error("MCP Server ready. Using ontology-lsp CLI as backend.")
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error)
  process.exit(1)
})