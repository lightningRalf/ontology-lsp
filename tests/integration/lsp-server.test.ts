import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('LSP Server Integration Tests', () => {
    let serverProcess: ChildProcess;
    let serverReady = false;

    beforeAll(async () => {
        // Start the LSP server
        const serverPath = path.join(__dirname, '../../dist/server.js');
        serverProcess = spawn('bun', ['run', serverPath, '--stdio'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Wait for server to be ready
        await new Promise<void>((resolve) => {
            serverProcess.stdout?.on('data', (data) => {
                const message = data.toString();
                if (message.includes('Initialized') || message.includes('ready')) {
                    serverReady = true;
                    resolve();
                }
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                serverReady = true;
                resolve();
            }, 5000);
        });
    });

    afterAll(() => {
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    test('Server responds to initialize request', async () => {
        const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {}
            }
        };

        const response = await sendRequest(serverProcess, initRequest);
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('capabilities');
    });

    test('Server handles hover request', async () => {
        const hoverRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'textDocument/hover',
            params: {
                textDocument: { uri: 'file:///test/file.ts' },
                position: { line: 0, character: 0 }
            }
        };

        const response = await sendRequest(serverProcess, hoverRequest);
        expect(response).toBeDefined();
    });

    test('Server handles definition request', async () => {
        const defRequest = {
            jsonrpc: '2.0',
            id: 3,
            method: 'textDocument/definition',
            params: {
                textDocument: { uri: 'file:///test/file.ts' },
                position: { line: 0, character: 0 }
            }
        };

        const response = await sendRequest(serverProcess, defRequest);
        expect(response).toBeDefined();
    });

    test('Server handles custom ontology requests', async () => {
        const statsRequest = {
            jsonrpc: '2.0',
            id: 4,
            method: 'ontology/getStatistics',
            params: {}
        };

        const response = await sendRequest(serverProcess, statsRequest);
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('ontology');
        expect(response.result).toHaveProperty('patterns');
    });

    test('Server handles concept graph request', async () => {
        const graphRequest = {
            jsonrpc: '2.0',
            id: 5,
            method: 'ontology/getConceptGraph',
            params: {}
        };

        const response = await sendRequest(serverProcess, graphRequest);
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('nodes');
        expect(response.result).toHaveProperty('edges');
    });
});

async function sendRequest(process: ChildProcess, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const content = JSON.stringify(request);
        const message = `Content-Length: ${content.length}\r\n\r\n${content}`;
        
        process.stdin?.write(message);
        
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 3000);

        process.stdout?.once('data', (data) => {
            clearTimeout(timeout);
            const response = parseResponse(data.toString());
            resolve(response);
        });
    });
}

function parseResponse(data: string): any {
    const lines = data.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('{')) {
            try {
                return JSON.parse(lines[i]);
            } catch {
                continue;
            }
        }
    }
    return null;
}