#!/usr/bin/env bun
/**
 * Test script for MCP server
 * Run this to test the MCP adapter without Claude Desktop
 */

import { spawn } from 'child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function testMCPServer() {
  console.log('🚀 Starting MCP server test...')
  
  try {
    // Start the MCP server as a subprocess
    const serverProcess = spawn('bun', ['run', 'adapters/mcp/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    // Create MCP client
    const transport = new StdioClientTransport({
      command: 'bun',
      args: ['run', 'adapters/mcp/index.ts']
    })
    
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    })
    
    // Connect to server
    await client.connect(transport)
    console.log('✅ Connected to MCP server')
    
    // List available tools
    const tools = await client.listTools()
    console.log(`\n📦 Available tools: ${tools.tools.length}`)
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`)
    })
    
    // Test find_definition
    console.log('\n🔍 Testing find_definition...')
    const defResult = await client.callTool('find_definition', {
      symbol: 'CodeAnalyzer'
    })
    console.log('Result:', JSON.stringify(defResult, null, 2))
    
    // Test find_references
    console.log('\n🔍 Testing find_references...')
    const refResult = await client.callTool('find_references', {
      symbol: 'findDefinition'
    })
    console.log('Result:', JSON.stringify(refResult, null, 2))
    
    // Test get_concepts
    console.log('\n🧠 Testing get_concepts...')
    const conceptResult = await client.callTool('get_concepts', {
      query: 'Layer',
      limit: 5
    })
    console.log('Result:', JSON.stringify(conceptResult, null, 2))
    
    // Clean up
    await transport.close()
    serverProcess.kill()
    
    console.log('\n✅ All tests completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Alternative simple test without client SDK
async function simpleTest() {
  console.log('\n📝 Simple MCP server test (stdio communication)...')
  
  const { spawn } = require('child_process')
  const server = spawn('bun', ['run', 'adapters/mcp/index.ts'])
  
  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  }
  
  server.stdin.write(JSON.stringify(initRequest) + '\n')
  
  // Listen for responses
  server.stdout.on('data', (data) => {
    console.log('Response:', data.toString())
  })
  
  server.stderr.on('data', (data) => {
    console.error('Error:', data.toString())
  })
  
  // Send list tools request after a delay
  setTimeout(() => {
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }
    server.stdin.write(JSON.stringify(listToolsRequest) + '\n')
  }, 1000)
  
  // Send tool call request
  setTimeout(() => {
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'find_definition',
        arguments: {
          symbol: 'TestSymbol'
        }
      }
    }
    server.stdin.write(JSON.stringify(toolCallRequest) + '\n')
  }, 2000)
  
  // Clean up after 5 seconds
  setTimeout(() => {
    server.kill()
    console.log('\n✅ Simple test completed')
    process.exit(0)
  }, 5000)
}

// Run the appropriate test based on command line args
if (process.argv.includes('--simple')) {
  simpleTest()
} else {
  testMCPServer()
}