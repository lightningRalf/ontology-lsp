#!/usr/bin/env bun
/**
 * Test MCP SSE server connection and event streaming
 */

// Test SSE endpoint with EventSource
async function testSSE() {
  console.log("Testing SSE endpoint...")
  
  // Test the SSE endpoint with a direct HTTP request
  const response = await fetch("http://localhost:7001/mcp/sse", {
    headers: {
      "Accept": "text/event-stream",
    },
  })
  
  if (!response.ok) {
    console.error("SSE endpoint failed:", response.status, response.statusText)
    return
  }
  
  console.log("SSE endpoint connected successfully")
  console.log("Headers:", Object.fromEntries(response.headers.entries()))
  
  // Read first few chunks of the stream
  const reader = response.body?.getReader()
  if (!reader) {
    console.error("No reader available")
    return
  }
  
  const decoder = new TextDecoder()
  let chunks = 0
  
  while (chunks < 5) {
    const { done, value } = await reader.read()
    if (done) break
    
    const text = decoder.decode(value)
    console.log(`Chunk ${chunks + 1}:`, text)
    chunks++
  }
  
  reader.cancel()
}

// Test MCP protocol over SSE
async function testMCPOverSSE() {
  console.log("\nTesting MCP protocol over SSE...")
  
  // Send an initialize request
  const initRequest = {
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "0.1.0",
      capabilities: {},
      clientInfo: {
        name: "test-sse-client",
        version: "1.0.0",
      },
    },
  }
  
  // POST the request to the SSE endpoint
  const response = await fetch("http://localhost:7001/mcp/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(initRequest),
  })
  
  const responseText = await response.text()
  console.log("Response status:", response.status)
  console.log("Response body:", responseText)
  
  if (!response.ok) {
    console.error("MCP message endpoint failed:", response.status, response.statusText)
    return
  }
  
  let result
  try {
    result = JSON.parse(responseText)
  } catch (e) {
    console.error("Failed to parse JSON:", e)
    return
  }
  console.log("Initialize response:", JSON.stringify(result, null, 2))
  
  // Test tools/list
  const toolsRequest = {
    jsonrpc: "2.0",
    method: "tools/list",
    id: 2,
    params: {},
  }
  
  const toolsResponse = await fetch("http://localhost:7001/mcp/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toolsRequest),
  })
  
  if (toolsResponse.ok) {
    const toolsResult = await toolsResponse.json()
    console.log(`Found ${toolsResult.result?.tools?.length || 0} tools`)
  }
}

// Run tests
async function main() {
  await testSSE()
  await testMCPOverSSE()
}

main().catch(console.error)