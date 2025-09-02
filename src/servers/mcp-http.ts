#!/usr/bin/env bun

/**
 * MCP Streamable HTTP Server - replaces SSE
 *
 * Implements the MCP server over the Streamable HTTP transport using Express.
 * Session management is handled via the `Mcp-Session-Id` header as per SDK docs.
 *
 * All analysis work is delegated to the unified core via our MCPAdapter.
 */

import express from 'express';
import { EventEmitter } from 'events';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { overlayStore } from '../core/overlay-store.js';

import { MCPAdapter } from '../adapters/mcp-adapter.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { getEnvironmentConfig } from '../core/config/server-config.js';
import { createCodeAnalyzer } from '../core/index';
import type { CodeAnalyzer } from '../core/unified-analyzer';

type SessionRecord = {
  server: Server;
  transport: StreamableHTTPServerTransport;
  analyzer: CodeAnalyzer;
  adapter: MCPAdapter;
};

const cfg = getEnvironmentConfig();
const PORT = Number(process.env.MCP_HTTP_PORT || cfg.ports.mcpHTTP || 7001);
const HOST = process.env.MCP_HTTP_HOST || cfg.host || 'localhost';

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  })
);

// In-memory session map
const sessions: Record<string, SessionRecord> = {};
const mcpEvents = new EventEmitter();

async function createMcpServer(): Promise<SessionRecord> {
  // Initialize core analyzer
  const coreConfig = createDefaultCoreConfig();
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const analyzer = await createCodeAnalyzer({ ...coreConfig, workspaceRoot });
  await analyzer.initialize();

  // Create adapter and low-level server with handlers
  const adapter = new MCPAdapter(analyzer);
  const server = new Server(
    { name: 'ontology-lsp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // Register request handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: adapter.getTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const sid = transport.sessionId || 'unknown';
      mcpEvents.emit('toolCall', { sessionId: sid, name, args, ts: Date.now() });
      return await adapter.handleToolCall(name, args || {});
    } catch (error) {
      const sid = transport.sessionId || 'unknown';
      mcpEvents.emit('toolError', { sessionId: sid, name, error: error instanceof Error ? error.message : String(error), ts: Date.now() });
      throw new McpError(
        ErrorCode.InternalError,
        `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Create transport (session id assigned on first initialize)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      // Attach after connect
    },
  });

  // Connect server to transport
  await server.connect(transport);

  // Resource handlers (monitoring + snapshot resources)
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: 'monitoring://summary', name: 'monitoring', title: 'Monitoring Summary', description: 'System health and layer stats', mimeType: 'application/json' },
    ],
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { name: 'snapshot-diff', uriTemplate: 'snapshot://{id}/overlay.diff', title: 'Snapshot Patch Diff', description: 'Staged diff for a snapshot', mimeType: 'text/plain' },
      { name: 'snapshot-status', uriTemplate: 'snapshot://{id}/status', title: 'Snapshot Status', description: 'Snapshot metadata and staged changes', mimeType: 'application/json' },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uriStr = request.params.uri;
    try {
      const uri = new URL(uriStr);
      if (uri.protocol === 'monitoring:') {
        const stats = await (analyzer as any).getDetailedStats?.();
        const body = JSON.stringify(stats || {}, null, 2);
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: body }] } as any;
      }
      if (uri.protocol === 'snapshot:') {
        const parts = uri.pathname.split('/').filter(Boolean);
        const id = parts[0];
        const tail = parts[1];
        if (!id) throw new Error('Missing snapshot id');
        if (tail === 'overlay.diff') {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const ensure = (overlayStore as any).ensureMaterialized?.bind(overlayStore);
          const dir = ensure ? await ensure(id) : undefined;
          const diffPath = path.join(dir || '', 'overlay.diff');
          let text = '';
          try { text = await fs.readFile(diffPath, 'utf8'); } catch { text = '# No overlay.diff found in snapshot'; }
          return { contents: [{ uri: uri.href, mimeType: 'text/plain', text }] } as any;
        }
        if (tail === 'status') {
          const snaps = (overlayStore as any).list?.() || [];
          const snap = snaps.find((s: any) => s.id === id) || null;
          const body = JSON.stringify({ id, exists: !!snap, diffCount: snap?.diffs?.length || 0, createdAt: snap?.createdAt || null }, null, 2);
          return { contents: [{ uri: uri.href, mimeType: 'application/json', text: body }] } as any;
        }
      }
      throw new McpError(ErrorCode.InvalidParams, `Unsupported resource ${uriStr}`);
    } catch (e) {
      throw new McpError(ErrorCode.InternalError, e instanceof Error ? e.message : String(e));
    }
  });

  return { server, transport, analyzer, adapter };
}

// POST /mcp - client -> server
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = (req.headers['mcp-session-id'] as string | undefined) || undefined;

    let record: SessionRecord | undefined;
    if (sessionId && sessions[sessionId]) {
      record = sessions[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      record = await createMcpServer();
      const transport = record.transport;
      // When session is initialized, store it
      transport.onsessioninitialized = (sid: string) => {
        sessions[sid] = record!;
      };
      transport.onclose = () => {
        if (transport.sessionId) delete sessions[transport.sessionId];
      };
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    await record!.transport.handleRequest(req as any, res as any, req.body);

    // After handling initialize, Streamable HTTP transport may have assigned a session ID
    // Ensure it's stored so subsequent requests can resolve the session without requiring
    // a prior GET /mcp handshake (fixes chicken-and-egg for list/call via HTTP)
    const sid = (record!.transport as any).sessionId as string | undefined;
    if (sid && !sessions[sid]) {
      sessions[sid] = record!;
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

// GET /mcp - server -> client notifications stream
app.get('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string | undefined) || undefined;
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await sessions[sessionId].transport.handleRequest(req as any, res as any);
});

// SSE stream of MCP tool events for live monitoring
app.get('/mcp-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    const ts = typeof data?.ts === 'number' ? data.ts : Date.now();
    const payload = { ...data, ts, iso: new Date(ts).toISOString() };
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onCall = (payload: any) => send('toolCall', payload);
  const onErr = (payload: any) => send('toolError', payload);

  mcpEvents.on('toolCall', onCall);
  mcpEvents.on('toolError', onErr);

  // heartbeat
  const hb = setInterval(() => send('heartbeat', { }), 15000);

  req.on('close', () => {
    clearInterval(hb);
    mcpEvents.off('toolCall', onCall);
    mcpEvents.off('toolError', onErr);
    res.end();
  });
});

// DELETE /mcp - end session
app.delete('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string | undefined) || undefined;
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  try {
    const transport = sessions[sessionId].transport;
    transport.close();
  } finally {
    delete sessions[sessionId];
    res.status(204).end();
  }
});

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', sessions: Object.keys(sessions).length, timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`MCP Streamable HTTP server listening at http://${HOST}:${PORT}`);
});
