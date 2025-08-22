#!/usr/bin/env bun
/**
 * SSE Server Entry Point
 * 
 * Runs the MCP server with Server-Sent Events transport for real-time communication.
 * Perfect for web-based IDEs and collaborative features.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { BunSSEServerTransport } from "../../bun-mcp-sse-transport/src/index.ts"
import { OntologyMCPServer } from "./index.js"
import { getEnvironmentConfig } from "./config/server-config.js"

const config = getEnvironmentConfig()
const PORT = process.env.MCP_SSE_PORT || config.ports.mcpSSE
const HOST = process.env.MCP_SSE_HOST || config.host

async function main() {
  console.log(`Starting Ontology MCP Server with SSE transport on ${HOST}:${PORT}`)
  
  // Create the MCP server
  const mcpServer = new OntologyMCPServer()
  
  // Create SSE transport
  const transport = new BunSSEServerTransport("/mcp/messages")
  
  // Create HTTP server with SSE endpoints
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    
    async fetch(request: Request) {
      const url = new URL(request.url)
      
      // CORS headers for browser access
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
      
      // Handle preflight requests
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        })
      }
      
      try {
        switch (url.pathname) {
          case "/":
            // Health check / info endpoint
            return new Response(
              JSON.stringify({
                name: "ontology-lsp-mcp",
                version: "1.0.0",
                transport: "sse",
                status: "running",
                endpoints: {
                  sse: "/mcp/sse",
                  messages: "/mcp/messages",
                  health: "/health",
                },
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            )
            
          case "/health":
            // Health check endpoint
            return new Response(
              JSON.stringify({
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            )
            
          case "/mcp/sse":
            // SSE connection endpoint
            console.log("New SSE connection established")
            const response = await transport.createResponse()
            
            // Add CORS headers to SSE response
            response.headers.set("Access-Control-Allow-Origin", "*")
            
            // Connect transport to MCP server
            await mcpServer.connect(transport as any)
            
            return response
            
          case "/mcp/messages":
            // Message posting endpoint
            if (request.method !== "POST") {
              return new Response("Method not allowed", {
                status: 405,
                headers: corsHeaders,
              })
            }
            
            const result = await transport.handlePostMessage(request)
            
            // Add CORS headers to response
            if (result.headers) {
              Object.entries(corsHeaders).forEach(([key, value]) => {
                result.headers.set(key, value)
              })
            }
            
            return result
            
          default:
            return new Response("Not found", {
              status: 404,
              headers: corsHeaders,
            })
        }
      } catch (error) {
        console.error("Server error:", error)
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Internal server error",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        )
      }
    },
    
    error(error: Error) {
      console.error("Server error:", error)
      return new Response("Internal Server Error", { status: 500 })
    },
  })
  
  console.log(`
🚀 Ontology MCP Server (SSE) is running!

Endpoints:
- Health:    http://${HOST}:${PORT}/health
- SSE:       http://${HOST}:${PORT}/mcp/sse
- Messages:  http://${HOST}:${PORT}/mcp/messages

To connect from a client:
1. Open SSE connection to /mcp/sse
2. Get the session ID from the 'endpoint' event
3. Send JSON-RPC messages to /mcp/messages with the session ID

Example client code:
\`\`\`javascript
const eventSource = new EventSource('http://${HOST}:${PORT}/mcp/sse')
let sessionId = null

eventSource.addEventListener('endpoint', (e) => {
  const url = new URL(e.data)
  sessionId = url.searchParams.get('sessionId')
  console.log('Connected with session:', sessionId)
})

eventSource.addEventListener('message', (e) => {
  const message = JSON.parse(e.data)
  console.log('Received:', message)
})

// Send a message
fetch('http://${HOST}:${PORT}/mcp/messages?sessionId=' + sessionId, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  })
})
\`\`\`
  `)
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down SSE server...")
    server.stop()
    process.exit(0)
  })
  
  process.on("SIGTERM", () => {
    console.log("\nShutting down SSE server...")
    server.stop()
    process.exit(0)
  })
}

// Run the server
main().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})