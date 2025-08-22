#!/usr/bin/env bun
/**
 * STDIO Server Entry Point
 * 
 * Runs the MCP server with standard input/output transport.
 * Compatible with Claude Desktop and other MCP clients.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { OntologyMCPServer } from "./index.ts"

async function main() {
  console.error("Starting Ontology MCP Server with stdio transport...")
  
  // Create the MCP server
  const server = new OntologyMCPServer()
  
  // Create stdio transport
  const transport = new StdioServerTransport()
  
  // Connect and run
  await server.connect(transport)
  
  console.error("Ontology MCP Server (stdio) is running")
  console.error("Ready to receive MCP requests via stdin")
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.error("\nShutting down stdio server...")
    process.exit(0)
  })
  
  process.on("SIGTERM", () => {
    console.error("\nShutting down stdio server...")
    process.exit(0)
  })
}

// Run the server
main().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})