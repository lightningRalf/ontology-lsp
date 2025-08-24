#!/usr/bin/env bun
/**
 * MCP SSE Server - HTTP Server-Sent Events transport for MCP
 * 
 * Provides web-accessible MCP server via SSE for browser-based clients.
 * Uses the unified core through MCP adapter.
 */

import { getEnvironmentConfig } from "../core/config/server-config";
import { MCPAdapter } from "../adapters/mcp-adapter";
import { createCodeAnalyzer } from "../core/index";
import { createDefaultCoreConfig } from "../adapters/utils";

const config = getEnvironmentConfig();
const PORT = process.env.MCP_SSE_PORT || config.ports.mcpSSE;
const HOST = process.env.MCP_SSE_HOST || config.host;

// Session management
const sessions = new Map<string, {
  adapter: MCPAdapter;
  lastActivity: number;
}>();

// Clean up inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > 300000) { // 5 minutes
      sessions.delete(id);
    }
  }
}, 60000);

async function createSession(): Promise<{ id: string; adapter: MCPAdapter }> {
  const id = crypto.randomUUID();
  
  // Create core analyzer
  const coreConfig = createDefaultCoreConfig();
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  
  const coreAnalyzer = await createCodeAnalyzer({
    ...coreConfig,
    workspaceRoot
  });
  
  await coreAnalyzer.initialize();
  
  // Create MCP adapter
  const adapter = new MCPAdapter(coreAnalyzer);
  
  sessions.set(id, {
    adapter,
    lastActivity: Date.now()
  });
  
  return { id, adapter };
}

async function main() {
  console.log(`Starting Ontology MCP SSE Server on ${HOST}:${PORT}`);
  
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    
    async fetch(request: Request) {
      const url = new URL(request.url);
      
      // CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      
      // Handle preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }
      
      try {
        switch (url.pathname) {
          case "/":
            return new Response(
              JSON.stringify({
                name: "ontology-lsp-mcp-sse",
                version: "1.0.0",
                transport: "sse",
                status: "running",
                endpoints: {
                  connect: "/connect",
                  tools: "/tools",
                  health: "/health",
                },
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
            
          case "/health":
            return new Response(
              JSON.stringify({
                status: "healthy",
                timestamp: new Date().toISOString(),
                sessions: sessions.size,
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
            
          case "/connect":
            // Create new session
            const { id, adapter } = await createSession();
            
            return new Response(
              JSON.stringify({
                sessionId: id,
                tools: adapter.getTools(),
              }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
            
          case "/tools":
            // Handle tool calls
            if (request.method !== "POST") {
              return new Response("Method not allowed", {
                status: 405,
                headers: corsHeaders,
              });
            }
            
            const sessionId = url.searchParams.get("sessionId");
            if (!sessionId || !sessions.has(sessionId)) {
              return new Response(
                JSON.stringify({ error: "Invalid or expired session" }),
                {
                  status: 401,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                }
              );
            }
            
            const session = sessions.get(sessionId)!;
            session.lastActivity = Date.now();
            
            const body = await request.json();
            const { tool, arguments: args } = body;
            
            try {
              const result = await session.adapter.handleToolCall(tool, args || {});
              return new Response(
                JSON.stringify(result),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                }
              );
            } catch (error) {
              return new Response(
                JSON.stringify({
                  error: error instanceof Error ? error.message : "Tool execution failed",
                }),
                {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                }
              );
            }
            
          default:
            return new Response("Not found", {
              status: 404,
              headers: corsHeaders,
            });
        }
      } catch (error) {
        console.error("Server error:", error);
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
        );
      }
    },
    
    error(error: Error) {
      console.error("Server error:", error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });
  
  console.log(`
🚀 Ontology MCP SSE Server is running!

Endpoints:
- Health:  http://${HOST}:${PORT}/health
- Connect: http://${HOST}:${PORT}/connect
- Tools:   http://${HOST}:${PORT}/tools

Usage:
1. POST to /connect to get a session ID
2. Use session ID for tool calls to /tools?sessionId=xxx
  `);
  
  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down SSE server...");
    server.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    console.log("\nShutting down SSE server...");
    server.stop();
    process.exit(0);
  });
}

// Run the server
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});