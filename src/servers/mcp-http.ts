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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
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
import { z } from 'zod';
import cors from 'cors';
import { EventEmitter } from 'events';
import express from 'express';
import { MCPAdapter } from '../adapters/mcp-adapter.js';
import { isCoreError } from '../core/errors.js';
import { toMcpError } from '../adapters/error-mapper.js';
import { createDefaultCoreConfig } from '../adapters/utils.js';
import { getEnvironmentConfig } from '../core/config/server-config.js';
import { createCodeAnalyzer } from '../core/index';
import { overlayStore } from '../core/overlay-store.js';
import { ToolExecutor } from '../core/tools/executor.js';
import type { CodeAnalyzer } from '../core/unified-analyzer';

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

// In-memory session map
const sessions: Record<string, SessionRecord> = {};
const mcpEvents = new EventEmitter();

async function createMcpServer(): Promise<SessionRecord> {
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
            const sid = transport.sessionId || 'unknown';
            mcpEvents.emit('toolCall', { sessionId: sid, name, args, ts: Date.now() });
            return await executor.execute(adapter, name, (args || {}) as Record<string, any>);
        } catch (error) {
            const sid = transport.sessionId || 'unknown';
            mcpEvents.emit('toolError', {
                sessionId: sid,
                name,
                error: error instanceof Error ? error.message : String(error),
                ts: Date.now(),
            });
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
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            // Attach after connect
        },
    });

    // Connect server to transport
    await server.connect(transport);

    // Prompts via SDK registerPrompt
    const suggestSymbols = (value: string) =>
        ['HTTPServer', 'TestClass', 'CodeAnalyzer', 'TestFunction'].filter((s) => s.toLowerCase().startsWith((value || '').toLowerCase()));
    const suggestFiles = (value: string) =>
        ['src/servers/http.ts', 'tests/fixtures/example.ts', 'src/core/unified-analyzer.ts'].filter((p) =>
            p.toLowerCase().includes((value || '').toLowerCase())
        );
    const suggestCommands = (value: string) =>
        ['bun run build:all', 'bun test -q', 'bun run build:tsc'].filter((c) => c.toLowerCase().startsWith((value || '').toLowerCase()));

    server.registerPrompt(
        'plan-safe-rename',
        {
            title: 'Plan Safe Rename',
            description: 'Plan a safe rename and optionally run checks in a snapshot',
            argsSchema: z.object({
                oldName: completable(z.string(), (v) => suggestSymbols(v || '')),
                newName: completable(z.string(), (v) => suggestSymbols(v || '')),
                file: completable(z.string().optional(), (v) => suggestFiles(v || '')),
                runChecks: z.boolean().optional(),
                command: completable(z.string().optional(), (v) => suggestCommands(v || '')),
            }),
        },
        ({ oldName, newName, file = 'file://workspace', runChecks = true, command = 'bun run build:all' }) => ({
            messages: [
                {
                    role: 'system',
                    content: { type: 'text', text: 'Use plan_rename first; for application use workflow_safe_rename into a snapshot. Prefer AST‑validated hits.' },
                },
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Intent: rename ${oldName} -> ${newName} at ${file}\nSteps:\n1) tools/call plan_rename { oldName: "${oldName}", newName: "${newName}", file: "${file}" }\n2) tools/call workflow_safe_rename { oldName: "${oldName}", newName: "${newName}", file: "${file}", runChecks: ${runChecks}, commands: ["${command}"], timeoutSec: 180 }`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'investigate-symbol',
        {
            title: 'Investigate Symbol',
            description: 'Explore, build symbol map (AST-only), and expand graph neighbors',
            argsSchema: z.object({
                symbol: completable(z.string(), (v) => suggestSymbols(v || '')),
                file: completable(z.string().optional(), (v) => suggestFiles(v || '')),
                conceptual: z.boolean().optional(),
            }),
        },
        ({ symbol, file = 'file://workspace', conceptual = false }) => ({
            messages: [
                {
                    role: 'system',
                    content: {
                        type: 'text',
                        text: 'Start broad with explore_codebase (optionally conceptual), then build_symbol_map (astOnly), then graph_expand imports/exports.',
                    },
                },
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Target: ${symbol} at ${file}\nSuggested tools:\n- tools/call explore_codebase { symbol: "${symbol}", file: "${file}", conceptual: ${conceptual} }\n- tools/call build_symbol_map { symbol: "${symbol}", file: "${file}", maxFiles: 10, astOnly: true }\n- tools/call graph_expand { symbol: "${symbol}", edges: ["imports","exports"], depth: 1, limit: 50 }`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'quick-patch-checks',
        {
            title: 'Quick Patch Checks',
            description: 'Stage a unified diff to snapshot and run checks',
            argsSchema: z.object({
                command: completable(z.string().optional(), (v) => suggestCommands(v || '')),
                timeoutSec: z.number().optional(),
            }),
        },
        ({ command = 'bun run build:all', timeoutSec = 180 }) => ({
            messages: [
                {
                    role: 'system',
                    content: {
                        type: 'text',
                        text: 'Use get_snapshot + propose_patch + run_checks, keeping edits isolated in snapshot.',
                    },
                },
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Suggested calls:\n- tools/call get_snapshot { preferExisting: true }\n- tools/call propose_patch { snapshot: <id>, patch: <unified_diff> }\n- tools/call run_checks { snapshot: <id>, commands: ["${command}"], timeoutSec: ${timeoutSec} }`,
                    },
                },
            ],
        })
    );

    // Resource handlers (monitoring + snapshot resources)
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
            {
                uri: 'monitoring://summary',
                name: 'monitoring',
                title: 'Monitoring Summary',
                description: 'System health and layer stats',
                mimeType: 'application/json',
            },
        ],
    }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
        resourceTemplates: [
            {
                name: 'snapshot-diff',
                uriTemplate: 'snapshot://{id}/overlay.diff',
                title: 'Snapshot Patch Diff',
                description: 'Staged diff for a snapshot',
                mimeType: 'text/plain',
            },
            {
                name: 'snapshot-status',
                uriTemplate: 'snapshot://{id}/status',
                title: 'Snapshot Status',
                description: 'Snapshot metadata and staged changes',
                mimeType: 'application/json',
            },
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
                    try {
                        text = await fs.readFile(diffPath, 'utf8');
                    } catch {
                        text = '# No overlay.diff found in snapshot';
                    }
                    return { contents: [{ uri: uri.href, mimeType: 'text/plain', text }] } as any;
                }
                if (tail === 'status') {
                    const snaps = (overlayStore as any).list?.() || [];
                    const snap = snaps.find((s: any) => s.id === id) || null;
                    const body = JSON.stringify(
                        { id, exists: !!snap, diffCount: snap?.diffs?.length || 0, createdAt: snap?.createdAt || null },
                        null,
                        2
                    );
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
        } else if (
            !sessionId && (isInitializeRequest(req.body) || (req.body && req.body.method === 'initialize'))
        ) {
            try {
                record = await createMcpServer();
            } catch (e) {
                // Log detailed error to help diagnose 500s on initialize
                // eslint-disable-next-line no-console
                console.error('[MCP HTTP] createMcpServer failed:', e);
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Initialization failed', data: String(e instanceof Error ? e.message : e) },
                    id: req.body?.id ?? null,
                });
                return;
            }
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

        try {
            await record!.transport.handleRequest(req as any, res as any, req.body);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[MCP HTTP] handleRequest error:', e);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error', data: String(e instanceof Error ? e.message : e) },
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
                error: { code: -32603, message: 'Internal server error', data: String(error instanceof Error ? error.message : error) },
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
