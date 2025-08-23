#!/usr/bin/env bun
/**
 * Test MCP stdio server connection
 */

import { spawn } from "child_process"

// Start the stdio server
const server = spawn("/home/lightningralf/.bun/bin/bun", ["run", "src/stdio.ts"], {
  cwd: "./mcp-ontology-server",
  stdio: ["pipe", "pipe", "pipe"],
})

// Handle server output
let responseBuffer = ""
server.stdout.on("data", (data) => {
  responseBuffer += data.toString()
  const lines = responseBuffer.split("\n")
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    if (line && line.startsWith("{")) {
      try {
        const response = JSON.parse(line)
        console.log("Response:", JSON.stringify(response, null, 2))
      } catch (e) {
        // Not JSON, skip
      }
    }
  }
  responseBuffer = lines[lines.length - 1]
})

server.stderr.on("data", (data) => {
  console.error("Server log:", data.toString())
})

// Send initialize request
const initRequest = {
  jsonrpc: "2.0",
  method: "initialize",
  id: 1,
  params: {
    protocolVersion: "0.1.0",
    capabilities: {},
    clientInfo: {
      name: "test-client",
      version: "1.0.0",
    },
  },
}

console.log("Sending initialize request...")
server.stdin.write(JSON.stringify(initRequest) + "\n")

// Send tools/list request after a delay
setTimeout(() => {
  const toolsRequest = {
    jsonrpc: "2.0",
    method: "tools/list",
    id: 2,
    params: {},
  }
  
  console.log("Sending tools/list request...")
  server.stdin.write(JSON.stringify(toolsRequest) + "\n")
}, 1000)

// Send a test tool call after 2 seconds
setTimeout(() => {
  const toolCall = {
    jsonrpc: "2.0",
    method: "tools/call",
    id: 3,
    params: {
      name: "search_files",
      arguments: {
        pattern: "**/*.ts",
        workspace: ".",
      },
    },
  }
  
  console.log("Sending search_files tool call...")
  server.stdin.write(JSON.stringify(toolCall) + "\n")
}, 2000)

// Kill after 4 seconds
setTimeout(() => {
  console.log("Test complete, shutting down...")
  server.kill()
  process.exit(0)
}, 4000)