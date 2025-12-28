#!/usr/bin/env bun

/**
 * MCP Streamable HTTP Server - replaces SSE
 *
 * Implements the MCP server over the Streamable HTTP transport using Express.
 * Session management is handled via the `Mcp-Session-Id` header as per SDK docs.
 *
 * All analysis work is delegated to the unified core via our MCPAdapter.
 */

import { randomUUID } from 'node:crypto';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    isInitializeRequest,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { EventEmitter } from 'events';
import express from 'express';
import { z } from 'zod';
import { toMcpError } from '../adapters/error-mapper.js';
import { MCPAdapter } from '../adapters/mcp-adapter.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { getEnvironmentConfig } from '../core/config/server-config.js';
import { isCoreError } from '../core/errors.js';
import { createCodeAnalyzer } from '../core/index';
import { overlayStore } from '../core/overlay-store.js';
import { ToolExecutor } from '../core/tools/executor.js';
import type { CodeAnalyzer } from '../core/unified-analyzer';
import { metricsRegistry, recordToolEnd, recordToolStart } from '../instrumentation/metrics.js';
import { registerCommonPrompts, registerCommonResources } from './mcp-shared.js';

type SessionRecord = {
    server: Server;
    transport: StreamableHTTPServerTransport;
    analyzer: CodeAnalyzer;
    adapter: MCPAdapter;
};

const cfg = getEnvironmentConfig();
const HOST = process.env.MCP_HTTP_HOST || cfg.host || 'localhost';
const PORT = Number(process.env.MCP_HTTP_PORT || cfg.ports.mcpHTTP || 7001);

const app = express();
app.use(express.json());
app.use(
    cors({
        origin: '*',
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
    })
);

// Prometheus metrics endpoint for MCP HTTP adapter
app.get('/metrics', (_req, res) => {
    const text = metricsRegistry.renderPrometheusText();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(text);
});

// In-memory session map
const sessions: Record<string, SessionRecord> = {};
const mcpEvents = new EventEmitter();

async function createMcpServer(desiredSid?: string): Promise<SessionRecord> {
    // Initialize core analyzer
    const coreConfig = createDefaultCoreConfig();
    coreConfig.monitoring.enabled = false; // disable periodic metrics for MCP HTTP dogfooding
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
    const analyzer = await createCodeAnalyzer({ ...coreConfig, workspaceRoot });
    await analyzer.initialize();

    // Create adapter and low-level server with handlers
    const adapter = new MCPAdapter(analyzer);
    const executor = new ToolExecutor();
    const server = new Server(
        { name: 'ontology-lsp', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    // Register request handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: adapter.getTools() }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const t0 = Date.now();
            const sid = transport.sessionId || 'unknown';
            mcpEvents.emit('toolCall', { sessionId: sid, name, args, ts: Date.now() });
            recordToolStart('mcp_http');
            const out = await executor.execute(adapter, name, (args || {}) as Record<string, any>);
            try {
                // success if adapter didn't set isError=true
                const success = !(
                    (out && typeof out === 'object' && 'isError' in out && (out as any).isError) ||
                    false
                );
                recordToolEnd('mcp_http', String(name || 'unknown'), Date.now() - t0, success);
            } catch {}
            return out;
        } catch (error) {
            const sid = transport.sessionId || 'unknown';
            mcpEvents.emit('toolError', {
                sessionId: sid,
                name,
                error: error instanceof Error ? error.message : String(error),
                ts: Date.now(),
            });
            try {
                recordToolEnd('mcp_http', String(name || 'unknown'), 0, false);
            } catch {}
            if (isCoreError(error) || error instanceof McpError) {
                throw toMcpError(error);
            }
            throw new McpError(
                ErrorCode.InternalError,
                `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });

    // Create transport (session id assigned on first initialize)
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => desiredSid || randomUUID(),
        onsessioninitialized: (sessionId) => {
            // Attach after connect
        },
    });

    // Connect server to transport
    await server.connect(transport);

    // Prompts and resources (shared module) — guard for SDKs without prompt support
    try {
        // @ts-expect-error: older SDKs may not have registerPrompt
        if (typeof (server as any).registerPrompt === 'function') {
            registerCommonPrompts(server);
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[MCP HTTP] Prompts registration skipped:', (e as Error)?.message || String(e));
    }
    try {
        registerCommonResources(server);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[MCP HTTP] Resources registration skipped:', (e as Error)?.message || String(e));
    }

    return { server, transport, analyzer, adapter };
}

// POST /mcp - client -> server
app.post('/mcp', async (req, res) => {
    try {
        const sessionId = (req.headers['mcp-session-id'] as string | undefined) || undefined;

        let record: SessionRecord | undefined;
        if (sessionId && sessions[sessionId]) {
            record = sessions[sessionId];
        } else if (!sessionId && (isInitializeRequest(req.body) || (req.body && req.body.method === 'initialize'))) {
            try {
                const preSid = randomUUID();
                record = await createMcpServer(preSid);
                // Expose session id on first initialize response for client convenience
                try {
                    res.setHeader('Mcp-Session-Id', preSid);
                } catch {}
            } catch (e) {
                // Log detailed error to help diagnose 500s on initialize
                // eslint-disable-next-line no-console
                console.error('[MCP HTTP] createMcpServer failed:', e);
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Initialization failed',
                        data: String(e instanceof Error ? e.message : e),
                    },
                    id: req.body?.id ?? null,
                });
                return;
            }
            const transport = record.transport;
            // When session is initialized, store it
            transport.onsessioninitialized = (sid: string) => {
                sessions[sid] = record!;
                try {
                    res.setHeader('Mcp-Session-Id', sid);
                } catch {}
            };
            transport.onclose = () => {
                if (transport.sessionId) delete sessions[transport.sessionId];
            };

            // Some clients omit Accept; the SDK transport can respond 406.
            // Be lenient for initialize: ensure Accept includes JSON and event-stream.
            const accepts = (req.headers['accept'] as string | undefined) || '';
            const needJson = !/application\/json/i.test(accepts);
            const needSse = !/text\/event-stream/i.test(accepts);
            if (needJson || needSse) {
                try {
                    const merged = [
                        ...(accepts
                            ? accepts
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                            : []),
                        ...(needJson ? ['application/json'] : []),
                        ...(needSse ? ['text/event-stream'] : []),
                    ]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(', ');
                    (req.headers as any)['accept'] = merged;
                } catch {}
            }
            // Also ensure Content-Type is application/json for POST initialize
            if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) {
                (req.headers as any)['content-type'] = 'application/json';
            }
        } else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                id: null,
            });
            return;
        }

        try {
            await record!.transport.handleRequest(req as any, res as any, req.body);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[MCP HTTP] handleRequest error:', e);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                        data: String(e instanceof Error ? e.message : e),
                    },
                    id: req.body?.id ?? null,
                });
            }
            return;
        }

        // After handling initialize, Streamable HTTP transport may have assigned a session ID
        // Ensure it's stored so subsequent requests can resolve the session without requiring
        // a prior GET /mcp handshake (fixes chicken-and-egg for list/call via HTTP)
        const sid = (record!.transport as any).sessionId as string | undefined;
        if (sid && !sessions[sid]) {
            sessions[sid] = record!;
        }
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[MCP HTTP] Uncaught error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                    data: String(error instanceof Error ? error.message : error),
                },
                id: req.body?.id ?? null,
            });
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
    const hb = setInterval(() => send('heartbeat', {}), 15000);

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
let server: any = null;
(async () => {
    server = app.listen(PORT, HOST, () => {
        console.log(`MCP Streamable HTTP server listening at http://${HOST}:${(server.address() as any).port}`);
    });
})().catch((e) => {
    console.error('Failed to start MCP HTTP server:', e);
    process.exit(1);
});
